import { TransactionStatus, TransactionType } from "@prisma/client";
import { SAFE_STRIPE_RETRY_MS, stripeTransfersForOperation } from "@/lib/billing-operations";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { releaseTesterPayouts } from "@/lib/submission-approval";

export type StuckPayout = {
  id: string;
  ledgerId: string | null;
  kind: string;
  state: string;
  amountCents: number;
  attempt: number;
  error: string | null;
  firstAttemptAt: string | null;
  testerEmail: string | null;
  repairable: boolean;
};

// Payouts whose Stripe outcome is unknown past the safe idempotent-retry window; the tester cannot retry these.
export async function listStuckPayouts(now = new Date()): Promise<StuckPayout[]> {
  const operations = await prisma.billingOperation.findMany({
    where: { kind: { in: ["PAYOUT", "REFERRAL_PAYOUT", "LEGACY_PAYOUT"] }, state: { in: ["SUBMITTED", "FAILED"] }, remoteId: null },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const users = operations.length ? await prisma.user.findMany({ where: { id: { in: [...new Set(operations.map((operation) => operation.userId))] } }, select: { id: true, email: true } }) : [];
  const emails = new Map(users.map((user) => [user.id, user.email]));
  return operations.map((operation) => ({
    id: operation.id,
    ledgerId: operation.ledgerId,
    kind: operation.kind,
    state: operation.state,
    amountCents: operation.amountCents,
    attempt: operation.attempt,
    error: operation.error,
    firstAttemptAt: operation.firstAttemptAt?.toISOString() ?? null,
    testerEmail: emails.get(operation.userId) ?? null,
    repairable: (operation.kind === "PAYOUT" || operation.kind === "REFERRAL_PAYOUT") && (!operation.firstAttemptAt || now.getTime() - operation.firstAttemptAt.getTime() >= SAFE_STRIPE_RETRY_MS),
  }));
}

export type PayoutRepairResult = { reopened: boolean; existingTransfer: string | null; releasedCount: number; pendingCount: number; failures: string[] };

// Operator repair: proves with Stripe that no transfer exists before reopening, so a retry can never pay twice.
export async function repairStuckPayout(operationId: string, operatorId: string, now = new Date()): Promise<PayoutRepairResult> {
  const operation = await prisma.billingOperation.findUnique({ where: { id: operationId } });
  if (!operation) throw new Error("Payout operation not found.");
  if (operation.kind !== "PAYOUT" && operation.kind !== "REFERRAL_PAYOUT") throw new Error("Only modern payout operations can be repaired here. Reconcile legacy payouts in Stripe.");
  if (operation.state === "SETTLED" || operation.remoteId) throw new Error("This payout already has a Stripe transfer.");
  if (!operation.destinationId) throw new Error("This payout has no destination Stripe account.");
  if (operation.firstAttemptAt && now.getTime() - operation.firstAttemptAt.getTime() < SAFE_STRIPE_RETRY_MS) {
    throw new Error("This payout is still inside Stripe's safe retry window. The tester can retry it normally.");
  }
  const ledger = await prisma.walletTransaction.findUnique({ where: { id: operation.ledgerId ?? "" } });
  const expectedType = operation.kind === "REFERRAL_PAYOUT" ? TransactionType.REFERRAL_REWARD : TransactionType.BOUNTY_PAYOUT;
  if (!ledger || ledger.type !== expectedType || ledger.status !== TransactionStatus.PENDING || ledger.amountCents !== operation.amountCents || ledger.userId !== operation.userId) {
    throw new Error("The wallet ledger is not a matching pending payout.");
  }
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured on this server.");

  const transfers = await stripeTransfersForOperation(getStripe(), { id: operation.id, destinationId: operation.destinationId, ledgerId: operation.ledgerId });
  if (transfers.length > 1) throw new Error(`Stripe has multiple matching transfers (${transfers.join(", ")}). Reconcile them in Stripe before retrying.`);
  let reopened = false;
  if (!transfers.length) {
    const updated = await prisma.billingOperation.updateMany({
      where: { id: operation.id, state: { in: ["SUBMITTED", "FAILED"] }, remoteId: null, attempt: operation.attempt },
      data: { state: "RESERVED", firstAttemptAt: null, sourceChargeId: null, attempt: operation.attempt + 1, error: `Reopened by operator ${operatorId} after Stripe showed no transfer.`.slice(0, 1000) },
    });
    if (updated.count !== 1) throw new Error("The payout changed while it was being repaired. Refresh and try again.");
    reopened = true;
  }
  // An existing transfer is attached by the normal release path; a reopened one is retried with a fresh idempotency key.
  const release = await releaseTesterPayouts(operation.userId);
  return { reopened, existingTransfer: transfers[0] ?? null, releasedCount: release.releasedCount, pendingCount: release.pendingCount, failures: release.failures.map((failure) => failure.message) };
}
