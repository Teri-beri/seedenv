"use server";

import { CampaignStatus, SubmissionStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rankForXp, xpForBounty } from "@/lib/rank";
import { uploadProofImage } from "@/lib/storage";
import { usdToCents } from "@/lib/utils";

const proofSchema = z.object({
  proofImageBase64: z.string().optional(),
  proofImageMimeType: z.string().regex(/^image\/(png|jpe?g|webp)$/).optional(),
  proofImageHash: z.string().min(16).max(128).optional(),
  feedbackText: z.string().min(12).max(2000),
  recordingUrl: z.string().url().optional().or(z.literal("")),
  osBuild: z.string().max(120).optional().or(z.literal("")),
  deviceModel: z.string().max(120).optional().or(z.literal("")),
  screenResolution: z.string().max(80).optional().or(z.literal("")),
  appBuildVersion: z.string().max(80).optional().or(z.literal("")),
  networkType: z.string().max(80).optional().or(z.literal("")),
  crashLogs: z.string().max(20000).optional().or(z.literal("")),
  networkLogs: z.string().max(20000).optional().or(z.literal("")),
});

export async function claimTaskSlot(campaignId: string) {
  const tester = await getCurrentUser("TESTER");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.appCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status !== CampaignStatus.ACTIVE) throw new Error("This mission is not accepting testers.");
    if (campaign.claimedSlots >= campaign.totalSlots) throw new Error("This mission is fully claimed.");

    const existing = await tx.submission.findUnique({
      where: { campaignId_testerId: { campaignId, testerId: tester.id } },
    });
    if (existing && existing.status === SubmissionStatus.PENDING) return existing;
    if (existing && existing.status === SubmissionStatus.APPROVED) throw new Error("You already completed this mission.");

    await tx.appCampaign.update({
      where: { id: campaignId },
      data: { claimedSlots: { increment: 1 } },
    });

    return tx.submission.upsert({
      where: { campaignId_testerId: { campaignId, testerId: tester.id } },
      update: {
        status: SubmissionStatus.PENDING,
        rejectionReason: null,
        claimedAt: new Date(),
        expiresAt,
        payoutCents: usdToCents(campaign.bountyPerTaskUsd),
      },
      create: {
        campaignId,
        testerId: tester.id,
        status: SubmissionStatus.PENDING,
        expiresAt,
        payoutCents: usdToCents(campaign.bountyPerTaskUsd),
      },
    });
  });
}

export async function submitTaskProof(submissionId: string, proofData: z.infer<typeof proofSchema>) {
  const tester = await getCurrentUser("TESTER");
  const input = proofSchema.parse(proofData);

  const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!submission || submission.testerId !== tester.id) throw new Error("Submission not found.");
  if (submission.status !== SubmissionStatus.PENDING) throw new Error("This submission is no longer pending.");
  if (submission.expiresAt < new Date()) throw new Error("The 30-minute lock expired. Claim a fresh slot.");

  if (input.proofImageHash) {
    const duplicate = await prisma.submission.findFirst({
      where: {
        proofImageHash: input.proofImageHash,
        id: { not: submissionId },
        status: { in: [SubmissionStatus.PENDING, SubmissionStatus.APPROVED] },
      },
    });
    if (duplicate) throw new Error("This screenshot was already submitted to SeedEnv.");
  }

  let proofImageUrl: string | undefined;
  if (input.proofImageBase64 && input.proofImageMimeType) {
    const base64 = input.proofImageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("Proof screenshots must be under 5MB.");
    proofImageUrl = await uploadProofImage({
      buffer,
      contentType: input.proofImageMimeType,
      path: `${submission.campaignId}/${submission.id}-${Date.now()}`,
    });
  }

  return prisma.submission.update({
    where: { id: submissionId },
    data: {
      proofImageUrl,
      proofImageHash: input.proofImageHash,
      feedbackText: input.feedbackText,
      recordingUrl: input.recordingUrl || null,
      osBuild: input.osBuild || null,
      deviceModel: input.deviceModel || null,
      screenResolution: input.screenResolution || null,
      appBuildVersion: input.appBuildVersion || null,
      networkType: input.networkType || null,
      crashLogs: input.crashLogs || null,
      networkLogs: input.networkLogs || null,
    },
  });
}

