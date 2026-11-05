import assert from "node:assert/strict";
import test, { beforeEach, mock } from "node:test";

// Stub Prisma and Stripe before importing anything that reaches them, so these tests never touch real services.
const prismaStub: Record<string, unknown> = {};
const stripeStub: Record<string, unknown> = {};
mock.module("../lib/prisma.ts", { namedExports: { prisma: prismaStub } });
mock.module("../lib/stripe.ts", { namedExports: { getStripe: () => stripeStub } });
const scoring = import("../lib/swarm-api/scoring");
const input = import("../lib/swarm-api/input");
const plans = import("../lib/swarm-api/plans");
const security = import("../lib/swarm-api/security");
const rateLimit = import("../lib/swarm-api/rate-limit");
const billing = import("../lib/swarm-api/billing");
const moderateRoute = import("../app/api/v1/moderate/route");
const webhookRoute = import("../app/api/swarm-api/webhook/route");

const SALT = "test-salt";
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 13, 12, minutes));

beforeEach(async () => {
  for (const key of Object.keys(prismaStub)) delete prismaStub[key];
  for (const key of Object.keys(stripeStub)) delete stripeStub[key];
  (await rateLimit).resetApiRateLimits();
});

test("organic, distinct comments are allowed with no signals", async () => {
  const { fingerprintComment, scoreComment } = await scoring;
  const history = [
    fingerprintComment(SALT, { text: "Loved the new onboarding flow, much faster than before", authorId: "a", threadId: "t", postedAt: at(0) }),
    fingerprintComment(SALT, { text: "The dark mode colors look washed out on my Pixel screen", authorId: "b", threadId: "t", postedAt: at(2) }),
  ];
  const current = fingerprintComment(SALT, { text: "Any plans for an offline mode? I travel a lot without signal", authorId: "c", threadId: "t", postedAt: at(3) });
  const result = scoreComment(current, history);
  assert.equal(result.action, "allow");
  assert.equal(result.score, 0);
  assert.deepEqual(result.signals, []);
});

test("copy-paste swarm across many accounts in one burst is held", async () => {
  const { fingerprintComment, scoreComment } = await scoring;
  const script = "This company is a total scam everyone should cancel their subscription right now";
  const history = ["b", "c", "d", "e", "f"].map((author, index) => fingerprintComment(SALT, { text: script, authorId: author, threadId: "post-1", postedAt: at(index) }));
  const current = fingerprintComment(SALT, { text: script, authorId: "g", threadId: "post-1", postedAt: at(6) });
  const result = scoreComment(current, history, { authorAccountAgeDays: 0.5 });
  assert.equal(result.action, "hold");
  assert.equal(result.cluster.size, 5);
  const codes = result.signals.map((signal) => signal.code);
  for (const code of ["copy_paste_cluster", "coordinated_phrasing", "burst_window", "same_thread_brigade", "new_account"]) assert.ok(codes.includes(code as never), code);
  assert.ok(result.score <= 100);
});

test("short generic replies never form clusters", async () => {
  const { fingerprintComment, scoreComment } = await scoring;
  const history = ["a", "b", "c", "d"].map((author) => fingerprintComment(SALT, { text: "great video!", authorId: author, threadId: "t", postedAt: at(1) }));
  const result = scoreComment(fingerprintComment(SALT, { text: "Great video!!", authorId: "z", threadId: "t", postedAt: at(2) }), history);
  assert.equal(result.action, "allow");
});

test("the same author's own history does not count as coordination, but floods and cross-thread repeats do", async () => {
  const { fingerprintComment, scoreComment } = await scoring;
  const text = "Check out my channel for free giveaways every single day of the week";
  const history = Array.from({ length: 6 }, (_, index) => fingerprintComment(SALT, { text, authorId: "spammer", threadId: `thread-${index}`, postedAt: at(index) }));
  const result = scoreComment(fingerprintComment(SALT, { text, authorId: "spammer", threadId: "thread-x", postedAt: at(7) }), history);
  const codes = result.signals.map((signal) => signal.code);
  assert.equal(result.cluster.size, 0);
  assert.ok(codes.includes("author_flood"));
  assert.ok(codes.includes("self_repeat"));
  assert.equal(result.action, "review");
});

