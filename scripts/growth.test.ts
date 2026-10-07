import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { applyReview, createReviewToken, verifyReviewToken } from "@/lib/growth/approval";
import { loadGrowthConfig } from "@/lib/growth/config";
import { createLlm } from "@/lib/growth/llm";
import { createLogger } from "@/lib/growth/log";
import { createGrowthContext, reviewDecision, runContentPipeline, runGrowthJob, runProductUpdate } from "@/lib/growth/pipeline";
import { HttpError, withRetry } from "@/lib/growth/retry";
import { blogPostSchema, socialPackSchema, toGeminiSchema } from "@/lib/growth/schemas";
import { memoryGrowthStore } from "@/lib/growth/store";
import { createAdsTool, decideAdAction } from "@/lib/growth/tools/ads";

const SECRET = "x".repeat(40);
const lines: string[] = [];
const logger = createLogger({ test: true }, (line) => void lines.push(line));
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockContext(env: Record<string, string> = {}) {
  const config = loadGrowthConfig({ NODE_ENV: "test", GROWTH_APPROVAL_SECRET: SECRET, ...env });
  const store = memoryGrowthStore();
  return { ctx: createGrowthContext({ config, store, logger, dryRun: true }), store };
}

const validPost = () => ({
  title: "How to find beta testers for your app",
  slug: "find-beta-testers",
  metaDescription: "A practical guide to find beta testers for app releases: where to recruit, what to pay and how to keep testers engaged until launch.",
  excerpt: "Where to recruit, what to pay and how to keep testers engaged.",
  targetKeyword: "find beta testers for app",
  secondaryKeywords: [],
  tags: ["beta testing"],
  markdownBody: `## Why you need to find beta testers for app releases\n\n${"Real testers catch real problems. ".repeat(90)}`,
  faq: [],
  callToAction: "Plan your first cohort on SeedEnv.",
});

describe("growth schemas", () => {
  it("accepts a valid blog post and rejects H1s, raw HTML and missing keywords", () => {
    assert.equal(blogPostSchema.safeParse(validPost()).success, true);
    assert.equal(blogPostSchema.safeParse({ ...validPost(), markdownBody: `# Title\n\n${validPost().markdownBody}` }).success, false);
    assert.equal(blogPostSchema.safeParse({ ...validPost(), markdownBody: `${validPost().markdownBody}<script>alert(1)</script>` }).success, false);
    assert.equal(blogPostSchema.safeParse({ ...validPost(), targetKeyword: "unrelated phrase" }).success, false);
  });

  it("enforces per-platform social limits and keeps links out of generated copy", () => {
    const pack = { twitter: { text: "A".repeat(60), hashtags: ["#indiedev"] }, linkedin: { text: "B".repeat(400), hashtags: [] }, instagram: { caption: "C".repeat(120), hashtags: [], imageAltText: "Title card image" }, tiktok: { caption: "D".repeat(80), hashtags: ["#buildinpublic"], hook: "Your beta testers are lying to you", beats: [1, 2, 3].map((n) => ({ visual: `Shot ${n}`, voiceover: `Line ${n}`, onScreenText: "" })), durationSeconds: 30 } };
    assert.equal(socialPackSchema.safeParse(pack).success, true);
    assert.equal(socialPackSchema.safeParse({ ...pack, twitter: { text: "A".repeat(250), hashtags: ["#indiedev", "#buildinpublic"] } }).success, false);
    assert.equal(socialPackSchema.safeParse({ ...pack, instagram: { ...pack.instagram, caption: `${"C".repeat(120)} https://seedenv.com` } }).success, false);
    assert.equal(socialPackSchema.safeParse({ ...pack, linkedin: { text: `${"B".repeat(400)} https://seedenv.com`, hashtags: [] } }).success, false);
  });

  it("converts Zod schemas to the JSON Schema subset Gemini accepts", () => {
    const json = JSON.stringify(toGeminiSchema(blogPostSchema));
    for (const unsupported of ['"minLength"', '"maxLength"', '"pattern"', '"$schema"', '"additionalProperties"']) assert.equal(json.includes(unsupported), false, unsupported);
    assert.match(json, /max 70 chars/);
  });
});

