import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { effectivePlan } from "@/lib/swarm-api/plans";
import { resolvesToPublicAddress, signWebhookPayload, validateWebhookUrl } from "@/lib/swarm-api/security";

export type SwarmWebhookEvent = {
  type: "comment.held" | "webhook.test";
  data: Record<string, unknown>;
};

type WebhookAccount = { id: string; plan: string; subscriptionStatus: string | null; webhookUrl: string | null; webhookSecret: string | null };

export async function deliverWebhook(account: WebhookAccount, event: SwarmWebhookEvent) {
  if (!account.webhookUrl || !account.webhookSecret) return { delivered: false, reason: "not_configured" as const };
  if (!effectivePlan(account).webhooks) return { delivered: false, reason: "plan" as const };
  const checked = validateWebhookUrl(account.webhookUrl);
  if (!checked.ok) return { delivered: false, reason: "invalid_url" as const };
  const url = new URL(checked.url);
  let status = 0;
  if (await resolvesToPublicAddress(url.hostname)) {
    const body = JSON.stringify({ id: `evt_${randomUUID()}`, type: event.type, created: new Date().toISOString(), data: event.data });
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "SeedEnv-SwarmForensics-Webhook/1.0", "SeedEnv-Signature": signWebhookPayload(account.webhookSecret, body) },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      status = response.status;
      await response.body?.cancel().catch(() => undefined);
    } catch {
      status = 0;
    }
  }
  await prisma.swarmApiAccount.update({ where: { id: account.id }, data: { webhookLastStatus: status, webhookLastAt: new Date() } }).catch(() => undefined);
  return { delivered: status >= 200 && status < 300, status };
}
