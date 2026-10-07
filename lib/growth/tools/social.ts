import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { GrowthConfig } from "@/lib/growth/config";
import type { GrowthLogger } from "@/lib/growth/log";
import { fetchJson, HttpError, withRetry } from "@/lib/growth/retry";

export const socialPlatforms = ["twitter", "linkedin", "instagram"] as const;
export type SocialPlatformName = (typeof socialPlatforms)[number];

const queueInputSchema = z.object({
  platform: z.enum(socialPlatforms),
  postText: z.string().min(1).max(3000),
  mediaUrl: z.string().url().optional(),
  scheduledTime: z.date(),
}).superRefine((input, ctx) => {
  const limit = { twitter: 280, linkedin: 3000, instagram: 2200 }[input.platform];
  if (input.postText.length > limit) ctx.addIssue({ code: "custom", path: ["postText"], message: `${input.platform} posts are limited to ${limit} characters.` });
  if (input.platform === "instagram" && !input.mediaUrl) ctx.addIssue({ code: "custom", path: ["mediaUrl"], message: "Instagram posts require an image." });
});

export type QueueResult = { externalId: string; scheduledTime: Date; mode: "live" | "mock" };

export function createSocialTool(config: GrowthConfig["social"], logger: GrowthLogger) {
  // queue_social_post(platform, post_text, media_url?): schedules an approved post in Ayrshare. Called only from the approval handler.
  async function queueSocialPost(platform: string, postText: string, mediaUrl?: string, scheduledTime = new Date(Date.now() + 15 * 60_000)): Promise<QueueResult> {
    const input = queueInputSchema.parse({ platform, postText, mediaUrl, scheduledTime });
    if (config.mode === "disabled") throw new Error("Social publishing is not configured; set AYRSHARE_API_KEY.");
    // Ayrshare rejects schedule dates in the past, so late approvals go out a few minutes from now.
    const when = new Date(Math.max(input.scheduledTime.getTime(), Date.now() + 5 * 60_000));
    if (config.mode === "mock") {
      logger.info("social_post_mocked", { platform, chars: postText.length });
      return { externalId: `mock_${randomUUID()}`, scheduledTime: when, mode: "mock" };
    }
    const response = await withRetry(() => fetchJson<{ status?: string; id?: string; errors?: unknown }>("https://api.ayrshare.com/api/post", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ post: input.postText, platforms: [input.platform], ...(input.mediaUrl ? { mediaUrls: [input.mediaUrl] } : {}), scheduleDate: when.toISOString() }),
    }), { label: `ayrshare:${platform}`, logger, attempts: 3, shouldRetry: (error) => error instanceof HttpError && error.status === 429 });
    // Only 429s are retried: a timed-out POST may already have been scheduled, and Ayrshare has no idempotency key.
    if (response.status !== "success" && response.status !== "scheduled" || !response.id) throw new Error(`Ayrshare did not schedule the post: ${JSON.stringify(response.errors ?? response).slice(0, 300)}`);
    return { externalId: response.id, scheduledTime: when, mode: "live" };
  }
  return { mode: config.mode, queueSocialPost };
}