describe("gemini adapter", () => {
  it("runs the function-calling loop and repairs invalid structured output", async () => {
    const requests: Array<{ contents: unknown[]; config: Record<string, unknown> }> = [];
    const replies: unknown[] = [
      { functionCalls: [{ id: "c1", name: "lookup", args: { keyword: "beta" } }], candidates: [{ content: { role: "model", parts: [{ functionCall: { id: "c1", name: "lookup", args: { keyword: "beta" } } }] } }] },
      { text: "Use beta." },
      { text: "{\"answer\": 5}" },
      { text: "{\"answer\": \"ok\"}" },
    ];
    const models = { generateContent: async (request: { contents: unknown[]; config: Record<string, unknown> }) => { requests.push({ contents: [...request.contents], config: request.config }); return replies.shift(); } };
    const llm = createLlm(loadGrowthConfig({ NODE_ENV: "test" }).llm, logger, models as never);
    const seen: unknown[] = [];
    const notes = await llm.runTools({ agent: "t", system: "s", prompt: "p", tools: { lookup: { declaration: { name: "lookup" }, execute: async (args) => { seen.push(args); return { volume: 10 }; } } }, mock: async () => "" });
    assert.equal(notes, "Use beta.");
    assert.deepEqual(seen, [{ keyword: "beta" }]);
    assert.equal(requests[1].contents.length, 3);
    const { z } = await import("zod");
    const value = await llm.generateStructured({ agent: "t", system: "s", prompt: "p", schema: z.object({ answer: z.string() }), mock: () => ({ answer: "" }) });
    assert.deepEqual(value, { answer: "ok" });
    assert.equal(requests[2].config.responseMimeType, "application/json");
    assert.match(JSON.stringify(requests[3].contents.at(-1)), /failed validation/);
  });
});

describe("growth config", () => {
  it("falls back to mocks in development but disables adapters in production without credentials", () => {
    assert.equal(loadGrowthConfig({ NODE_ENV: "development" }).llm.mode, "mock");
    const prod = loadGrowthConfig({ NODE_ENV: "production" });
    assert.deepEqual([prod.enabled, prod.llm.mode, prod.keywords.mode, prod.social.mode, prod.ads.mode, prod.ads.enforce], [false, "disabled", "disabled", "disabled", "disabled", false]);
    assert.equal(loadGrowthConfig({ NODE_ENV: "production", GEMINI_API_KEY: "k" }).llm.mode, "live");
    assert.equal(loadGrowthConfig({ NODE_ENV: "production", META_AD_ACCOUNT_ID: "123", META_ADS_ACCESS_TOKEN: "t" }).ads.accountId, "act_123");
    assert.throws(() => loadGrowthConfig({ GROWTH_APPROVAL_SECRET: "short" }), /GROWTH_APPROVAL_SECRET/);
  });
});

describe("retry", () => {
  it("honours Retry-After on 429 and stops immediately on 4xx", async () => {
    const waits: number[] = [];
    let calls = 0;
    const value = await withRetry(async () => {
      calls += 1;
      if (calls === 1) throw new HttpError("rate limited", 429, 1500);
      return "ok";
    }, { label: "t", sleep: async (ms) => void waits.push(ms) });
    assert.equal(value, "ok");
    assert.deepEqual(waits, [1500]);

    let badCalls = 0;
    await assert.rejects(withRetry(async () => {
      badCalls += 1;
      throw new HttpError("bad request", 400);
    }, { label: "t", sleep: async () => undefined }), /bad request/);
    assert.equal(badCalls, 1);
  });
});

