import type { BillingOperation, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
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

export async function operationTransfer(operation: BillingOperation, beforeCreate: () => Promise<void>) {
  if (!operation.destinationId) throw new Error("Payout reservation has no destination.");
  const stripe = getStripe();
  const matches = [];
  // Older payouts did not set a transfer group; scan their immutable ledger metadata too.
  const legacy = operation.kind === "LEGACY_PAYOUT";
  for await (const transfer of stripe.transfers.list(legacy ? { limit: 100 } : { transfer_group: operation.id, limit: 100 })) {
    if (!legacy || transfer.metadata?.seedenvLedgerTransactionId === operation.ledgerId) matches.push(transfer);
  }
  if (matches.length > 1) throw new Error("Multiple transfers match this payout. Reconciliation is required.");
  let transfer = matches[0] ?? (operation.remoteId ? await stripe.transfers.retrieve(operation.remoteId) : undefined);
  if (!transfer) {
    if (legacy) throw new Error("Legacy payout has an unknown remote outcome. Reconcile it with Stripe before release.");
    await beforeCreate();
    const current = await markAttempt(operation);
    if (current.remoteId) transfer = await stripe.transfers.retrieve(current.remoteId);
    else transfer = await stripe.transfers.create({
      amount: operation.amountCents, currency: "usd", destination: operation.destinationId,
      transfer_group: operation.id,
      metadata: { seedenvUserId: operation.userId, seedenvLedgerTransactionId: operation.ledgerId!, seedenvOperationId: operation.id },
    }, { idempotencyKey: operation.id });
  }
  const destination = typeof transfer.destination === "string" ? transfer.destination : transfer.destination?.id;
  if (transfer.amount !== operation.amountCents || transfer.currency !== "usd" || destination !== operation.destinationId || transfer.reversed || transfer.amount_reversed > 0 || transfer.metadata?.seedenvLedgerTransactionId !== operation.ledgerId || (!legacy && transfer.metadata?.seedenvOperationId !== operation.id)) {
    throw new Error("Existing Stripe transfer does not match this payout; reconciliation is required.");
  }
  await prisma.billingOperation.update({ where: { id: operation.id }, data: { remoteId: transfer.id } });
  return transfer;
}