test("fingerprints are salted per account and contain no plaintext", async () => {
  const { fingerprintComment } = await scoring;
  const text = "Secret launch details for the beta testers";
  const one = fingerprintComment("salt-one", { text, authorId: "user-1", threadId: "t", postedAt: at(0) });
  const two = fingerprintComment("salt-two", { text, authorId: "user-1", threadId: "t", postedAt: at(0) });
  assert.notEqual(one.authorHash, two.authorHash);
  assert.notEqual(one.textHash, two.textHash);
  const serialized = JSON.stringify(one).toLowerCase();
  for (const word of ["secret", "launch", "beta", "user-1"]) assert.ok(!serialized.includes(word), word);
});

test("custom thresholds change the recommended action", async () => {
  const { actionForScore } = await scoring;
  assert.equal(actionForScore(50), "review");
  assert.equal(actionForScore(50, { review: 20, hold: 45 }), "hold");
  assert.equal(actionForScore(10, { review: 20, hold: 45 }), "allow");
});

test("moderation requests are validated strictly and timestamps are clamped", async () => {
  const { parseModerationRequest } = await input;
  const now = at(30);
  assert.equal(parseModerationRequest({ authorId: "a" }, now).ok, false);
  assert.equal(parseModerationRequest({ text: "   ", authorId: "a" }, now).ok, false);
  assert.equal(parseModerationRequest({ text: "x".repeat(5001), authorId: "a" }, now).ok, false);
  const unknown = parseModerationRequest({ text: "hi", authorId: "a", extra: true }, now);
  assert.ok(!unknown.ok && unknown.error.includes("extra"));
  const inverted = parseModerationRequest({ text: "hi", authorId: "a", thresholds: { review: 80, hold: 50 } }, now);
  assert.ok(!inverted.ok && inverted.error.includes("review"));
  const future = parseModerationRequest({ text: "hi", authorId: "a", postedAt: "2030-01-01T00:00:00Z" }, now);
  assert.ok(future.ok && future.value.postedAt.getTime() === now.getTime());
  const recent = parseModerationRequest({ text: "hi", authorId: "a", postedAt: at(20).toISOString() }, now);
  assert.ok(recent.ok && recent.value.postedAt.getTime() === at(20).getTime());
  assert.ok(recent.ok && recent.value.thresholds.hold === 70);
});

test("paid limits apply only while Stripe reports the subscription as active", async () => {
  const { effectivePlan, planForLookupKey, usagePeriod, nextPeriodReset } = await plans;
  assert.equal(effectivePlan({ plan: "STARTER", subscriptionStatus: "active" }).monthlyChecks, 10_000);
  assert.equal(effectivePlan({ plan: "STARTER", subscriptionStatus: "active" }).priceCents, 1900);
  assert.equal(effectivePlan({ plan: "GROWTH", subscriptionStatus: "past_due" }).id, "SANDBOX");
  assert.equal(effectivePlan({ plan: "SCALE", subscriptionStatus: null }).id, "SANDBOX");
  assert.equal(effectivePlan({ plan: "SANDBOX", subscriptionStatus: null }).monthlyChecks, 500);
  assert.equal(planForLookupKey("seedenv_swarm_api_growth_monthly"), "GROWTH");
  assert.equal(planForLookupKey("something_else"), null);
  assert.equal(usagePeriod(new Date("2026-11-30T23:59:59Z")), "2026-11");
  assert.equal(nextPeriodReset(new Date("2026-12-15T00:00:00Z")).toISOString(), "2027-01-01T00:00:00.000Z");
});

test("API keys are high-entropy, hashed, and parsed only from bearer headers", async () => {
  const { generateApiKey, hashApiKey, readBearerKey } = await security;
  const one = generateApiKey();
  const two = generateApiKey();
  assert.notEqual(one.key, two.key);
  assert.ok(one.key.startsWith("sfk_live_") && one.key.length >= 40);
  assert.equal(one.keyHash, hashApiKey(one.key));
  assert.ok(!one.keyHash.includes(one.key));
  assert.ok(one.key.startsWith(one.prefix) && one.prefix.length < one.key.length);
  assert.equal(readBearerKey(`Bearer ${one.key}`), one.key);
  assert.equal(readBearerKey(one.key), null);
  assert.equal(readBearerKey("Bearer sk_live_not_ours_000000000000000000000000"), null);
});

