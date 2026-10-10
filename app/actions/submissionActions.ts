"use server";

import { CampaignStatus, SubmissionStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { z } from "zod";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { headers } from "next/headers";
import { classifyHardwareSignals } from "@/lib/hardware-integrity";
import { getCurrentUser } from "@/lib/auth";
import { sendDiscordWebhookMessage } from "@/lib/discord";
import { notificationEnabled, sendNotificationEmail } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { uploadProofImage } from "@/lib/storage";
import { usdToCents } from "@/lib/utils";
import { isStoredRecording } from "@/lib/recording";
import { approvePendingSubmission, settleApprovedPayout, transferTesterPayout } from "@/lib/submission-approval";
import { requireMember } from "@/lib/member";
import { serializable } from "@/lib/quest-ledger";
import { startAcceptedApplication } from "@/lib/mission-applications";
import { auditSubmission } from "@/lib/ai/qa-audit";
import { assertProofEditable, rejectProof, requestProofRevision, startProofRevision } from "@/lib/submission-lifecycle";

const proofSchema = z.object({
  proofImageBase64: z.string().max(7 * 1024 * 1024).optional(),
  proofImageMimeType: z.string().regex(/^image\/(png|jpe?g|webp)$/).optional(),
  proofImageHash: z.string().min(16).max(128).optional(),
  feedbackText: z.string().trim().min(12).max(2000),
  recordingUrl: z.string().url().refine((value) => /^https?:\/\//i.test(value), "Recording links must use HTTP or HTTPS.").optional().or(z.literal("")),
  osBuild: z.string().max(120).optional().or(z.literal("")),
  deviceModel: z.string().max(120).optional().or(z.literal("")),
  screenResolution: z.string().max(80).optional().or(z.literal("")),
  appBuildVersion: z.string().max(80).optional().or(z.literal("")),
  networkType: z.string().max(80).optional().or(z.literal("")),
  crashLogs: z.string().max(20000).optional().or(z.literal("")),
  networkLogs: z.string().max(20000).optional().or(z.literal("")),
  hardware: z.object({
    gpuRenderer: z.string().max(200).nullable(),
    isTouchCapable: z.boolean().nullable(),
    batteryLevel: z.number().min(0).max(1).nullable(),
    isLowPowerMode: z.boolean().nullable(),
    webglBlocked: z.boolean(),
  }).nullable().optional(),
});

function hasValidImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/jpeg") return buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

async function requestUserAgent() {
  try {
    return (await headers()).get("user-agent") || "";
  } catch {
    return "";
  }
}

export async function claimTaskSlot(campaignId: string) {
  const tester = await requireMember("TESTER");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  return serializable(async (tx) => {
    const campaign = await tx.appCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.status !== CampaignStatus.ACTIVE || campaign.expiresAt <= new Date()) throw new Error("This mission is not accepting testers.");

    const existing = await tx.submission.findUnique({
      where: { campaignId_testerId: { campaignId, testerId: tester.id } },
    });
    if (existing && existing.status === SubmissionStatus.PENDING) {
      if (existing.expiresAt <= new Date() && !existing.feedbackText && !existing.proofImageUrl) throw new Error("This claim has expired. Wait for the slot to be released.");
      return existing;
    }
    if (existing && existing.status === SubmissionStatus.APPROVED) throw new Error("You already completed this mission.");
    if (campaign.claimedSlots >= campaign.totalSlots) throw new Error("This mission is fully claimed.");
    await startAcceptedApplication(tx, tester.id, campaignId);

    const claimed = await tx.appCampaign.updateMany({
      where: { id: campaignId, claimedSlots: { lt: campaign.totalSlots } },
      data: { claimedSlots: { increment: 1 } },
    });
    if (claimed.count !== 1) throw new Error("This mission is fully claimed.");

    return tx.submission.upsert({
      where: { campaignId_testerId: { campaignId, testerId: tester.id } },
      update: {
        status: SubmissionStatus.PENDING,
        rejectionReason: null,
        revisionRequestedAt: null,
        revisionStartedAt: null,
        reviewedAt: null,
        proofImageUrl: null,
        proofImageHash: null,
        feedbackText: null,
        recordingUrl: null,
        osBuild: null,
        deviceModel: null,
        screenResolution: null,
        appBuildVersion: null,
        networkType: null,
        crashLogs: null,
        networkLogs: null,
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
  const tester = await requireMember("TESTER");
  const input = proofSchema.parse(proofData);

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { campaign: { select: { title: true, developerId: true, hardwareStrict: true } } },
  });
  if (!submission || submission.testerId !== tester.id) throw new Error("Submission not found.");
  const hardware = classifyHardwareSignals(input.hardware ?? null, await requestUserAgent());
  if (submission.status !== SubmissionStatus.PENDING) throw new Error("This submission is no longer pending.");
  assertProofEditable(submission);

  let buffer: Buffer | undefined;
  let hash: string | undefined;
  if (Boolean(input.proofImageBase64) !== Boolean(input.proofImageMimeType)) throw new Error("Provide both the screenshot and its image type.");
  if (input.proofImageBase64 && input.proofImageMimeType) {
    buffer = Buffer.from(input.proofImageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64");
    if (buffer.byteLength > 5 * 1024 * 1024) throw new Error("Proof screenshots must be under 5MB.");
    if (!hasValidImageSignature(buffer, input.proofImageMimeType)) throw new Error("Proof upload does not match its declared image type.");
    hash = createHash("sha256").update(buffer).digest("hex");
    if (input.proofImageHash && input.proofImageHash !== hash) throw new Error("Screenshot hash did not match the uploaded image. Select the file again.");
  }
  if (!buffer && !submission.proofImageUrl) throw new Error("Add a proof screenshot before submitting.");
  if (hash) {
    const duplicate = await prisma.submission.findFirst({
      where: {
        proofImageHash: hash,
        id: { not: submissionId },
        status: { in: [SubmissionStatus.PENDING, SubmissionStatus.APPROVED] },
      },
    });
    if (duplicate) throw new Error("This screenshot was already submitted to SeedEnv.");
  }

  let proofImageUrl: string | undefined;
  if (buffer && input.proofImageMimeType) {
    proofImageUrl = await uploadProofImage({
      buffer,
      contentType: input.proofImageMimeType,
      path: `${submission.campaignId}/${submission.id}-${Date.now()}`,
    });
  }

  const savedSubmission = await serializable(async (tx) => {
    const current = await tx.submission.findUniqueOrThrow({ where: { id: submissionId } });
    if (current.status !== SubmissionStatus.PENDING || current.testerId !== tester.id) throw new Error("This submission has already been reviewed.");
    if (current.revisionRequestedAt?.getTime() !== submission.revisionRequestedAt?.getTime() || current.revisionStartedAt?.getTime() !== submission.revisionStartedAt?.getTime()) throw new Error("Your revision changed during upload. Reload and retry.");
    assertProofEditable(current);
    if (hash && await tx.submission.findFirst({ where: { proofImageHash: hash, id: { not: submissionId }, status: { in: ["PENDING", "APPROVED"] } } })) throw new Error("This screenshot was already submitted to SeedEnv.");
    return tx.submission.update({ where: { id: submissionId }, data: {
      proofImageUrl,
      proofImageHash: hash,
      feedbackText: input.feedbackText,
      recordingUrl: input.recordingUrl || (isStoredRecording(current.recordingUrl) ? current.recordingUrl : null),
      osBuild: input.osBuild || null,
      deviceModel: input.deviceModel || null,
      screenResolution: input.screenResolution || null,
      appBuildVersion: input.appBuildVersion || null,
      networkType: input.networkType || null,
      crashLogs: input.crashLogs || null,
      networkLogs: input.networkLogs || null,
      hardwareStatus: submission.campaign.hardwareStrict ? hardware.integrity : "UNVERIFIED",
      hardwareFlags: hardware.flags,
      gpuRenderer: input.hardware?.gpuRenderer ?? null,
      isTouchCapable: input.hardware?.isTouchCapable ?? null,
      batteryLevel: input.hardware?.batteryLevel ?? null,
      isLowPowerMode: input.hardware?.isLowPowerMode ?? null,
      submittedAt: new Date(),
      revisionRequestedAt: null,
      revisionStartedAt: null,
      rejectionReason: null,
    } });
  });
  revalidatePath("/dashboard");
  revalidatePath("/console");
  // Advisory AI audit runs after the response is sent; it records its own failures and never blocks the tester.
  after(() => auditSubmission(savedSubmission.id).then(() => undefined));

  const developer = await prisma.user.findUnique({
    where: { id: submission.campaign.developerId },
    select: { email: true, notificationPreferences: true, discordWebhookUrl: true },
  });
  if (developer && notificationEnabled(developer.notificationPreferences, "email_tester_feedback", true)) {
    const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://seedenv.com";
    await sendNotificationEmail(
      developer.email,
      `New tester feedback: ${submission.campaign.title}`,
      `Tester ${tester.username} submitted feedback for ${submission.campaign.title}.\n\n${input.feedbackText.slice(0, 3000)}\n\nReview submissions: ${origin}/console`,
    );
  }
  if (developer?.discordWebhookUrl) {
    const message = [
      `New tester feedback for **${submission.campaign.title}**`,
      `Tester: ${tester.username}`,
      input.feedbackText.slice(0, 1200),
      `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://seedenv.com"}/console`,
    ].join("\n");
    try {
      const response = await sendDiscordWebhookMessage(developer.discordWebhookUrl, message);
      if (!response.ok) console.warn(`Discord feedback alert failed with HTTP ${response.status}.`);
    } catch {
      console.warn("Could not deliver Discord feedback alert.");
    }
  }

  return savedSubmission;
}

export async function approveSubmission(submissionId: string) {
  const reviewer = await requireMember("DEVELOPER");
  const result = await serializable((tx) => approvePendingSubmission(tx, submissionId, { kind: "reviewer", id: reviewer.id, admin: reviewer.role === "ADMIN" }));
  const payoutSent = await settleApprovedPayout(result, false);

  revalidatePath("/dashboard");
  revalidatePath("/console");
  return { payoutCents: result.payoutCents, xpGain: result.xpGain, payoutStatus: payoutSent ? "TRANSFERRED" as const : "PENDING" as const };
}

export async function releasePendingTesterPayouts() {
  const tester = await getCurrentUser("TESTER");
  if (tester.role !== "TESTER") throw new Error("Switch to your Tester workspace to release payouts.");
  if (!tester.stripeConnectAccountId || !process.env.STRIPE_SECRET_KEY) {
    return { releasedCount: 0, pendingCount: await prisma.walletTransaction.count({ where: { userId: tester.id, type: TransactionType.BOUNTY_PAYOUT, status: TransactionStatus.PENDING } }) };
  }

  const pending = await prisma.walletTransaction.findMany({
    where: { userId: tester.id, type: TransactionType.BOUNTY_PAYOUT, status: TransactionStatus.PENDING },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  let releasedCount = 0;
  for (const payout of pending) {
    if (await transferTesterPayout(tester.id, payout.id)) releasedCount += 1;
  }

  return {
    releasedCount,
    pendingCount: await prisma.walletTransaction.count({ where: { userId: tester.id, type: TransactionType.BOUNTY_PAYOUT, status: TransactionStatus.PENDING } }),
  };
}

export async function rejectSubmission(submissionId: string, reason: string) {
  const reviewer = await requireMember("DEVELOPER");
  const result = await serializable((tx) => rejectProof(tx, reviewer.id, reviewer.role === "ADMIN", submissionId, reason));
  revalidatePath("/dashboard");
  revalidatePath("/console");
  revalidatePath("/admin/proof-reviews");
  return result;
}

export async function requestSubmissionRevision(submissionId: string, note: string) {
  const reviewer = await requireMember("DEVELOPER");
  const result = await serializable((tx) => requestProofRevision(tx, reviewer.id, reviewer.role === "ADMIN", submissionId, note));
  revalidatePath("/dashboard");
  revalidatePath("/console");
  return result;
}

export async function startSubmissionRevision(submissionId: string) {
  const tester = await requireMember("TESTER");
  const result = await serializable((tx) => startProofRevision(tx, tester.id, submissionId));
  revalidatePath("/dashboard");
  return result;
}

export async function expireSlots() {
  return serializable(async (tx) => {
    const expired = await tx.submission.findMany({
      where: { status: SubmissionStatus.PENDING, expiresAt: { lt: new Date() }, proofImageUrl: null, feedbackText: null },
      select: { id: true, campaignId: true },
    });

    for (const submission of expired) {
      await tx.submission.update({ where: { id: submission.id }, data: { status: SubmissionStatus.EXPIRED } });
      await tx.appCampaign.update({ where: { id: submission.campaignId }, data: { claimedSlots: { decrement: 1 } } });
    }
    const applications = await tx.missionApplication.findMany({ where: { status: "ACCEPTED", startBy: { lte: new Date() } } });
    for (const application of applications) {
      await tx.missionApplication.update({ where: { id: application.id }, data: { status: "WITHDRAWN", passReserved: false } });
      if (application.passReserved) await tx.user.update({ where: { id: application.testerId }, data: { discoveryPasses: { increment: 1 } } });
    }
    return { expiredCount: expired.length, expiredApplications: applications.length };
  });
}
