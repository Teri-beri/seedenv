import { z } from "zod";
import { DEFAULT_THRESHOLDS, RETENTION_MS, type Thresholds } from "@/lib/swarm-api/scoring";

const identifier = z.string().trim().min(1).max(128);

export const moderationRequestSchema = z.object({
  text: z.string().max(5000, "text must be 5,000 characters or fewer.").refine((value) => value.trim().length > 0, "text is required."),
  authorId: identifier,
  threadId: identifier.optional(),
  commentId: identifier.optional(),
  postedAt: z.iso.datetime({ offset: true }).optional(),
  authorAccountAgeDays: z.number().min(0).max(100_000).optional(),
  thresholds: z.object({ review: z.number().int().min(1).max(100), hold: z.number().int().min(1).max(100) })
    .refine((value) => value.review < value.hold, "thresholds.review must be lower than thresholds.hold.")
    .optional(),
}).strict();

export type ModerationRequest = {
  text: string;
  authorId: string;
  threadId: string | null;
  commentId: string | null;
  postedAt: Date;
  authorAccountAgeDays: number | null;
  thresholds: Thresholds;
};

// Client clocks drift and can be spoofed, so timestamps are clamped to the retention window.
export function clampPostedAt(value: string | undefined, now = new Date()) {
  if (!value) return now;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time) || time > now.getTime() + 5 * 60_000 || time < now.getTime() - RETENTION_MS) return now;
  return new Date(time);
}

export function parseModerationRequest(body: unknown, now = new Date()): { ok: true; value: ModerationRequest } | { ok: false; error: string } {
  const parsed = moderationRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.join(".");
    return { ok: false, error: issue.code === "unrecognized_keys" ? `Unknown field: ${issue.keys.join(", ")}.` : path && !issue.message.includes(path) ? `${path}: ${issue.message}` : issue.message };
  }
  const data = parsed.data;
  return {
    ok: true,
    value: {
      text: data.text,
      authorId: data.authorId,
      threadId: data.threadId ?? null,
      commentId: data.commentId ?? null,
      postedAt: clampPostedAt(data.postedAt, now),
      authorAccountAgeDays: data.authorAccountAgeDays ?? null,
      thresholds: data.thresholds ?? { ...DEFAULT_THRESHOLDS },
    },
  };
}