test("webhook URLs reject SSRF targets and signatures verify with replay protection", async () => {
  const { validateWebhookUrl, isPrivateAddress, signWebhookPayload, verifyWebhookSignature } = await security;
  for (const url of ["http://example.com/hook", "https://localhost/hook", "https://127.0.0.1/hook", "https://[::1]/hook", "https://user:pass@example.com/", "https://example.com:8443/", "https://intranet/hook", "https://db.internal/hook", "notaurl"]) {
    assert.equal(validateWebhookUrl(url).ok, false, url);
  }
  assert.equal(validateWebhookUrl("https://hooks.example.com/seedenv").ok, true);
  for (const address of ["10.0.0.1", "172.16.5.4", "192.168.1.1", "169.254.169.254", "127.0.0.1", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) assert.ok(isPrivateAddress(address), address);
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) assert.ok(!isPrivateAddress(address), address);
  const body = JSON.stringify({ type: "comment.held" });
  const header = signWebhookPayload("whsec_test", body, 1_000);
  assert.ok(verifyWebhookSignature("whsec_test", body, header, 300, 1_100));
  assert.ok(!verifyWebhookSignature("whsec_test", `${body} `, header, 300, 1_100));
  assert.ok(!verifyWebhookSignature("whsec_other", body, header, 300, 1_100));
  assert.ok(!verifyWebhookSignature("whsec_test", body, header, 300, 2_000), "stale signatures are rejected");
});

test("rate limiting is per key with a sliding minute", async () => {
  const { allowApiRequest } = await rateLimit;
  assert.ok(allowApiRequest("k1", 2, 0).allowed);
  assert.ok(allowApiRequest("k1", 2, 1).allowed);
  const blocked = allowApiRequest("k1", 2, 2);
  assert.ok(!blocked.allowed && blocked.retryAfterSec === 60);
  assert.ok(allowApiRequest("k2", 2, 2).allowed, "other keys are independent");
  assert.ok(allowApiRequest("k1", 2, 60_001).allowed);
});

function moderationRequest(body: unknown, key = "sfk_live_abcdefghijklmnopqrstuvwxyz0123456789AB") {
  return new Request("https://seedenv.com/api/v1/moderate", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
}

function stubAccount(overrides: Record<string, unknown> = {}, used = 1) {
  const account = { id: "acct_1", userId: "user_1", plan: "SANDBOX", subscriptionStatus: null, fingerprintSalt: SALT, webhookUrl: null, webhookSecret: null, ...overrides };
  const created: unknown[] = [];
  prismaStub.swarmApiKey = { findUnique: async () => ({ id: "key_1", accountId: account.id, revokedAt: null, lastUsedAt: new Date(), account }), update: async () => ({}) };
  prismaStub.$queryRaw = async () => used > 0 ? [{ checks: used }] : [];
  prismaStub.swarmApiFingerprint = { findMany: async () => [], create: async ({ data }: { data: unknown }) => { created.push(data); return { id: "fp_1" }; } };
  prismaStub.swarmApiUsage = { update: async () => ({}) };
  return created;
}

test("moderate endpoint rejects missing or unknown keys and fails open", async () => {
  const { POST } = await moderateRoute;
  const missing = await POST(new Request("https://seedenv.com/api/v1/moderate", { method: "POST", body: "{}" }));
  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).action, "allow");
  prismaStub.swarmApiKey = { findUnique: async () => null };
  const unknown = await POST(moderationRequest({ text: "hi", authorId: "a" }));
  assert.equal(unknown.status, 401);
  prismaStub.swarmApiKey = { findUnique: async () => ({ id: "k", revokedAt: new Date(), account: {} }) };
  assert.equal((await POST(moderationRequest({ text: "hi", authorId: "a" }))).status, 401, "revoked keys are refused");
});

