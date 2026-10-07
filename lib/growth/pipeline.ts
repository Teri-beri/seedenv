import type { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { applyReview, articleUrl, reviewUrl, type ReviewDecision, type ReviewTarget } from "@/lib/growth/approval";
import { runAdsAgent } from "@/lib/growth/agents/ads";
import { slugify, writeBlogPost, writeSocialPack } from "@/lib/growth/agents/copywriter";
import { runResearchAgent } from "@/lib/growth/agents/research";
import type { GrowthConfig } from "@/lib/growth/config";
import { createLlm } from "@/lib/growth/llm";
import { createLogger, type GrowthLogger } from "@/lib/growth/log";
import { createNotifier, type ReviewCard } from "@/lib/growth/notify";
import { productUpdateInputSchema, type BlogPost, type ProductUpdateInput, type SocialPack, type TikTokScript } from "@/lib/growth/schemas";
import type { GrowthStore, SocialRecord } from "@/lib/growth/store";
import { createAdsTool } from "@/lib/growth/tools/ads";
import { createCmsTool } from "@/lib/growth/tools/cms";
import { createKeywordTool } from "@/lib/growth/tools/keywords";
import { createSocialTool } from "@/lib/growth/tools/social";

const DAY_MS = 24 * 60 * 60 * 1000;
const KEYWORD_COOLDOWN_DAYS = 90;

export type GrowthContextOptions = { config: GrowthConfig; store: GrowthStore; logger?: GrowthLogger; dryRun?: boolean; models?: Pick<GoogleGenAI, "models">["models"] };

export function createGrowthContext({ config, store, logger = createLogger({ service: "growth" }), dryRun = false, models }: GrowthContextOptions) {
  return {
    config,
    store,
    logger,
    llm: createLlm(config.llm, logger, models),
    keywords: createKeywordTool(config.keywords, logger),
    cms: createCmsTool(config.cms, store, logger),
    social: createSocialTool(config.social, logger),
    ads: createAdsTool(dryRun ? { ...config.ads, enforce: false } : config.ads, logger),
    notifier: createNotifier(config.notify, logger, { dryRun }),
  };
}
export type GrowthContext = ReturnType<typeof createGrowthContext>;

// Next slot at a fixed UTC hour, at least `daysAhead` days out, so posts land after the reviewer has had time to approve.
function slotAt(daysAhead: number, hourUtc: number, now = new Date()) {
  const slot = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead, hourUtc));
  return slot;
}

function socialRows(source: { contentDropId: string | null; linkUrl: string | null }, pack: SocialPack, siteUrl: string): Array<Omit<SocialRecord, "id" | "externalId" | "lastError">> {
  const withTags = (text: string, tags: string[]) => [text.trim(), tags.join(" ")].filter(Boolean).join("\n\n");
  const base = { ...source, status: "PENDING_APPROVAL" as const, videoScript: null };
  const { hook, beats, durationSeconds } = pack.tiktok;
  return [
    { ...base, platform: "LINKEDIN", postText: withTags(pack.linkedin.text, pack.linkedin.hashtags), mediaUrls: [], scheduledTime: slotAt(1, 14) },
    { ...base, platform: "TWITTER", postText: withTags(pack.twitter.text, pack.twitter.hashtags), mediaUrls: [], scheduledTime: slotAt(1, 15) },
    { ...base, platform: "INSTAGRAM", postText: withTags(pack.instagram.caption, pack.instagram.hashtags), mediaUrls: [`${siteUrl}/opengraph-image`], scheduledTime: slotAt(2, 17) },
    { ...base, platform: "TIKTOK", postText: withTags(pack.tiktok.caption, pack.tiktok.hashtags), mediaUrls: [], videoScript: { hook, beats, durationSeconds } satisfies TikTokScript, scheduledTime: slotAt(2, 23) },
  ];
}

async function uniqueSlug(store: GrowthStore, wanted: string) {
  const base = slugify(wanted) || "post";
  for (let index = 1; index < 50; index += 1) {
    const slug = index === 1 ? base : `${base.slice(0, 66)}-${index}`;
    if (!(await store.slugTaken(slug))) return slug;
  }
  return `${base.slice(0, 60)}-${Date.now().toString(36)}`;
}

const platformName = (platform: string) => platform === "TWITTER" ? "X" : platform === "TIKTOK" ? "TikTok" : platform === "LINKEDIN" ? "LinkedIn" : "Instagram";

