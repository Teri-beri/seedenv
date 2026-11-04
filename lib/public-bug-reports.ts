import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { publicReportInputSchema, toolUrlSchema, type PublicReportInput } from "@/lib/organic-growth";
import { isStoredRecording } from "@/lib/recording";
import { proofPath } from "@/lib/storage";

export async function publishBugReport(tx: Prisma.TransactionClient, developerId: string, submissionId: string, rawInput: PublicReportInput) {
  const parsed = publicReportInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const input = parsed.data;
  const submission = await tx.submission.findFirst({
    where: { id: submissionId, campaign: { developerId }, status: "APPROVED", denialReviewPending: false },
    select: { id: true, deviceModel: true, osBuild: true, screenResolution: true, hardwareStatus: true, proofImageUrl: true, recordingUrl: true },
  });
  if (!submission) throw new Error("Only your own approved tester reports can be published.");
  const image = submission.proofImageUrl;
  const imagePath = image ? proofPath(image) : null;
  const proofImageUrl = input.includeMedia && image ? imagePath ? `proof:${imagePath}` : /^data:image\/(?:png|jpeg|webp);base64,/.test(image) ? image : null : null;
  const recording = submission.recordingUrl;
  const recordingPath = recording ? proofPath(recording) : null;
  const storedRecording = recordingPath ? `proof:${recordingPath}` : recording;
  const external = toolUrlSchema.safeParse(recording);
  const recordingUrl = input.includeMedia && recording ? isStoredRecording(storedRecording) ? storedRecording : external.success && external.data.startsWith("https://") ? external.data : null : null;
  if (input.includeMedia && ((image && !proofImageUrl) || (recording && !recordingUrl))) throw new Error("This evidence uses an unsupported storage reference. Contact SeedEnv support or publish without media.");
  const data = {
    isPublic: true, title: input.title, severity: input.severity, summary: input.summary, reproSteps: input.reproSteps,
    deviceModel: submission.deviceModel?.trim() || "Not recorded",
    osVersion: submission.osBuild?.trim() || "Not recorded",
    viewport: submission.screenResolution?.trim() || "Not recorded",
    hardwareStatus: submission.hardwareStatus,
    proofImageUrl, recordingUrl,
  };
  return tx.publicBugReport.upsert({
    where: { submissionId },
    create: { submissionId, ...data },
    update: data,
    select: { id: true, isPublic: true },
  });
}

export async function unpublishBugReport(tx: Prisma.TransactionClient, developerId: string, submissionId: string) {
  const submission = await tx.submission.findFirst({ where: { id: submissionId, campaign: { developerId } }, select: { id: true } });
  if (!submission) throw new Error("Report unavailable.");
  const existing = await tx.publicBugReport.findUnique({ where: { submissionId }, select: { id: true } });
  if (!existing) throw new Error("This report has not been shared.");
  await tx.publicBugReport.update({ where: { id: existing.id }, data: { isPublic: false, proofImageUrl: null, recordingUrl: null } });
  return { id: existing.id, isPublic: false };
}

export const getPublicBugReport = cache(async (id: string) => {
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) return null;
  return prisma.publicBugReport.findFirst({
    where: { id, isPublic: true, submission: { status: "APPROVED", denialReviewPending: false } },
    select: { id: true, title: true, severity: true, summary: true, reproSteps: true, deviceModel: true, osVersion: true, viewport: true, hardwareStatus: true, proofImageUrl: true, recordingUrl: true, publishedAt: true, updatedAt: true },
  });
});

export function physicalHardwareVerified(report: { hardwareStatus: string; deviceModel: string; osVersion: string }) {
  return report.hardwareStatus === "VERIFIED_PHYSICAL_NODE" && report.deviceModel !== "Not recorded" && report.osVersion !== "Not recorded";
}
