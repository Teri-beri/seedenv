import type { Prisma } from "@prisma/client";
import { billingTransaction as serializable } from "@/lib/billing-transaction";
import { getStripe } from "@/lib/stripe";

export function reversedFundingCents(creditCents: number, refundCents: number, disputeCents: number) {
  return Math.min(creditCents, Math.max(0, refundCents) + Math.max(0, disputeCents));
}

// Fetch authoritative Stripe state while the accounting transaction is open. Replayed and
// out-of-order events must never overwrite a newer reversal with an old event payload.
export async function reconcileFundingPayment(tx: Prisma.TransactionClient, paymentId: string) {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(paymentId);
  const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
  if (!chargeId) return;
  let externalRefunds = 0;
  for await (const refund of stripe.refunds.list({ payment_intent: paymentId, limit: 100 })) {
    if (refund.status !== "succeeded") continue;
    const operation = refund.metadata?.seedenvOperationId
      ? await tx.billingOperation.findUnique({ where: { id: refund.metadata.seedenvOperationId } }) : null;
    if (operation) {
      if (operation.paymentId !== paymentId || operation.amountCents !== refund.amount || operation.kind === "PAYOUT") throw new Error("Stripe refund metadata does not match its reserved operation.");
      continue;
    }
    // Receipts from the pre-operation ledger are also platform-issued refunds.
    const legacy = await tx.walletTransaction.findFirst({ where: { stripePaymentId: refund.id, type: { in: ["ESCROW_REFUND", "BALANCE_WITHDRAWAL"] }, status: "COMPLETED" } });
    if (legacy) continue;
    if (refund.metadata?.type === "SEEDENV_BALANCE_WITHDRAWAL" && refund.metadata.transactionId && refund.metadata.topUpId) {
      const withdrawal = await tx.walletTransaction.findUnique({ where: { id: refund.metadata.transactionId } });
      const funded = await tx.balanceTopUp.findUnique({ where: { id: refund.metadata.topUpId } });
      if (withdrawal?.type === "BALANCE_WITHDRAWAL" && withdrawal.status === "COMPLETED" && funded?.userId === withdrawal.userId && funded.stripePaymentIntentId === paymentId && withdrawal.amountCents >= refund.amount && funded.refundedCents >= refund.amount) continue;
      if (withdrawal?.type === "BALANCE_WITHDRAWAL" && withdrawal.status === "PENDING") throw new Error("A pre-migration balance withdrawal has an interrupted outcome. Reconcile its reserved balance and Stripe receipts before processing funding reversals.");
    }
    externalRefunds += refund.amount;
  }
  let disputedCents = 0;
  for await (const dispute of stripe.disputes.list({ charge: chargeId, limit: 100 })) {
    if (!["won", "warning_closed"].includes(dispute.status)) disputedCents += dispute.amount;
  }
  const topUp = await tx.balanceTopUp.findUnique({ where: { stripePaymentIntentId: paymentId } })
    ?? (intent.metadata?.topUpId ? await tx.balanceTopUp.findUnique({ where: { id: intent.metadata.topUpId } }) : null);
  const slot = await tx.slotCharge.findUnique({ where: { stripePaymentIntentId: paymentId } });
  const deposit = !topUp && !slot ? await tx.walletTransaction.findFirst({ where: { stripePaymentId: paymentId, type: "ESCROW_DEPOSIT", status: "COMPLETED" } }) : null;
  const campaignId = slot?.campaignId ?? deposit?.campaignId ?? null;
  const campaign = campaignId ? await tx.appCampaign.findUnique({ where: { id: campaignId } }) : null;
  const previous = await tx.fundingReversal.upsert({
    where: { paymentId }, create: { paymentId }, update: {},
  });
  const credited = topUp && ["SUCCEEDED", "REFUNDED"].includes(topUp.status);
  if (credited && topUp.stripePaymentIntentId !== paymentId) throw new Error("Stripe reversal does not match the credited top-up payment.");
  const creditCents = credited ? topUp.creditCents : slot ? slot.stipendCents + slot.platformFeeCents : deposit?.amountCents ?? 0;
  const reversedCents = reversedFundingCents(creditCents, externalRefunds, disputedCents);
  const delta = reversedCents - previous.appliedCents;
  const userId = topUp?.userId ?? campaign?.developerId ?? null;
  let returnedReplacementCents = 0;
  if (delta && userId) {
    if (topUp) {
      // A negative balance is explicit funding debt, not spendable credit. New top-ups
      // first repay that debt; returning unused slots also repays it.
      await tx.user.update({ where: { id: userId }, data: { fundingBalanceCents: { decrement: delta } } });
    } else if (campaignId) {
      const nextHold = Math.max(0, campaign!.billingHoldCents + delta);
      await tx.appCampaign.update({ where: { id: campaignId }, data: { billingHoldCents: nextHold } });
      const restoredReplacement = Math.max(0, -delta - campaign!.billingHoldCents);
      returnedReplacementCents = restoredReplacement;
      if (restoredReplacement) {
        await tx.user.update({ where: { id: userId }, data: { fundingBalanceCents: { increment: restoredReplacement } } });
        await releaseReplacementFunding(tx, campaignId, restoredReplacement);
      }
    }
    await tx.walletTransaction.create({ data: {
      userId, campaignId, amountCents: Math.abs(delta), type: delta > 0 ? "FUNDING_REVERSAL" : "FUNDING_RESTORATION",
      status: "COMPLETED", stripePaymentId: paymentId,
      ...(campaignId && delta < 0 ? { invoiceSnapshot: { returnedReplacementCents } } : {}),
      description: delta > 0 ? "Stripe funding reversal: spend/payout backing removed" : "Stripe dispute won: funding backing restored",
    } });
  }
  await tx.fundingReversal.update({ where: { paymentId }, data: { reversedCents: externalRefunds, disputedCents, appliedCents: reversedCents, userId, campaignId, topUpId: topUp?.id ?? null } });
}