function socialSections(ctx: GrowthContext, rows: SocialRecord[]) {
  return rows.map((row) => {
    const script = row.videoScript as TikTokScript | null;
    const body = script ? `Video script (${script.durationSeconds}s, ${script.beats.length} beats, film and post manually)\nHook: "${script.hook}"\n>${row.postText.slice(0, 250).replace(/\n/g, "\n>")}` : `>${row.postText.slice(0, 400).replace(/\n/g, "\n>")}${row.postText.length > 400 ? "…" : ""}`;
    return { markdown: `**${platformName(row.platform)}** · ${row.platform === "TIKTOK" ? "suggested" : "scheduled"} ${row.scheduledTime.toISOString().slice(0, 16).replace("T", " ")} UTC after approval\n${body}`, actions: reviewButtons(ctx, { kind: "social", id: row.id }) };
  });
}

function reviewButtons(ctx: GrowthContext, target: Omit<ReviewTarget, "exp">) {
  const secret = ctx.config.approvalSecret;
  return secret ? [{ label: "Approve", url: reviewUrl(ctx.config.siteUrl, secret, target, "approve"), style: "primary" as const }, { label: "Reject", url: reviewUrl(ctx.config.siteUrl, secret, target, "reject"), style: "danger" as const }] : [];
}

const reviewFooter = (ctx: GrowthContext, extra: string) => ({ markdown: ctx.config.approvalSecret ? `Nothing is published until approved. ${extra} Each link opens a confirmation page showing the full text. Manage everything at ${ctx.config.siteUrl}/admin/growth.` : "Review links are disabled: set GROWTH_APPROVAL_SECRET (32+ random characters) to get Approve/Reject buttons. Nothing is published until approved." });

function reviewCard(ctx: GrowthContext, dropId: string, post: BlogPost, rows: SocialRecord[], keywordLine: string): ReviewCard {
  return {
    title: `New SEO draft awaiting review: ${post.title}`,
    sections: [
      { markdown: `**Article** · /blog/${post.slug}\n${post.metaDescription}\n${keywordLine}\n${post.markdownBody.split(/\s+/).length} words · ${post.tags.join(", ")}`, actions: reviewButtons(ctx, { kind: "content", id: dropId }) },
      ...socialSections(ctx, rows),
      reviewFooter(ctx, "Approve the article first; social posts link to it."),
    ],
  };
}

export async function runContentPipeline(ctx: GrowthContext, { force = false } = {}) {
  const { store, logger, config } = ctx;
  const recent = await store.keywordsUsedSince(new Date(Date.now() - KEYWORD_COOLDOWN_DAYS * DAY_MS));
  const lastRun = await store.keywordsUsedSince(new Date(Date.now() - config.contentMinIntervalDays * DAY_MS));
  if (lastRun.length && !force) {
    logger.info("content_skipped", { reason: `A draft was created in the last ${config.contentMinIntervalDays} days.` });
    return { status: "skipped" as const, reason: "recent_draft" };
  }
  const used = new Set(recent.map((keyword) => keyword.toLowerCase()));
  const candidates = config.seedKeywords.filter((keyword) => !used.has(keyword.toLowerCase()));
  if (!candidates.length) {
    logger.warn("content_skipped", { reason: "Every seed keyword was used in the last 90 days; add more to GROWTH_SEED_KEYWORDS." });
    return { status: "skipped" as const, reason: "no_keywords" };
  }

  const research = await runResearchAgent({ llm: ctx.llm, keywords: ctx.keywords, candidates: candidates.slice(0, 12) });
  const drop = await store.createContentDrop({ title: `Researching: ${research.brief.targetKeyword}`.slice(0, 200), targetKeyword: research.brief.targetKeyword, slug: await uniqueSlug(store, `draft-${research.brief.targetKeyword}-${Date.now().toString(36)}`), status: "RESEARCHING", research: { brief: research.brief, metrics: research.metrics, lookups: research.lookups } });
  const log = logger.child({ contentDropId: drop.id });
  try {
    const written = await writeBlogPost({ llm: ctx.llm, brief: research.brief, metrics: research.metrics, siteUrl: config.siteUrl });
    const post: BlogPost = { ...written, targetKeyword: research.brief.targetKeyword, slug: await uniqueSlug(store, written.slug) };
    const staged = await ctx.cms.stageCmsPost({ contentDropId: drop.id, post, research: research.brief, siteUrl: config.siteUrl });
    const pack = await writeSocialPack({ llm: ctx.llm, source: { kind: "article", post } });
    const rows = await store.createSocialPosts(socialRows({ contentDropId: drop.id, linkUrl: null }, pack, config.siteUrl));
    const metrics = research.metrics;
    const keywordLine = `Keyword "${metrics.keyword}" · ${metrics.searchVolume === null ? "volume unavailable" : `${metrics.searchVolume.toLocaleString("en-US")}/mo`} · ${metrics.competition.toLowerCase()} competition · source ${metrics.source}`;
    const delivered = await ctx.notifier.dispatch(reviewCard(ctx, drop.id, post, rows, keywordLine));
    log.info("content_drafted", { slug: staged.slug, social: rows.length, notified: delivered });
    return { status: "drafted" as const, contentDropId: drop.id, slug: staged.slug, url: articleUrl(config.siteUrl, staged), socialPostIds: rows.map((row) => row.id), notified: delivered };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.updateContentDrop(drop.id, { status: "REJECTED", reviewNote: `Generation failed: ${message}`.slice(0, 1000) }).catch((updateError) => log.error("content_mark_failed", { error: updateError }));
    throw error;
  }
}

