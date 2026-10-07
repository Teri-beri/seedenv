import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auditSubmission } from "@/lib/ai/qa-audit";
import { allowAgentCall, jsonError, noStore, parseJsonBody, resolveAgentCaller } from "@/lib/ai/agent-route";

export const maxDuration = 120;

const bodySchema = z.object({ submissionId: z.string().trim().min(1).max(60), force: z.boolean().optional() });

// Re-runs the advisory audit. Submission creation triggers it automatically; this is for retries by the owner, an admin, or a scheduler.
export async function POST(request: Request) {
  const caller = await resolveAgentCaller(request, { allowCron: true });
  if (caller instanceof NextResponse) return caller;
  const body = await parseJsonBody(request, bodySchema);
  if (body instanceof NextResponse) return body;
  if (caller.kind === "member") {
    const submission = await prisma.submission.findUnique({ where: { id: body.submissionId }, select: { campaign: { select: { developerId: true } } } });
    if (!submission || (submission.campaign.developerId !== caller.id && !caller.admin)) return jsonError("Submission unavailable.", 404);
    if (!allowAgentCall(`audit:${caller.id}`, caller.admin ? 120 : 20, Number(process.env.QA_AI_DAILY_LIMIT || 2000))) return jsonError("Too many audit requests. Try again later.", 429);
  }
  const outcome = await auditSubmission(body.submissionId, { force: body.force ?? true });
  const audit = await prisma.submissionAudit.findUnique({ where: { submissionId: body.submissionId } });
  if (!outcome.ok && outcome.skipped) return NextResponse.json({ message: outcome.skipped, audit }, { status: 409, headers: noStore });
  if (!outcome.ok) return NextResponse.json({ message: "The AI audit is temporarily unavailable. It has been queued for retry and flagged for manual review.", audit }, { status: 202, headers: noStore });
  return NextResponse.json({ status: outcome.status, autoClarified: outcome.autoClarified, audit }, { headers: noStore });
}
