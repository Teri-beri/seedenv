import type { BillingOperation, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

export const SAFE_STRIPE_RETRY_MS = 23 * 60 * 60 * 1000;

export function assertSafeRemoteRetry(firstAttemptAt: Date | null, now = new Date()) {
  if (firstAttemptAt && now.getTime() - firstAttemptAt.getTime() >= SAFE_STRIPE_RETRY_MS) {
    throw new Error("Stripe outcome remains unknown beyond the safe retry window. Reconcile this operation with Stripe before retrying; no new payment was sent.");
  }
}

export async function reserveBillingOperation(tx: Prisma.TransactionClient, data: Prisma.BillingOperationUncheckedCreateInput) {
  return tx.billingOperation.upsert({ where: { id: data.id }, create: data, update: {} });
}

async function markAttempt(operation: BillingOperation) {
  return serializable(async (tx) => {
    const current = await tx.billingOperation.findUniqueOrThrow({ where: { id: operation.id } });
    if (current.state === "SETTLED") return current;
    assertSafeRemoteRetry(current.firstAttemptAt);
    return tx.billingOperation.update({
      where: { id: current.id },
      data: { firstAttemptAt: current.firstAttemptAt ?? new Date(), state: "SUBMITTED", error: null },
    });
  });
}

async function refundReservedOperation(operation: BillingOperation) {
  if (!operation.paymentId) throw new Error("Refund reservation has no funding payment.");
  const stripe = getStripe();
  const matches = [];
  for await (const refund of stripe.refunds.list({ payment_intent: operation.paymentId, limit: 100 })) {
    if (refund.metadata?.seedenvOperationId === operation.id || refund.id === operation.remoteId) matches.push(refund);
  }
  if (matches.length > 1) throw new Error("Multiple Stripe refunds match one billing operation. Reconciliation is required.");
  let refund = matches[0] ?? (operation.remoteId ? await stripe.refunds.retrieve(operation.remoteId) : undefined);
  if (!refund) {
    const current = await markAttempt(operation);
    if (current.remoteId) refund = await stripe.refunds.retrieve(current.remoteId);
    else refund = await stripe.refunds.create({
      payment_intent: operation.paymentId,
      amount: operation.amountCents,
      metadata: { seedenvOperationId: operation.id },
    }, { idempotencyKey: operation.id });
  }
  const paymentId = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
  if (refund.amount !== operation.amountCents || refund.currency !== "usd" || paymentId !== operation.paymentId) throw new Error("Stripe refund does not match its reservation.");
  await prisma.billingOperation.update({ where: { id: operation.id }, data: { remoteId: refund.id } });
  if (refund.status === "failed" || refund.status === "canceled") {
    await prisma.billingOperation.update({ where: { id: operation.id }, data: { state: "FAILED", error: `Stripe refund ${refund.id} ${refund.status}` } });
    throw new Error(`Stripe refund ${refund.id} ${refund.status}; no money was refunded.`);
  }
  if (refund.status !== "succeeded") throw new Error(`Stripe refund ${refund.id} is ${refund.status}; its reservation remains held for reconciliation.`);
  return refund;
}

export async function operationRefund(operation: BillingOperation) {
  try {
    return await refundReservedOperation(operation);
  } catch (error) {
    await prisma.billingOperation.updateMany({ where: { id: operation.id, state: { not: "SETTLED" } }, data: { error: (error instanceof Error ? error.message : "Unknown Stripe refund outcome").slice(0, 1000) } });
    throw error;
  }
}

export async function cancelFailedRefund(operationId: string) {
  return serializable(async (tx) => {
    const current = await tx.billingOperation.findUniqueOrThrow({ where: { id: operationId } });
    if (current.state !== "FAILED") return current.state === "CANCELLED";
    if (current.kind === "WITHDRAWAL_REFUND") await tx.user.update({ where: { id: current.userId }, data: { fundingBalanceCents: { increment: current.amountCents } } });
    await tx.billingOperation.update({ where: { id: current.id }, data: { state: "CANCELLED" } });
    return true;
  });
}

export type TransferSourceCandidate = { chargeId: string; capacityCents: number };

// Stripe answered with a request error (4xx, not an idempotency conflict), so it created nothing.
export function isDefinitiveStripeRejection(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const { type, statusCode, code } = error as { type?: unknown; statusCode?: unknown; code?: unknown };
  if (type === "StripeIdempotencyError" || code === "idempotency_key_in_use") return false;
  if (type !== "StripeInvalidRequestError" && type !== "StripeCardError" && type !== "StripePermissionError") return false;
  return typeof statusCode === "number" && statusCode >= 400 && statusCode < 500 && statusCode !== 409 && statusCode !== 429;
}

export function transferIdempotencyKey(operation: Pick<BillingOperation, "id" | "attempt">) {
  return operation.attempt ? `${operation.id}-retry-${operation.attempt}` : operation.id;
}

// Picks a funding charge with spare capacity once, before any transfer attempt, so retries reuse identical parameters.
async function pinTransferSource(operation: BillingOperation, candidates: TransferSourceCandidate[]) {
  return serializable(async (tx) => {
    const current = await tx.billingOperation.findUniqueOrThrow({ where: { id: operation.id } });
    if (current.firstAttemptAt || current.sourceChargeId || current.state === "SETTLED") return current;
    for (const candidate of candidates) {
      const committed = await tx.billingOperation.findMany({
        where: { sourceChargeId: candidate.chargeId, state: { notIn: ["CANCELLED", "FAILED"] }, id: { not: current.id } },
        select: { amountCents: true },
      });
      const used = committed.reduce((sum, row) => sum + row.amountCents, 0);
      if (candidate.capacityCents - used >= current.amountCents) {
        return tx.billingOperation.update({ where: { id: current.id }, data: { sourceChargeId: candidate.chargeId } });
      }
    }
    return current;
  });
}

// Only the attempt Stripe rejected may be reopened; a late rejection from an older key must not
// discard a newer in-flight attempt (whose fresh key would otherwise lose Stripe deduplication).
export async function reopenRejectedAttempt(operation: Pick<BillingOperation, "id" | "attempt">, error: unknown) {
  await serializable(async (tx) => {
    await tx.billingOperation.updateMany({
      where: { id: operation.id, attempt: operation.attempt, state: "SUBMITTED", remoteId: null },
      // Clearing the source lets the next attempt re-check funding (e.g. a refunded charge); its key is new anyway.
      data: { state: "RESERVED", firstAttemptAt: null, sourceChargeId: null, attempt: operation.attempt + 1, error: `Stripe rejected attempt ${operation.attempt}: ${error instanceof Error ? error.message : "request error"}`.slice(0, 1000) },
    });
  });
}

export async function operationTransfer(operation: BillingOperation, beforeCreate: () => Promise<void>, options: { sourceCandidates?: () => Promise<TransferSourceCandidate[]> } = {}) {
  if (!operation.destinationId) throw new Error("Payout reservation has no destination.");
  const stripe = getStripe();
  const matches = new Map<string, Stripe.Transfer>();
  // Older payouts did not set a transfer group; scan their immutable ledger metadata too.
  const legacy = operation.kind === "LEGACY_PAYOUT";
  for await (const transfer of stripe.transfers.list(legacy ? { limit: 100 } : { transfer_group: operation.id, limit: 100 })) {
    if (!legacy || transfer.metadata?.seedenvLedgerTransactionId === operation.ledgerId) matches.set(transfer.id, transfer);
  }
  // Charge-linked transfers may carry Stripe's own transfer group, so also match by destination and operation metadata.
  if (!legacy) {
    for await (const transfer of stripe.transfers.list({ destination: operation.destinationId, limit: 100 })) {
      if (transfer.metadata?.seedenvOperationId === operation.id) matches.set(transfer.id, transfer);
    }
  }
  if (matches.size > 1) throw new Error("Multiple transfers match this payout. Reconciliation is required.");
  let transfer: Stripe.Transfer | undefined = [...matches.values()][0] ?? (operation.remoteId ? await stripe.transfers.retrieve(operation.remoteId) : undefined);
  if (!transfer) {
    if (legacy) throw new Error("Legacy payout has an unknown remote outcome. Reconcile it with Stripe before release.");
    await beforeCreate();
    let pinned = operation;
    if (options.sourceCandidates && !operation.firstAttemptAt && !operation.sourceChargeId) {
      const candidates = await options.sourceCandidates().catch((error) => {
        console.warn("SeedEnv payout source lookup failed; using platform balance:", error instanceof Error ? error.message : error);
        return [];
      });
      pinned = await pinTransferSource(operation, candidates);
    }
    const current = await markAttempt(pinned);
    if (current.remoteId) transfer = await stripe.transfers.retrieve(current.remoteId);
    else {
      try {
        transfer = await stripe.transfers.create({
          amount: current.amountCents, currency: "usd", destination: current.destinationId!,
          ...(current.sourceChargeId ? { source_transaction: current.sourceChargeId } : { transfer_group: current.id }),
          metadata: { seedenvUserId: current.userId, seedenvLedgerTransactionId: current.ledgerId!, seedenvOperationId: current.id },
        }, { idempotencyKey: transferIdempotencyKey(current) });
      } catch (error) {
        if (isDefinitiveStripeRejection(error)) await reopenRejectedAttempt(current, error);
        throw error;
      }
    }
  }
  const destination = typeof transfer.destination === "string" ? transfer.destination : transfer.destination?.id;
  if (transfer.amount !== operation.amountCents || transfer.currency !== "usd" || destination !== operation.destinationId || transfer.reversed || transfer.amount_reversed > 0 || transfer.metadata?.seedenvLedgerTransactionId !== operation.ledgerId || (!legacy && transfer.metadata?.seedenvOperationId !== operation.id)) {
    throw new Error("Existing Stripe transfer does not match this payout; reconciliation is required.");
  }
  await prisma.billingOperation.update({ where: { id: operation.id }, data: { remoteId: transfer.id } });
  return transfer;
}