// Founder-triggered announcement: drafts posts for every platform from a short description, then waits for approval like everything else.
export async function runProductUpdate(ctx: GrowthContext, input: ProductUpdateInput) {
  const { details, linkUrl } = productUpdateInputSchema.parse(input);
  const pack = await writeSocialPack({ llm: ctx.llm, source: { kind: "update", details } });
  const rows = await ctx.store.createSocialPosts(socialRows({ contentDropId: null, linkUrl: linkUrl ?? ctx.config.siteUrl }, pack, ctx.config.siteUrl));
  const delivered = await ctx.notifier.dispatch({
    title: "Product update posts awaiting review",
    sections: [{ markdown: `**Update**\n>${details.slice(0, 500).replace(/\n/g, "\n>")}${details.length > 500 ? "…" : ""}\nLink: ${linkUrl ?? ctx.config.siteUrl}` }, ...socialSections(ctx, rows), reviewFooter(ctx, "")],
  });
  ctx.logger.info("product_update_drafted", { social: rows.length, notified: delivered });
  return { status: "drafted" as const, socialPostIds: rows.map((row) => row.id), notified: delivered };
}

export async function runAdHealthCheck(ctx: GrowthContext) {
  return runAdsAgent({ ads: ctx.ads, store: ctx.store, notifier: ctx.notifier, logger: ctx.logger, thresholdCpa: ctx.config.ads.thresholdCpa });
}

export function reviewDecision(ctx: GrowthContext, target: ReviewTarget, decision: ReviewDecision, note?: string) {
  return applyReview({ store: ctx.store, cms: ctx.cms, social: ctx.social, siteUrl: ctx.config.siteUrl, logger: ctx.logger }, target, decision, note);
}

export type GrowthJob = "content" | "ads" | "all";
export const growthJobs: GrowthJob[] = ["content", "ads", "all"];

// Top-level entry for cron and CLI: each job is isolated so one failure cannot block the other, and failures raise an alert.
export async function runGrowthJob(ctx: GrowthContext, job: GrowthJob, options: { force?: boolean } = {}) {
  const startedAt = Date.now();
  const summary: Record<string, unknown> = { job };
  let failed = false;
  const run = async (name: "content" | "ads", work: () => Promise<unknown>) => {
    try {
      summary[name] = await work();
    } catch (error) {
      failed = true;
      const message = error instanceof z.ZodError ? `Output failed validation: ${z.prettifyError(error)}` : error instanceof Error ? error.message : String(error);
      summary[name] = { status: "failed", error: message.slice(0, 500) };
      ctx.logger.error(`${name}_job_failed`, { error });
      await ctx.notifier.alert(`Growth engine: ${name} job failed`, `\`${message.slice(0, 500)}\`\nCheck the logs for the full trace. Nothing was published.`);
    }
  };
  if (job === "content" || job === "all") await run("content", () => runContentPipeline(ctx, options));
  if (job === "ads" || job === "all") await run("ads", () => runAdHealthCheck(ctx));
  summary.durationMs = Date.now() - startedAt;
  ctx.logger.info("growth_job_finished", { ...summary, failed });
  return { ok: !failed, ...summary };
}