export async function handleFundingReversal(type: string, id: string) {
  const stripe = getStripe();
  let chargeId = id;
  if (type.startsWith("charge.dispute.")) {
    const dispute = await stripe.disputes.retrieve(id);
    chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  } else if (type.startsWith("refund.")) {
    const refund = await stripe.refunds.retrieve(id);
    chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id ?? "";
  }
  if (!chargeId) throw new Error("Stripe reversal has no charge.");
  const charge = await stripe.charges.retrieve(chargeId);
  const paymentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentId) return { ignored: true };
  await serializable((tx) => reconcileFundingPayment(tx, paymentId));
  return { fundingReconciled: true };
}

export async function assertCampaignFunding(tx: Prisma.TransactionClient, campaignId: string) {
  const campaign = await tx.appCampaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.billingHoldCents > 0) throw new Error("This cohort has reversed or disputed funding. Replace its missing escrow in Billing before releasing payouts or accepting testers.");
  const developer = await tx.user.findUniqueOrThrow({ where: { id: campaign.developerId } });
  if (developer.fundingBalanceCents < 0 && (campaign.fundingModel === "PAY_PER_TESTER" || await tx.fundingAllocation.findFirst({ where: { campaignId } }))) throw new Error("Funding debt affects this cohort. Add funds to replace the reversed balance before releasing payouts or accepting testers.");
}

export async function allocateSlotFunding(tx: Prisma.TransactionClient, userId: string, slotChargeId: string, campaignId: string, amountCents: number) {
  const topUps = await tx.balanceTopUp.findMany({ where: { userId, status: "SUCCEEDED" }, orderBy: { createdAt: "asc" } });
  let remaining = amountCents;
  for (const topUp of topUps) {
    const allocations = await tx.fundingAllocation.findMany({ where: { topUpId: topUp.id } });
    const reversal = topUp.stripePaymentIntentId ? await tx.fundingReversal.findUnique({ where: { paymentId: topUp.stripePaymentIntentId } }) : null;
    const available = Math.max(0, topUp.creditCents - topUp.refundedCents - (reversal?.appliedCents ?? 0) - allocations.reduce((sum, row) => sum + row.amountCents - row.releasedCents, 0));
    const allocated = Math.min(remaining, available);
    if (allocated) await tx.fundingAllocation.create({ data: { topUpId: topUp.id, slotChargeId, campaignId, amountCents: allocated } });
    remaining -= allocated;
    if (!remaining) break;
  }
  // Legacy/imported opening balances have no card lot. They remain visible as
  // unallocated provenance and are conservatively held if their owner incurs debt.
}

export async function replaceCampaignFunding(userId: string, campaignId: string) {
  return serializable(async (tx) => {
    const campaign = await tx.appCampaign.findUniqueOrThrow({ where: { id: campaignId } });
    if (campaign.developerId !== userId || campaign.billingHoldCents <= 0) throw new Error("No missing escrow to replace for your campaign.");
    const amount = campaign.billingHoldCents;
    const debit = await tx.user.updateMany({ where: { id: userId, fundingBalanceCents: { gte: amount } }, data: { fundingBalanceCents: { decrement: amount } } });
    if (!debit.count) throw new Error("Add enough prepaid balance to replace the missing escrow first.");
    await tx.appCampaign.update({ where: { id: campaignId }, data: { billingHoldCents: 0 } });
    const deposit = await tx.walletTransaction.create({ data: { userId, campaignId, amountCents: amount, type: "ESCROW_DEPOSIT", status: "COMPLETED", description: "Replacement backing for reversed campaign funding" } });
    await allocateSlotFunding(tx, userId, `replacement:${deposit.id}`, campaignId, amount);
    return amount;
  });
}

export async function releaseReplacementFunding(tx: Prisma.TransactionClient, campaignId: string, amountCents: number) {
  const allocations = await tx.fundingAllocation.findMany({ where: { campaignId, slotChargeId: { startsWith: "replacement:" } } });
  let remaining = amountCents;
  for (const allocation of allocations) {
    const released = Math.min(remaining, allocation.amountCents - allocation.releasedCents);
    if (released > 0) await tx.fundingAllocation.update({ where: { id: allocation.id }, data: { releasedCents: { increment: released } } });
    remaining -= released;
    if (!remaining) break;
  }
}
