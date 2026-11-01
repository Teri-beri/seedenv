import type { BillingOperation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import type { TransferSourceCandidate } from "@/lib/billing-operations";

// Developer payment intents that funded this tester's place, most specific first.
export async function payoutFundingPaymentIds(operation: Pick<BillingOperation, "campaignId" | "userId">) {
  if (!operation.campaignId) return [];
  const ids: string[] = [];
  const add = (id: string | null | undefined) => { if (id && !ids.includes(id)) ids.push(id); };
  const application = await prisma.missionApplication.findUnique({
    where: { campaignId_testerId: { campaignId: operation.campaignId, testerId: operation.userId } },
    select: { id: true },
  });
  const slotCharges = application
    ? await prisma.slotCharge.findMany({ where: { applicationId: application.id, status: "SUCCEEDED" }, orderBy: { createdAt: "asc" } })
    : [];
  const topUpIdsFor = async (where: { slotChargeId: { in: string[] } } | { campaignId: string }) => {
    const allocations = await prisma.fundingAllocation.findMany({ where, orderBy: { amountCents: "desc" } });
    const topUps = await prisma.balanceTopUp.findMany({ where: { id: { in: allocations.map((row) => row.topUpId) }, status: "SUCCEEDED" }, select: { id: true, stripePaymentIntentId: true } });
    for (const allocation of allocations) add(topUps.find((topUp) => topUp.id === allocation.topUpId)?.stripePaymentIntentId);
  };
  if (slotCharges.length) await topUpIdsFor({ slotChargeId: { in: slotCharges.map((charge) => charge.id) } });
  for (const charge of slotCharges) add(charge.stripePaymentIntentId);
  const deposits = await prisma.walletTransaction.findMany({
    where: { campaignId: operation.campaignId, type: "ESCROW_DEPOSIT", status: "COMPLETED", stripePaymentId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { stripePaymentId: true },
  });
  for (const deposit of deposits) add(deposit.stripePaymentId);
  await topUpIdsFor({ campaignId: operation.campaignId });
  return ids;
}

// Resolves each funding payment to a settled card charge and the amount it can still back.
export async function payoutSourceCandidates(operation: Pick<BillingOperation, "campaignId" | "userId">): Promise<TransferSourceCandidate[]> {
  const stripe = getStripe();
  const candidates: TransferSourceCandidate[] = [];
  for (const paymentId of await payoutFundingPaymentIds(operation)) {
    let chargeId: string | undefined;
    if (paymentId.startsWith("pi_")) {
      const intent = await stripe.paymentIntents.retrieve(paymentId);
      if (intent.status !== "succeeded") continue;
      chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    } else if (paymentId.startsWith("ch_") || paymentId.startsWith("py_")) chargeId = paymentId;
    if (!chargeId) continue;
    const charge = await stripe.charges.retrieve(chargeId);
    // Only fully captured, undisputed, unrefunded USD charges can back a transfer.
    if (!charge || charge.status !== "succeeded" || !charge.paid || !charge.captured || charge.disputed || charge.refunded || charge.currency !== "usd") continue;
    const capacityCents = charge.amount - charge.amount_refunded;
    if (capacityCents > 0) candidates.push({ chargeId: charge.id, capacityCents });
  }
  return candidates;
}