test("moderate endpoint scores a comment, stores a text-free fingerprint, and reports usage", async () => {
  const { POST } = await moderateRoute;
  const created = stubAccount({}, 12);
  const response = await POST(moderationRequest({ text: "Totally normal comment about the release notes today", authorId: "user-9", threadId: "post-2", commentId: "c-77" }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.action, "allow");
  assert.equal(body.commentId, "c-77");
  assert.equal(body.plan, "SANDBOX");
  assert.deepEqual({ used: body.usage.used, limit: body.usage.limit, remaining: body.usage.remaining }, { used: 12, limit: 500, remaining: 488 });
  assert.equal(created.length, 1);
  assert.ok(!JSON.stringify(created[0]).includes("release notes"), "comment text is never persisted");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("moderate endpoint enforces quota, validation, body size, and rate limits", async () => {
  const { POST } = await moderateRoute;
  stubAccount({}, 0);
  const exhausted = await POST(moderationRequest({ text: "hello there friends", authorId: "a" }));
  assert.equal(exhausted.status, 429);
  const exhaustedBody = await exhausted.json();
  assert.equal(exhaustedBody.error.code, "quota_exceeded");
  assert.equal(exhaustedBody.action, "allow");

  stubAccount();
  assert.equal((await POST(moderationRequest("{not json"))).status, 400);
  assert.equal((await (await POST(moderationRequest({ text: "hi" }))).json()).error.code, "invalid_request");
  assert.equal((await POST(moderationRequest(JSON.stringify({ text: "x".repeat(25_000), authorId: "a" })))).status, 413);

  (await rateLimit).resetApiRateLimits();
  let last: Response | null = null;
  for (let index = 0; index < 31; index += 1) last = await POST(moderationRequest({ text: "rate limit probe comment", authorId: "a" }));
  assert.equal(last?.status, 429);
  assert.equal((await last!.json()).error.code, "rate_limited");
  assert.ok(Number(last!.headers.get("retry-after")) > 0);
});

test("dashboard webhook routes refuse cross-site requests", async () => {
  const { PUT } = await webhookRoute;
  const response = await PUT(new Request("https://seedenv.com/api/swarm-api/webhook", { method: "PUT", headers: { Origin: "https://evil.example", Host: "seedenv.com" }, body: JSON.stringify({ url: "https://hooks.example.com" }) }));
  assert.equal(response.status, 403);
});

function stubSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: { type: "SEEDENV_SWARM_API", seedenvUserId: "user_1", plan: "STARTER" },
    items: { data: [{ id: "si_1", current_period_end: 1_800_000_000, price: { lookup_key: "seedenv_swarm_api_growth_monthly" } }] },
    ...overrides,
  };
}

test("subscription sync trusts Stripe's price, verifies the owner, and downgrades on cancellation", async () => {
  const { syncSwarmSubscription } = await billing;
  const updates: Array<Record<string, unknown>> = [];
  let subscription = stubSubscription();
  stripeStub.subscriptions = { retrieve: async () => subscription };
  prismaStub.user = { findUnique: async () => ({ stripeCustomerId: "cus_1" }) };
  prismaStub.swarmApiAccount = {
    findUnique: async () => ({ id: "acct_1", userId: "user_1", stripeSubscriptionId: null, subscriptionStatus: null }),
    update: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return {}; },
  };

  const synced = await syncSwarmSubscription("sub_1");
  assert.deepEqual(synced, { synced: true, plan: "GROWTH", status: "active" }, "the price lookup key wins over stale metadata");
  assert.equal(updates[0].stripeSubscriptionId, "sub_1");
  assert.equal((updates[0].currentPeriodEnd as Date).getTime(), 1_800_000_000_000);

  subscription = stubSubscription({ customer: "cus_attacker" });
  await assert.rejects(syncSwarmSubscription("sub_1"), /customer does not match/);
  await assert.rejects(syncSwarmSubscription("sub_1", "someone_else"), /owner does not match/);

  subscription = stubSubscription({ status: "canceled" });
  await syncSwarmSubscription("sub_1");
  assert.deepEqual(updates.at(-1), { plan: "SANDBOX", subscriptionStatus: "canceled", stripeSubscriptionId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false });

  subscription = stubSubscription({ metadata: { type: "SOMETHING_ELSE" } });
  assert.deepEqual(await syncSwarmSubscription("sub_1"), { ignored: true });
});

test("a stale second subscription cannot overwrite the live one", async () => {
  const { syncSwarmSubscription } = await billing;
  const updates: unknown[] = [];
  stripeStub.subscriptions = { retrieve: async () => stubSubscription({ id: "sub_old", status: "canceled" }) };
  prismaStub.user = { findUnique: async () => ({ stripeCustomerId: "cus_1" }) };
  prismaStub.swarmApiAccount = {
    findUnique: async () => ({ id: "acct_1", userId: "user_1", stripeSubscriptionId: "sub_live", subscriptionStatus: "active" }),
    update: async ({ data }: { data: unknown }) => { updates.push(data); return {}; },
  };
  assert.deepEqual(await syncSwarmSubscription("sub_old"), { ignored: true, reason: "superseded" });
  assert.equal(updates.length, 0);
});
