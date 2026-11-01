import { Prisma, SubmissionStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { notificationEnabled, sendNotificationEmail } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { awardQuestXp, qualifyReferral, serializable } from "@/lib/quest-ledger";
import { rankForXp, xpForBounty } from "@/lib/rank";
import { getStripe } from "@/lib/stripe";
import { formatCents } from "@/lib/utils";
import { AUTO_APPROVE_AFTER_MS, isAutoApprovalDue } from "@/lib/auto-approval-window";
import { operationTransfer, reserveBillingOperation } from "@/lib/billing-operations";
import { payoutSourceCandidates } from "@/lib/payout-funding-source";
import { assertCampaignFunding } from "@/lib/funding-reversals";
import { releaseBountyAndDeductFee } from "@/lib/billing/ledger";

export { AUTO_APPROVE_AFTER_MS, isAutoApprovalDue, isFraudHeld, autoApproveDeadlineFrom as autoApproveDeadline } from "@/lib/auto-approval-window";

export type ApprovalActor = { kind: "reviewer"; id: string; admin: boolean } | { kind: "auto"; now: Date };

export type ApprovalResult = { payoutCents: number; xpGain: number; testerId: string; payoutTransactionId: string; campaignTitle: string };

export function testerPayoutErrorMessage(error: unknown): string {
  const code = error instanceof Error && "code" in error ? error.code : undefined;
  if (code === "balance_insufficient") {
    return "SeedEnv's available Stripe balance cannot cover this transfer yet. Your payout remains pending; SeedEnv support must check platform funding.";
  }
  if (code === "account_invalid" || code === "resource_missing") {
    return "Stripe could not access the payout account or its funding record. Contact SeedEnv support to check the linked account and payment mode.";
  }
  if (code === "transfers_not_allowed") {
    return "Stripe has not enabled transfers for this account. Continue Stripe setup or contact SeedEnv support.";
  }
  if (error instanceof Error) {
    if (error.message === "Stripe payout account is not ready. Finish Stripe onboarding before releasing this payout.") {
      return "Stripe has not finished enabling your payout account. Continue Stripe setup and complete any identity or bank requirements.";
    }
    if (/reconcil|unknown.*outcome|unknown beyond|does not match|Multiple transfers/i.test(error.message)) {
      return "This payout needs SeedEnv support to reconcile its Stripe transfer before it can be retried safely. Do not create another Stripe account.";
    }
  }
  return "The transfer could not be confirmed. Your payout remains recorded; contact SeedEnv support with the payout reference below before retrying.";
}

export async function releaseTesterPayouts(testerId: string) {
  const pending = await prisma.walletTransaction.findMany({
    where: { userId: testerId, type: TransactionType.BOUNTY_PAYOUT, status: TransactionStatus.PENDING },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  let releasedCount = 0;
  const failures: { payoutId: string; message: string }[] = [];
  for (const payout of pending) {
    try {
      if (await transferTesterPayout(testerId, payout.id)) releasedCount += 1;
      else failures.push({ payoutId: payout.id, message: "Finish Stripe payout setup before receiving this payment. If setup is complete, contact SeedEnv support." });
    } catch (error) {
      console.error("SeedEnv tester payout release failed:", { testerId, payoutId: payout.id, error });
      failures.push({ payoutId: payout.id, message: testerPayoutErrorMessage(error) });
    }
  }
  const pendingCount = await prisma.walletTransaction.count({
    where: { userId: testerId, type: TransactionType.BOUNTY_PAYOUT, status: TransactionStatus.PENDING },
  });
  return { releasedCount, pendingCount, failures };
}

export async function approvePendingSubmission(tx: Prisma.TransactionClient, submissionId: string, actor: ApprovalActor): Promise<ApprovalResult> {
  const submission = await tx.submission.findUnique({ where: { id: submissionId }, include: { campaign: true, tester: true, audit: { select: { status: true, humanClearedAt: true } } } });
  if (!submission || submission.status !== SubmissionStatus.PENDING) throw new Error("Pending submission not found.");
  if (submission.denialReviewPending) throw new Error("This proof is held for manual denial review.");
  await assertCampaignFunding(tx, submission.campaignId);
  if (actor.kind === "reviewer") {
    if (submission.campaign.developerId !== actor.id && !actor.admin) throw new Error("You cannot review this submission.");
    if (!submission.feedbackText && !submission.proofImageUrl) throw new Error("Proof must be submitted before approval.");
    if (submission.revisionRequestedAt) throw new Error("Wait for the tester to submit the requested revision before approving.");
  } else if (!isAutoApprovalDue(submission, actor.now)) {
    throw new Error("This submission is not due for automatic approval.");
  }

  const xpGain = xpForBounty(submission.payoutCents);
  const approval = await tx.submission.updateMany({
    where: { id: submissionId, status: SubmissionStatus.PENDING, denialReviewPending: false, ...(actor.kind === "auto" ? { revisionRequestedAt: null } : {}) },
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
  const payout = await releaseBountyAndDeductFee(tx, {
    testerId: submission.testerId,
    missionId: submission.campaignId,
    bountyCents: submission.payoutCents,
    taxSnapshot: submission.campaign.taxSnapshot,
    destinationId: submission.tester.stripeConnectAccountId,
    description: `${actor.kind === "auto" ? "Auto-approved payout" : "Payout"} pending Stripe transfer for ${submission.campaign.title}`,
  });

  return { payoutCents: submission.payoutCents, xpGain, testerId: submission.testerId, payoutTransactionId: payout.id, campaignTitle: submission.campaign.title };
}

export async function transferTesterPayout(testerId: string, transactionId: string) {
  const [tester, transaction] = await Promise.all([
    prisma.user.findUnique({ where: { id: testerId }, select: { stripeConnectAccountId: true } }),
    prisma.walletTransaction.findUnique({ where: { id: transactionId } }),
  ]);
  if (!tester || !transaction || transaction.userId !== testerId || transaction.type !== TransactionType.BOUNTY_PAYOUT) throw new Error("Tester payout ledger does not match this member.");
  if (transaction.status === TransactionStatus.COMPLETED) return true;
  if (transaction.status !== TransactionStatus.PENDING) throw new Error("This tester payout is not pending.");
  if (!process.env.STRIPE_SECRET_KEY) return false;

  try {
    const stripe = getStripe();
    const operation = await serializable(async (tx) => {
      let pending = await tx.billingOperation.findUnique({ where: { id: `seedenv-payout-${transactionId}` } });
      if (!pending) {
        if (!tester.stripeConnectAccountId) return null;
        // Before this migration, any PENDING payout may already have reached Stripe.
        pending = await reserveBillingOperation(tx, { id: `seedenv-payout-${transactionId}`, kind: "LEGACY_PAYOUT", resourceId: transactionId, ledgerId: transactionId, userId: testerId, campaignId: transaction.campaignId, destinationId: tester.stripeConnectAccountId, amountCents: transaction.amountCents });
      }
      if (!pending.destinationId && !pending.firstAttemptAt && tester.stripeConnectAccountId) pending = await tx.billingOperation.update({ where: { id: pending.id }, data: { destinationId: tester.stripeConnectAccountId } });
      return pending;
    });
    if (!operation?.destinationId) return false;
    if (operation.userId !== testerId || operation.ledgerId !== transactionId || operation.amountCents !== transaction.amountCents) throw new Error("Payout operation does not match its immutable ledger.");

    const transfer = await operationTransfer(operation, async () => {
      if (!operation.campaignId) throw new Error("Payout funding provenance is missing; reconciliation is required.");
      await serializable((tx) => assertCampaignFunding(tx, operation.campaignId!));
      const account = await stripe.accounts.retrieve(operation.destinationId!);
      if (!account.payouts_enabled) throw new Error("Stripe payout account is not ready. Finish Stripe onboarding before releasing this payout.");
    }, { sourceCandidates: () => payoutSourceCandidates(operation) });

    const settled = await prisma.$transaction(async (database) => {
      const updated = await database.walletTransaction.updateMany({
        where: { id: transactionId, status: TransactionStatus.PENDING },
        data: { status: TransactionStatus.COMPLETED, stripePaymentId: transfer.id, description: "Tester payout transferred to Stripe" },
      });
      if (updated.count) {
        await database.user.update({ where: { id: testerId }, data: { walletBalanceCents: { increment: transaction.amountCents } } });
      }
      await database.billingOperation.update({ where: { id: operation.id }, data: { state: "SETTLED", remoteId: transfer.id, error: null } });
      return updated.count > 0;
    });
    if (settled) return true;
    const current = await prisma.walletTransaction.findUnique({ where: { id: transactionId }, select: { status: true } });
    return current?.status === TransactionStatus.COMPLETED;
  } catch (error) {
    await prisma.billingOperation.updateMany({ where: { id: `seedenv-payout-${transactionId}`, state: { not: "SETTLED" } }, data: { error: (error instanceof Error ? error.message : "Unknown transfer error.").slice(0, 1000) } });
    throw error;
  }
}

export async function settleApprovedPayout(result: ApprovalResult, automatic: boolean) {
  let payoutSent = false;
  try {
    payoutSent = await transferTesterPayout(result.testerId, result.payoutTransactionId);
  } catch (error) {
    // Approval and its pending ledger entry are already committed, even if Stripe is not ready.
    console.error("SeedEnv approved payout remains pending:", { payoutId: result.payoutTransactionId, error });
  }
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
        denialReviewPending: false,
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
