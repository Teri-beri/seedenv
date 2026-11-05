import { after, NextResponse } from "next/server";
import { parseModerationRequest } from "@/lib/swarm-api/input";
import { effectivePlan } from "@/lib/swarm-api/plans";
import { allowApiRequest } from "@/lib/swarm-api/rate-limit";
import { readBearerKey } from "@/lib/swarm-api/security";
import { authenticateApiKey, consumeCheck, moderateComment } from "@/lib/swarm-api/service";
import { deliverWebhook } from "@/lib/swarm-api/webhooks";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 20_000;
const baseHeaders = { "Cache-Control": "no-store", "SeedEnv-Api-Version": "2026-11-13" };

function failure(status: number, code: string, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  // Every error carries `action: "allow"` so integrations that fail open can pass it straight through.
  return NextResponse.json({ error: { code, message }, action: "allow", ...extra }, { status, headers: { ...baseHeaders, ...headers } });
}

export async function POST(request: Request) {
  const rawKey = readBearerKey(request.headers.get("authorization")) ?? readBearerKey(`Bearer ${request.headers.get("x-api-key") ?? ""}`);
  if (!rawKey) return failure(401, "unauthorized", "Send your API key as `Authorization: Bearer sfk_live_…`.");
  try {
    const apiKey = await authenticateApiKey(rawKey);
    if (!apiKey) return failure(401, "unauthorized", "This API key is invalid or has been revoked.");
    const plan = effectivePlan(apiKey.account);
    const limit = allowApiRequest(apiKey.id, plan.perMinute);
    if (!limit.allowed) return failure(429, "rate_limited", `The ${plan.name} plan allows ${plan.perMinute} requests per minute.`, {}, { "Retry-After": String(limit.retryAfterSec) });

    const raw = await request.text();
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return failure(413, "payload_too_large", "Request body must be 20 KB or smaller.");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return failure(400, "invalid_json", "Request body must be valid JSON.");
    }
    const parsed = parseModerationRequest(body);
    if (!parsed.ok) return failure(400, "invalid_request", parsed.error);

    const usage = await consumeCheck(apiKey.accountId, plan.monthlyChecks);
    if (!usage.allowed) {
      return failure(429, "quota_exceeded", `Monthly allowance of ${plan.monthlyChecks.toLocaleString("en-US")} checks reached. Upgrade or wait for the reset.`, { usage: { used: usage.used, limit: usage.limit, remaining: 0, resetsAt: usage.resetsAt.toISOString() } });
    }

    const outcome = await moderateComment(apiKey.account, parsed.value, usage);
    if (outcome.action === "hold" && apiKey.account.webhookUrl && plan.webhooks) {
      const account = apiKey.account;
      after(() => deliverWebhook(account, {
        type: "comment.held",
        data: { moderationId: outcome.id, commentId: parsed.value.commentId, threadId: parsed.value.threadId, authorId: parsed.value.authorId, score: outcome.score, signals: outcome.signals, cluster: outcome.cluster },
      }).then(() => undefined));
    }
    return NextResponse.json({
      id: outcome.id,
      commentId: parsed.value.commentId,
      action: outcome.action,
      score: outcome.score,
      signals: outcome.signals,
      cluster: outcome.cluster,
      thresholds: parsed.value.thresholds,
      plan: plan.id,
      usage: outcome.usage,
    }, { headers: { ...baseHeaders, "X-RateLimit-Limit": String(plan.perMinute), "X-RateLimit-Remaining": String(limit.remaining) } });
  } catch (error) {
    console.error("SwarmForensics moderation failed:", error);
    return failure(500, "internal_error", "Moderation is temporarily unavailable. Fail open and retry later.");
  }
}
