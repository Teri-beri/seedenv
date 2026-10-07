import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { GrowthLogger } from "@/lib/growth/log";
import type { createCmsTool } from "@/lib/growth/tools/cms";
import type { createSocialTool } from "@/lib/growth/tools/social";
import type { GrowthStore } from "@/lib/growth/store";

const REVIEW_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const tokenSchema = z.object({ kind: z.enum(["content", "social"]), id: z.string().min(1).max(100), exp: z.number().int() });
export type ReviewTarget = z.infer<typeof tokenSchema>;

const sign = (secret: string, body: string) => createHmac("sha256", secret).update(`growth-review:${body}`).digest("base64url");

// Review links carry an HMAC so only people who received the notification can approve; the link itself only opens a confirmation page.
export function createReviewToken(secret: string, target: Omit<ReviewTarget, "exp">, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ ...target, exp: now + REVIEW_TTL_MS })).toString("base64url");
  return `${body}.${sign(secret, body)}`;
}

export function verifyReviewToken(secret: string, token: string, now = Date.now()): ReviewTarget | null {
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const target = tokenSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    return target.exp > now ? target : null;
  } catch {
    return null;
  }
}

export function reviewUrl(siteUrl: string, secret: string, target: Omit<ReviewTarget, "exp">, intent?: "approve" | "reject") {
  return `${siteUrl}/api/growth/review?token=${encodeURIComponent(createReviewToken(secret, target))}${intent ? `&intent=${intent}` : ""}`;
}

export function articleUrl(siteUrl: string, drop: { slug: string; externalUrl: string | null }) {
  return drop.externalUrl ?? `${siteUrl}/blog/${drop.slug}`;
}

type ReviewDeps = { store: GrowthStore; cms: ReturnType<typeof createCmsTool>; social: ReturnType<typeof createSocialTool>; siteUrl: string; logger: GrowthLogger };
export type ReviewOutcome = { ok: boolean; message: string };

export async function applyReview(deps: ReviewDeps, target: ReviewTarget, decision: "approve" | "reject", note?: string): Promise<ReviewOutcome> {
  const reviewNote = note?.trim().slice(0, 1000) || null;
  if (target.kind === "content") {
    const drop = await deps.store.getContentDrop(target.id);
    if (!drop) return { ok: false, message: "This article no longer exists." };
    if (decision === "reject") {
      const updated = await deps.store.updateContentDrop(drop.id, { status: "REJECTED", reviewNote }, "DRAFTED");
      return updated ? { ok: true, message: "Article rejected. Its keyword is freed for a future run." } : { ok: false, message: `Article is already ${drop.status.toLowerCase()}.` };
    }
    // Claim DRAFTED -> APPROVED first so a double click cannot publish twice.
    const claimed = await deps.store.updateContentDrop(drop.id, { status: "APPROVED", approvedAt: new Date(), reviewNote }, "DRAFTED");
    if (!claimed) return drop.status === "APPROVED" ? retryPublish(deps, drop.id) : { ok: false, message: `Article is already ${drop.status.toLowerCase()}.` };
    return retryPublish(deps, drop.id);
  }

  const post = await deps.store.getSocialPost(target.id);
  if (!post) return { ok: false, message: "This social post no longer exists." };
  if (decision === "reject") {
    const updated = await deps.store.updateSocialPost(post.id, { status: "REJECTED" }, post.status === "FAILED" ? "FAILED" : "PENDING_APPROVAL");
    return updated ? { ok: true, message: "Social post rejected." } : { ok: false, message: `Post is already ${post.status.toLowerCase().replace("_", " ")}.` };
  }
  if (post.status !== "PENDING_APPROVAL" && post.status !== "FAILED") return { ok: false, message: `Post is already ${post.status.toLowerCase().replace("_", " ")}.` };
  const drop = post.contentDropId ? await deps.store.getContentDrop(post.contentDropId) : null;
  if (post.contentDropId && drop?.status !== "PUBLISHED") return { ok: false, message: "Approve and publish the article first so the link in this post works." };
  const claimed = await deps.store.updateSocialPost(post.id, { status: "QUEUED", lastError: null }, post.status);
  if (!claimed) return { ok: false, message: "This post was just reviewed by someone else." };
  const link = drop ? articleUrl(deps.siteUrl, drop) : null;
  const text = link && post.platform !== "INSTAGRAM" ? `${post.postText}\n\n${link}` : post.postText;
  try {
    const result = await deps.social.queueSocialPost(post.platform.toLowerCase(), text, post.mediaUrls[0], post.scheduledTime);
    await deps.store.updateSocialPost(post.id, { externalId: result.externalId, scheduledTime: result.scheduledTime });
    return { ok: true, message: `Scheduled on ${post.platform.toLowerCase()} for ${result.scheduledTime.toUTCString()}${result.mode === "mock" ? " (mock)" : ""}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error("social_queue_failed", { socialId: post.id, error: message });
    await deps.store.updateSocialPost(post.id, { status: "FAILED", lastError: message.slice(0, 1000) });
    return { ok: false, message: `Scheduling failed: ${message.slice(0, 200)}. You can approve again to retry.` };
  }
}

async function retryPublish(deps: ReviewDeps, id: string): Promise<ReviewOutcome> {
  const drop = await deps.store.getContentDrop(id);
  if (!drop || drop.status !== "APPROVED") return { ok: false, message: "Article is not awaiting publication." };
  try {
    const result = await deps.cms.publishApproved(drop);
    // Without an external CMS webhook the SeedEnv /blog route renders PUBLISHED drops directly.
    const published = await deps.store.updateContentDrop(drop.id, { status: "PUBLISHED", publishedAt: new Date(), externalUrl: result.externalUrl ?? null }, "APPROVED");
    return { ok: true, message: `Published at ${articleUrl(deps.siteUrl, published ?? drop)}. Approve its social posts next.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error("cms_publish_failed", { contentDropId: drop.id, error: message });
    return { ok: false, message: `Approved, but publishing failed: ${message.slice(0, 200)}. Open the link again to retry.` };
  }
}
