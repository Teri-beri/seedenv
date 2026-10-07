import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { synthesizeCampaign } from "@/lib/ai/campaign-synthesis";
import { allowAgentCall, jsonError, noStore, parseJsonBody, resolveAgentCaller } from "@/lib/ai/agent-route";

export const maxDuration = 180;

const bodySchema = z.object({ campaignId: z.string().trim().min(1).max(60), regenerate: z.boolean().optional() });

// Writes the release report for an ended cohort. Runs automatically on completion; owners and admins can regenerate it.
export async function POST(request: Request) {
  const caller = await resolveAgentCaller(request, { allowCron: true });
  if (caller instanceof NextResponse) return caller;
  const body = await parseJsonBody(request, bodySchema);
  if (body instanceof NextResponse) return body;
  if (caller.kind === "member") {
    const campaign = await prisma.appCampaign.findUnique({ where: { id: body.campaignId }, select: { developerId: true } });
    if (!campaign || (campaign.developerId !== caller.id && !caller.admin)) return jsonError("Cohort unavailable.", 404);
    if (!allowAgentCall(`synthesis:${caller.id}`, 6, Number(process.env.QA_AI_DAILY_LIMIT || 2000))) return jsonError("Too many report requests. Try again later.", 429);
  }
  const outcome = await synthesizeCampaign(body.campaignId, { force: body.regenerate ?? false });
  if (!outcome.ok) return jsonError(outcome.error, outcome.status);
  const synthesis = await prisma.campaignSynthesis.findUnique({ where: { id: outcome.id } });
  return NextResponse.json({ synthesis }, { headers: noStore });
}
