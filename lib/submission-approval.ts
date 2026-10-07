import { Prisma, SubmissionStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { notificationEnabled, sendNotificationEmail } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { awardQuestXp, qualifyReferral, serializable } from "@/lib/quest-ledger";
import { rankForXp, xpForBounty } from "@/lib/rank";
import { getStripe } from "@/lib/stripe";
import { formatCents } from "@/lib/utils";
import { AUTO_APPROVE_AFTER_MS, isAutoApprovalDue } from "@/lib/auto-approval-window";

export { AUTO_APPROVE_AFTER_MS, isAutoApprovalDue, isFraudHeld, autoApproveDeadlineFrom as autoApproveDeadline } from "@/lib/auto-approval-window";

export type ApprovalActor = { kind: "reviewer"; id: string; admin: boolean } | { kind: "auto"; now: Date };

export type ApprovalResult = { payoutCents: number; xpGain: number; testerId: string; payoutTransactionId: string; campaignTitle: string };

export async function approvePendingSubmission(tx: Prisma.TransactionClient, submissionId: string, actor: ApprovalActor): Promise<ApprovalResult> {
  const submission = await tx.submission.findUnique({ where: { id: submissionId }, include: { campaign: true, tester: true, audit: { select: { status: true, humanClearedAt: true } } } });
  if (!submission || submission.status !== SubmissionStatus.PENDING) throw new Error("Pending submission not found.");
  if (actor.kind === "reviewer") {
    if (submission.campaign.developerId !== actor.id && !actor.admin) throw new Error("You cannot review this submission.");
    if (!submission.feedbackText && !submission.proofImageUrl) throw new Error("Proof must be submitted before approval.");
    if (submission.revisionRequestedAt) throw new Error("Wait for the tester to submit the requested revision before approving.");
  } else if (!isAutoApprovalDue(submission, actor.now)) {
    throw new Error("This submission is not due for automatic approval.");
  }

  const xpGain = xpForBounty(submission.payoutCents);
  const approval = await tx.submission.updateMany({
    where: { id: submissionId, status: SubmissionStatus.PENDING, ...(actor.kind === "auto" ? { revisionRequestedAt: null } : {}) },
    data: { status: SubmissionStatus.APPROVED, reviewedAt: new Date() },
  });
  if (approval.count !== 1) throw new Error("This submission has already been reviewed.");
  await tx.appCampaign.update({ where: { id: submission.campaignId }, data: { completedSlots: { increment: 1 } } });
  await tx.user.update({
    where: { id: submission.testerId },
    data: { xpPoints: { increment: xpGain }, rankTier: rankForXp(submission.tester.xpPoints + xpGain), lastActiveDate: new Date() },
  });
  await awardQuestXp(tx, submission.testerId, `approved:${submission.id}`, 25, actor.kind === "auto" ? "Auto-approved contribution" : "Developer-approved contribution");
  await qualifyReferral(tx, submission.testerId);
  const payout = await tx.walletTransaction.create({
    data: {
      userId: submission.testerId,
      amountCents: submission.payoutCents,
      type: TransactionType.BOUNTY_PAYOUT,
      status: TransactionStatus.PENDING,
      description: `${actor.kind === "auto" ? "Auto-approved payout" : "Payout"} pending Stripe transfer for ${submission.campaign.title}`,
    },
    select: { id: true },
  });

  return { payoutCents: submission.payoutCents, xpGain, testerId: submission.testerId, payoutTransactionId: payout.id, campaignTitle: submission.campaign.title };
}

export async function transferTesterPayout(testerId: string, transactionId: string) {
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

export async function settleApprovedPayout(result: ApprovalResult, automatic: boolean) {
  const payoutSent = await transferTesterPayout(result.testerId, result.payoutTransactionId);
  const tester = await prisma.user.findUnique({ where: { id: result.testerId }, select: { email: true, notificationPreferences: true } });
  if (tester && notificationEnabled(tester.notificationPreferences, "email_ledger_updates", true)) {
    const amount = formatCents(result.payoutCents);
    const lead = automatic ? `Your proof for ${result.campaignTitle} was not reviewed within 48 hours, so it was approved automatically.` : `Your proof for ${result.campaignTitle} was approved.`;
    await sendNotificationEmail(
      tester.email,
      payoutSent ? "Your SeedEnv payout was sent" : "Your SeedEnv payout is ready to cash out",
      payoutSent
        ? `${lead} Your ${amount} payout was transferred to your Stripe account.`
        : `${lead} Your ${amount} payout is ready. Open your SeedEnv dashboard and choose Cash Out to connect Stripe and release it.`,
    );
  }
  return payoutSent;
}

let sweepInFlight: Promise<number> | null = null;
let lastLazySweep = 0;

export function autoApprovalEnabled() {
  return process.env.NODE_ENV === "production" && process.env.SEEDENV_DISABLE_AUTO_APPROVE !== "1";
}

// Approves proofs that developers left unreviewed for 48 hours. Safe to call concurrently and from any request.
export function autoApproveOverdueSubmissions(now = new Date(), limit = 25) {
  if (!autoApprovalEnabled()) return Promise.resolve(0);
  if (sweepInFlight) return sweepInFlight;
  sweepInFlight = (async () => {
    const due = await prisma.submission.findMany({
      where: {
        status: SubmissionStatus.PENDING,
        revisionRequestedAt: null,
        submittedAt: { lte: new Date(now.getTime() - AUTO_APPROVE_AFTER_MS) },
        OR: [{ feedbackText: { not: null } }, { proofImageUrl: { not: null } }],
        NOT: { audit: { is: { status: "FLAGGED_FRAUD", humanClearedAt: null } } },
      },
      orderBy: { submittedAt: "asc" },
      take: limit,
      select: { id: true },
    });
    let approved = 0;
    for (const { id } of due) {
      try {
        const result = await serializable((tx) => approvePendingSubmission(tx, id, { kind: "auto", now }));
        approved += 1;
        await settleApprovedPayout(result, true);
      } catch (error) {
        console.warn("SeedEnv auto-approval skipped:", id, error instanceof Error ? error.message : error);
      }
    }
    return approved;
  })().finally(() => { sweepInFlight = null; });
  return sweepInFlight;
}

// Request-time fallback for the background interval; runs at most once per minute per server.
export function sweepOverdueSubmissionsLazily() {
  if (!autoApprovalEnabled() || Date.now() - lastLazySweep < 60_000) return;
  lastLazySweep = Date.now();
  autoApproveOverdueSubmissions().catch((error) => console.warn("SeedEnv auto-approval sweep failed:", error instanceof Error ? error.message : error));
}