export async function approveSubmission(submissionId: string) {
  const reviewer = await getCurrentUser("DEVELOPER");

  return prisma.$transaction(async (tx) => {
    const submission = await tx.submission.findUnique({
      where: { id: submissionId },
      include: { campaign: true, tester: true },
    });
    if (!submission || submission.status !== SubmissionStatus.PENDING) throw new Error("Pending submission not found.");
    if (submission.campaign.developerId !== reviewer.id && reviewer.role !== "ADMIN") throw new Error("You cannot review this submission.");
    if (!submission.feedbackText && !submission.proofImageUrl) throw new Error("Proof must be submitted before approval.");

    const xpGain = xpForBounty(submission.payoutCents);
    const nextXp = submission.tester.xpPoints + xpGain;

    await tx.submission.update({
      where: { id: submissionId },
      data: { status: SubmissionStatus.APPROVED, reviewedAt: new Date() },
    });
    await tx.appCampaign.update({
      where: { id: submission.campaignId },
      data: { completedSlots: { increment: 1 } },
    });
    await tx.user.update({
      where: { id: submission.testerId },
      data: {
        walletBalanceCents: { increment: submission.payoutCents },
        xpPoints: { increment: xpGain },
        rankTier: rankForXp(nextXp),
        lastActiveDate: new Date(),
      },
    });
    await tx.walletTransaction.create({
      data: {
        userId: submission.testerId,
        amountCents: submission.payoutCents,
        type: TransactionType.BOUNTY_PAYOUT,
        status: TransactionStatus.COMPLETED,
        description: `Approved bounty for ${submission.campaign.title}`,
      },
    });

    return { payoutCents: submission.payoutCents, xpGain };
  });
}

export async function rejectSubmission(submissionId: string, reason: string) {
  const reviewer = await getCurrentUser("DEVELOPER");
  const safeReason = z.enum(["Blurry Image", "Irrelevant Content", "Incomplete Steps", "Low Effort", "Generic Feedback", "Did not follow test script", "Incomplete video proof"]).parse(reason);

  return prisma.$transaction(async (tx) => {
    const submission = await tx.submission.findUnique({ where: { id: submissionId }, include: { campaign: true } });
    if (!submission || submission.status !== SubmissionStatus.PENDING) throw new Error("Pending submission not found.");
    if (submission.campaign.developerId !== reviewer.id && reviewer.role !== "ADMIN") throw new Error("You cannot review this submission.");

    await tx.submission.update({
      where: { id: submissionId },
      data: { status: SubmissionStatus.REJECTED, rejectionReason: safeReason, reviewedAt: new Date() },
    });
    await tx.appCampaign.update({
      where: { id: submission.campaignId },
      data: { claimedSlots: { decrement: 1 } },
    });

    return { rejected: true, reason: safeReason };
  });
}

export async function requestSubmissionRevision(submissionId: string, note: string) {
  const reviewer = await getCurrentUser("DEVELOPER");
  const safeNote = z.string().trim().min(8).max(300).parse(note);
  const submission = await prisma.submission.findUnique({ where: { id: submissionId }, include: { campaign: true } });
  if (!submission || submission.status !== SubmissionStatus.PENDING) throw new Error("Pending submission not found.");
  if (submission.campaign.developerId !== reviewer.id && reviewer.role !== "ADMIN") throw new Error("You cannot request revisions for this submission.");

  return prisma.submission.update({
    where: { id: submissionId },
    data: { rejectionReason: `Revision requested: ${safeNote}` },
    select: { id: true, rejectionReason: true },
  });
}

export async function expireSlots() {
  return prisma.$transaction(async (tx) => {
    const expired = await tx.submission.findMany({
      where: { status: SubmissionStatus.PENDING, expiresAt: { lt: new Date() }, proofImageUrl: null, feedbackText: null },
      select: { id: true, campaignId: true },
    });

    for (const submission of expired) {
      await tx.submission.update({ where: { id: submission.id }, data: { status: SubmissionStatus.EXPIRED } });
      await tx.appCampaign.update({ where: { id: submission.campaignId }, data: { claimedSlots: { decrement: 1 } } });
    }

    return { expiredCount: expired.length };
  });
}