describe("ad kill-switch", () => {
  const policy = { thresholdCpa: 25, minSpend: 10, alertRatio: 0.8 };
  const row = (spend: number, conversions: number) => ({ provider: "meta", campaignId: "1", campaignName: "c", spend, impressions: 1000, conversions });

  it("decides deterministically", () => {
    assert.equal(decideAdAction(row(5, 0), policy).action, "MAINTAINED");
    assert.equal(decideAdAction(row(30, 0), policy).action, "PAUSED");
    assert.equal(decideAdAction(row(21, 0), policy).action, "ALERTED");
    assert.equal(decideAdAction(row(120, 3), policy).action, "PAUSED");
    assert.equal(decideAdAction(row(88, 4), policy).action, "ALERTED");
    assert.equal(decideAdAction(row(100, 10), policy).action, "MAINTAINED");
  });

  for (const enforce of [false, true]) {
    it(`${enforce ? "pauses" : "only alerts on"} over-limit Meta campaigns when enforcement is ${enforce}`, async () => {
      const posts: string[] = [];
      globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") {
          posts.push(url);
          return Response.json({ success: true });
        }
        assert.match(url, /\/act_42\/insights\?/);
        return Response.json({ data: [{ campaign_id: "99", campaign_name: "Burning", spend: "60.00", impressions: "5000", actions: [] }, { campaign_id: "100", campaign_name: "Fine", spend: "50", impressions: "5000", actions: [{ action_type: "offsite_conversion.fb_pixel_complete_registration", value: "5" }] }] });
      }) as typeof fetch;
      const config = loadGrowthConfig({ NODE_ENV: "production", META_ADS_ACCESS_TOKEN: "tok", META_AD_ACCOUNT_ID: "42", AD_KILLSWITCH_ENFORCE: String(enforce) });
      const report = await createAdsTool(config.ads, logger).checkAdPerformanceAndKillswitch();
      assert.deepEqual(report.results.map((item) => item.decision.action), [enforce ? "PAUSED" : "ALERTED", "MAINTAINED"]);
      assert.equal(posts.length, enforce ? 1 : 0);
      if (enforce) assert.match(posts[0], /graph\.facebook\.com\/v\d+\.\d+\/99$/);
      else assert.match(report.results[0].decision.reason, /dry run/);
    });
  }
});

