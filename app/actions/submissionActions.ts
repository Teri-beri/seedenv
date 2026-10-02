"use server";

import { CampaignStatus, SubmissionStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sendDiscordWebhookMessage } from "@/lib/discord";
import { notificationEnabled, sendNotificationEmail } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { rankForXp, xpForBounty } from "@/lib/rank";
import { uploadProofImage } from "@/lib/storage";
import { getStripe } from "@/lib/stripe";
import { formatCents, usdToCents } from "@/lib/utils";

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

function hasValidImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/jpeg") return buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (mimeType === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

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

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { campaign: { select: { title: true, developerId: true } } },
  });
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
    if (!hasValidImageSignature(buffer, input.proofImageMimeType)) throw new Error("Proof upload does not match its declared image type.");
    proofImageUrl = await uploadProofImage({
      buffer,
      contentType: input.proofImageMimeType,
      path: `${submission.campaignId}/${submission.id}-${Date.now()}`,
    });
  }

  const savedSubmission = await prisma.submission.update({
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
  const reviewer = await getCurrentUser("DEVELOPER");

  const result = await prisma.$transaction(async (tx) => {
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
        xpPoints: { increment: xpGain },
        rankTier: rankForXp(nextXp),
        lastActiveDate: new Date(),
      },
    });
    const payout = await tx.walletTransaction.create({
      data: {
        userId: submission.testerId,
        amountCents: submission.payoutCents,
        type: TransactionType.BOUNTY_PAYOUT,
        status: TransactionStatus.PENDING,
        description: `Payout pending Stripe transfer for ${submission.campaign.title}`,
      },
      select: { id: true },
    });

    return { payoutCents: submission.payoutCents, xpGain, testerId: submission.testerId, payoutTransactionId: payout.id };
  });

  const tester = await prisma.user.findUnique({
    where: { id: result.testerId },
    select: { email: true, notificationPreferences: true },
  });
  const payoutSent = await transferTesterPayout(result.testerId, result.payoutTransactionId);
  if (tester && notificationEnabled(tester.notificationPreferences, "email_ledger_updates", true)) {
    await sendNotificationEmail(
      tester.email,
      payoutSent ? "Your SeedEnv payout was sent" : "Your SeedEnv payout is pending setup",
      payoutSent
        ? `Your ${formatCents(result.payoutCents)} tester payout was transferred to your Stripe account.`
        : `Your ${formatCents(result.payoutCents)} tester payout was approved and is pending Stripe payout setup. Open Account > Portfolio / Billing to connect Stripe and release it.`,
    );
  }

  return { payoutCents: result.payoutCents, xpGain: result.xpGain, payoutStatus: payoutSent ? "TRANSFERRED" as const : "PENDING" as const };
}

async function transferTesterPayout(testerId: string, transactionId: string) {
  const [tester, transaction] = await Promise.all([
    prisma.user.findUnique({ where: { id: testerId }, select: { stripeConnectAccountId: true } }),
    prisma.walletTransaction.findUnique({ where: { id: transactionId }, select: { amountCents: true, status: true } }),
  ]);
  if (!tester || !transaction) return false;
  if (transaction.status === TransactionStatus.COMPLETED) return true;
  if (!tester.stripeConnectAccountId || !process.env.STRIPE_SECRET_KEY) return false;

  try {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(tester.stripeConnectAccountId);
    if (!account.payouts_enabled) return false;

    const transfer = await stripe.transfers.create({
      amount: transaction.amountCents,
      currency: "usd",
      destination: tester.stripeConnectAccountId,
      metadata: { seedenvUserId: testerId, seedenvLedgerTransactionId: transactionId },
    }, { idempotencyKey: `seedenv-payout-${transactionId}` });

    const settled = await prisma.$transaction(async (database) => {
      const updated = await database.walletTransaction.updateMany({
        where: { id: transactionId, status: TransactionStatus.PENDING },
        data: { status: TransactionStatus.COMPLETED, stripePaymentId: transfer.id, description: "Tester payout transferred to Stripe" },
      });
      if (updated.count) {
        await database.user.update({ where: { id: testerId }, data: { walletBalanceCents: { increment: transaction.amountCents } } });
      }
      return updated.count > 0;
    });
    if (settled) return true;
    const current = await prisma.walletTransaction.findUnique({ where: { id: transactionId }, select: { status: true } });
    return current?.status === TransactionStatus.COMPLETED;
  } catch (error) {
    console.warn("Stripe tester payout transfer failed:", error instanceof Error ? error.message : "Unknown transfer error.");
    return false;
  }
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
