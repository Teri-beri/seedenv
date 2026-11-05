import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { effectivePlan } from "@/lib/swarm-api/plans";
import { generateWebhookSecret, resolvesToPublicAddress, validateWebhookUrl } from "@/lib/swarm-api/security";
import { getOrCreateSwarmApiAccount } from "@/lib/swarm-api/service";
import { noStore, readJson, requireSwarmMember, swarmErrorResponse } from "@/lib/swarm-api/session-route";
import { deliverWebhook } from "@/lib/swarm-api/webhooks";

export async function PUT(request: Request) {
  const member = await requireSwarmMember(request);
  if ("response" in member) return member.response;
  const body = await readJson(request);
  try {
    const account = await getOrCreateSwarmApiAccount(member.user.id);
    if (!effectivePlan(account).webhooks) return NextResponse.json({ message: "Webhooks are available on paid plans." }, { status: 402, headers: noStore });
    const checked = validateWebhookUrl(typeof body.url === "string" ? body.url : "");
    if (!checked.ok) return NextResponse.json({ message: checked.error }, { status: 400, headers: noStore });
    if (!await resolvesToPublicAddress(new URL(checked.url).hostname)) return NextResponse.json({ message: "That hostname doesn't resolve to a public address." }, { status: 400, headers: noStore });
    const updated = await prisma.swarmApiAccount.update({
      where: { id: account.id },
      data: { webhookUrl: checked.url, webhookSecret: account.webhookSecret ?? generateWebhookSecret(), webhookLastStatus: null, webhookLastAt: null },
      select: { webhookUrl: true, webhookSecret: true },
    });
    return NextResponse.json({ webhook: updated }, { headers: noStore });
  } catch (error) {
    return swarmErrorResponse(error, "Could not save the webhook.");
  }
}

export async function POST(request: Request) {
  const member = await requireSwarmMember(request);
  if ("response" in member) return member.response;
  const body = await readJson(request);
  try {
    const account = await getOrCreateSwarmApiAccount(member.user.id);
    if (body.action === "rotate") {
      if (!account.webhookUrl) return NextResponse.json({ message: "Add a webhook URL first." }, { status: 400, headers: noStore });
      const updated = await prisma.swarmApiAccount.update({ where: { id: account.id }, data: { webhookSecret: generateWebhookSecret() }, select: { webhookUrl: true, webhookSecret: true } });
      return NextResponse.json({ webhook: updated }, { headers: noStore });
    }
    if (body.action === "test") {
      const result = await deliverWebhook(account, { type: "webhook.test", data: { message: "SwarmForensics webhook test from SeedEnv." } });
      if ("reason" in result) return NextResponse.json({ message: result.reason === "plan" ? "Webhooks are available on paid plans." : "Add a valid webhook URL first." }, { status: 400, headers: noStore });
      return NextResponse.json(result, { headers: noStore });
    }
    return NextResponse.json({ message: "Unknown action." }, { status: 400, headers: noStore });
  } catch (error) {
    return swarmErrorResponse(error, "Webhook request failed.");
  }
}

export async function DELETE(request: Request) {
  const member = await requireSwarmMember(request);
  if ("response" in member) return member.response;
  try {
    const account = await getOrCreateSwarmApiAccount(member.user.id);
    await prisma.swarmApiAccount.update({ where: { id: account.id }, data: { webhookUrl: null, webhookSecret: null, webhookLastStatus: null, webhookLastAt: null } });
    return NextResponse.json({ removed: true }, { headers: noStore });
  } catch (error) {
    return swarmErrorResponse(error, "Could not remove the webhook.");
  }
}