describe("content pipeline and review gates", () => {
  it("drafts an article plus four social posts, all awaiting approval", async () => {
    const { ctx, store } = mockContext();
    const result = await runContentPipeline(ctx);
    assert.equal(result.status, "drafted");
    const drop = [...store.drops.values()][0];
    assert.equal(drop.status, "DRAFTED");
    assert.ok(drop.markdownBody && drop.markdownBody.length >= 2500);
    const social = [...store.social.values()];
    assert.deepEqual(social.map((row) => row.platform).sort(), ["INSTAGRAM", "LINKEDIN", "TIKTOK", "TWITTER"]);
    assert.ok(social.every((row) => row.status === "PENDING_APPROVAL"));
    const tiktok = social.find((row) => row.platform === "TIKTOK")!;
    assert.ok((tiktok.videoScript as { beats: unknown[] }).beats.length >= 3);
    assert.equal((await runContentPipeline(ctx)).status, "skipped");
  });

  it("verifies review tokens and rejects tampering and expiry", () => {
    const token = createReviewToken(SECRET, { kind: "content", id: "abc" }, 1_000);
    assert.deepEqual(verifyReviewToken(SECRET, token, 2_000), { kind: "content", id: "abc", exp: 1_000 + 14 * 86_400_000 });
    assert.equal(verifyReviewToken(SECRET, token, 1_000 + 15 * 86_400_000), null);
    assert.equal(verifyReviewToken("y".repeat(40), token, 2_000), null);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ kind: "content", id: "other", exp: 9e15 })).toString("base64url");
    assert.equal(verifyReviewToken(SECRET, `${forged}.${sig}`, 2_000), null);
    assert.equal(verifyReviewToken(SECRET, `${body}.${sig}x`, 2_000), null);
  });

  it("blocks social posts until the article is published, publishes once and appends the link", async () => {
    const { ctx, store } = mockContext();
    const result = await runContentPipeline(ctx);
    assert.equal(result.status, "drafted");
    if (result.status !== "drafted") return;
    const twitter = [...store.social.values()].find((row) => row.platform === "TWITTER")!;

    const early = await reviewDecision(ctx, { kind: "social", id: twitter.id, exp: 0 }, "approve");
    assert.equal(early.ok, false);
    assert.match(early.message, /article first/);

    const approved = await reviewDecision(ctx, { kind: "content", id: result.contentDropId, exp: 0 }, "approve");
    assert.equal(approved.ok, true, approved.message);
    assert.equal(store.drops.get(result.contentDropId)!.status, "PUBLISHED");
    const again = await reviewDecision(ctx, { kind: "content", id: result.contentDropId, exp: 0 }, "approve");
    assert.equal(again.ok, false);

    const queued: string[] = [];
    const social = { mode: "mock" as const, queueSocialPost: async (_platform: string, text: string) => { queued.push(text); return { externalId: "ext_1", scheduledTime: new Date(), mode: "mock" as const }; } };
    const outcome = await applyReview({ store: ctx.store, cms: ctx.cms, social, siteUrl: ctx.config.siteUrl, logger }, { kind: "social", id: twitter.id, exp: 0 }, "approve");
    assert.equal(outcome.ok, true, outcome.message);
    assert.match(queued[0], new RegExp(`https://seedenv.com/blog/${result.slug}$`));
    assert.equal(store.social.get(twitter.id)!.status, "QUEUED");
    assert.equal(store.social.get(twitter.id)!.externalId, "ext_1");
    assert.equal((await reviewDecision(ctx, { kind: "social", id: twitter.id, exp: 0 }, "approve")).ok, false);
  });

  it("marks a social post FAILED when scheduling fails so it can be retried", async () => {
    const { ctx, store } = mockContext();
    const result = await runContentPipeline(ctx);
    if (result.status !== "drafted") assert.fail("expected draft");
    await reviewDecision(ctx, { kind: "content", id: result.contentDropId, exp: 0 }, "approve");
    const post = [...store.social.values()][0];
    const failing = { mode: "live" as const, queueSocialPost: async () => { throw new Error("Ayrshare 500"); } };
    const outcome = await applyReview({ store: ctx.store, cms: ctx.cms, social: failing, siteUrl: ctx.config.siteUrl, logger }, { kind: "social", id: post.id, exp: 0 }, "approve");
    assert.equal(outcome.ok, false);
    assert.equal(store.social.get(post.id)!.status, "FAILED");
    assert.equal((await reviewDecision(ctx, { kind: "social", id: post.id, exp: 0 }, "reject")).ok, true);
  });

  it("hands TikTok off for manual posting and lets it be marked as posted", async () => {
    const { ctx, store } = mockContext();
    const result = await runContentPipeline(ctx);
    if (result.status !== "drafted") assert.fail("expected draft");
    await reviewDecision(ctx, { kind: "content", id: result.contentDropId, exp: 0 }, "approve");
    const tiktok = [...store.social.values()].find((row) => row.platform === "TIKTOK")!;
    const queued: string[] = [];
    const social = { mode: "live" as const, queueSocialPost: async (_p: string, text: string) => { queued.push(text); return { externalId: "x", scheduledTime: new Date(), mode: "live" as const }; } };
    const deps = { store: ctx.store, cms: ctx.cms, social, siteUrl: ctx.config.siteUrl, logger };
    assert.equal((await applyReview(deps, { kind: "social", id: tiktok.id, exp: 0 }, "posted")).ok, false);
    const approved = await applyReview(deps, { kind: "social", id: tiktok.id, exp: 0 }, "approve");
    assert.equal(approved.ok, true, approved.message);
    assert.equal(queued.length, 0);
    assert.equal(store.social.get(tiktok.id)!.status, "MANUAL");
    assert.doesNotMatch(store.social.get(tiktok.id)!.postText, /https?:/);
    assert.equal((await applyReview(deps, { kind: "social", id: tiktok.id, exp: 0 }, "approve")).ok, false);
    assert.equal((await applyReview(deps, { kind: "social", id: tiktok.id, exp: 0 }, "posted")).ok, true);
    assert.equal(store.social.get(tiktok.id)!.status, "PUBLISHED");
  });

  it("falls back to manual posting when no scheduler is connected", async () => {
    const { ctx, store } = mockContext();
    const result = await runContentPipeline(ctx);
    if (result.status !== "drafted") assert.fail("expected draft");
    await reviewDecision(ctx, { kind: "content", id: result.contentDropId, exp: 0 }, "approve");
    const linkedin = [...store.social.values()].find((row) => row.platform === "LINKEDIN")!;
    const disabled = { mode: "disabled" as const, queueSocialPost: async () => assert.fail("must not call the scheduler") };
    const outcome = await applyReview({ store: ctx.store, cms: ctx.cms, social: disabled, siteUrl: ctx.config.siteUrl, logger }, { kind: "social", id: linkedin.id, exp: 0 }, "approve");
    assert.equal(outcome.ok, true, outcome.message);
    assert.equal(store.social.get(linkedin.id)!.status, "MANUAL");
    assert.match(store.social.get(linkedin.id)!.postText, new RegExp(`/blog/${result.slug}$`));
  });

  it("drafts product-update posts without an article and links them to the given URL", async () => {
    const { ctx, store } = mockContext();
    await assert.rejects(runProductUpdate(ctx, { details: "too short" }));
    await assert.rejects(runProductUpdate(ctx, { details: "Testers now get paid within 24 hours of approval.", linkUrl: "http://insecure.example" }));
    const result = await runProductUpdate(ctx, { details: "Testers now get paid within 24 hours of an approved report.", linkUrl: "https://seedenv.com/pricing" });
    assert.equal(result.socialPostIds.length, 4);
    const rows = [...store.social.values()];
    assert.ok(rows.every((row) => row.contentDropId === null && row.linkUrl === "https://seedenv.com/pricing" && row.status === "PENDING_APPROVAL"));
    assert.equal(store.drops.size, 0);
    const twitter = rows.find((row) => row.platform === "TWITTER")!;
    const queued: string[] = [];
    const social = { mode: "mock" as const, queueSocialPost: async (_p: string, text: string) => { queued.push(text); return { externalId: "x", scheduledTime: new Date(), mode: "mock" as const }; } };
    const outcome = await applyReview({ store: ctx.store, cms: ctx.cms, social, siteUrl: ctx.config.siteUrl, logger }, { kind: "social", id: twitter.id, exp: 0 }, "approve");
    assert.equal(outcome.ok, true, outcome.message);
    assert.match(queued[0], /https:\/\/seedenv\.com\/pricing$/);
  });

  it("isolates job failures and still runs the ad check", async () => {
    const { ctx } = mockContext();
    const broken = { ...ctx, llm: { ...ctx.llm, runTools: async () => { throw new Error("model down"); } } };
    const result = await runGrowthJob(broken, "all");
    assert.equal(result.ok, false);
    assert.deepEqual((result as Record<string, unknown>).content, { status: "failed", error: "model down" });
    assert.equal(((result as Record<string, unknown>).ads as { checked: number }).checked, 3);
  });
});

describe("cron route", () => {
  it("requires the cron secret and stays inert until enabled", async () => {
    process.env.CRON_SECRET = "cron-test-secret";
    delete process.env.GROWTH_ENABLED;
    const { POST } = await import("@/app/api/cron/growth/[job]/route");
    const { NextRequest } = await import("next/server");
    const params = Promise.resolve({ job: "content" });
    assert.equal((await POST(new NextRequest("https://seedenv.com/api/cron/growth/content", { method: "POST" }), { params })).status, 401);
    const response = await POST(new NextRequest("https://seedenv.com/api/cron/growth/content", { method: "POST", headers: { authorization: "Bearer cron-test-secret" } }), { params });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, skipped: true, reason: "GROWTH_ENABLED is not true" });
  });
});
