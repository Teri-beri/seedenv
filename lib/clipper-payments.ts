import "server-only";
import type Stripe from "stripe";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
import { getStripe } from "@/lib/stripe";
import { assertClipTransition } from "@/lib/clipper-rules";

export async function fundClipAgreement(id: string, developerId: string) {
  const stripe = getStripe();
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin || !origin.startsWith("https://")) throw new Error("A public HTTPS NEXT_PUBLIC_APP_URL is required for Clippers checkout.");
  const item = await prisma.clipEngagement.findUnique({ where: { id }, include: { campaign: true, creator: { select: { stripeConnectAccountId: true } } } });
  if (!item || item.campaign.developerId !== developerId) throw new Error("Agreement not found for your campaign.");
  assertClipTransition(item.status, ["ACCEPTED", "FUNDING"]);
  if (!item.creator.stripeConnectAccountId) throw new Error("The creator must finish Stripe payout setup before you fund this agreement.");
  const account = await stripe.accounts.retrieve(item.creator.stripeConnectAccountId);
  if (!account.payouts_enabled || account.capabilities?.transfers !== "active") throw new Error("The creator's Stripe account is not ready to receive payments.");
  if (item.status === "FUNDING" && item.checkoutId) {
    const previous = await stripe.checkout.sessions.retrieve(item.checkoutId);
    if (previous.status === "open" && previous.url) return previous.url;
    throw new Error("This checkout is processing or expired. Wait for the signed payment webhook to update the agreement.");
  }
  const fundingAttempt = await serializable(async (tx) => {
    const current = await tx.clipEngagement.findUniqueOrThrow({ where: { id } });
    assertClipTransition(current.status, ["ACCEPTED", "FUNDING"]);
    if (current.status === "FUNDING") return current.fundingAttempt;
    const updated = await tx.clipEngagement.update({ where: { id }, data: { status: "FUNDING", fundingAttempt: { increment: 1 } } });
    return updated.fundingAttempt;
  });
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: item.chargeCents, product_data: { name: `Clippers: ${item.campaign.title}`, description: `Creator fee $${(item.feeCents / 100).toFixed(2)} plus platform fee. Creator-owned; 90-day organic repost license after payment.` } } }],
    payment_intent_data: { transfer_group: `clip_${id}`, metadata: { type: "SEEDENV_CLIPPER", engagementId: id } },
    metadata: { type: "SEEDENV_CLIPPER", engagementId: id, fundingAttempt: String(fundingAttempt) },
    success_url: `${origin}/clippers/${item.campaignId}?funding=processing`,
    cancel_url: `${origin}/clippers/${item.campaignId}?funding=cancelled`,
  }, { idempotencyKey: `clip-checkout-${id}-${fundingAttempt}` });
  await prisma.clipEngagement.updateMany({ where: { id, fundingAttempt }, data: { checkoutId: session.id } });
  if (!session.url) throw new Error("Stripe did not return a checkout URL. Contact support before trying again.");
  return session.url;
}

export async function handleClipPaymentEvent(event: { type: Stripe.Event["type"]; data: { object: unknown } }) {
  const stripe = getStripe();
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.expired", "checkout.session.async_payment_failed"].includes(event.type)) {
    const object = z.object({ id: z.string(), metadata: z.record(z.string(), z.string()).nullable().optional() }).parse(event.data.object);
    if (object.metadata?.type !== "SEEDENV_CLIPPER") return;
    const id = object.metadata.engagementId;
    if (!id) throw new Error("Clippers payment is missing its agreement.");
    const session = await stripe.checkout.sessions.retrieve(object.id);
    await serializable(async (tx) => {
      const item = await tx.clipEngagement.findUniqueOrThrow({ where: { id }, include: { campaign: true } });
      if (session.metadata?.fundingAttempt !== String(item.fundingAttempt)) {
        if (session.payment_status === "paid") throw new Error("A stale checkout attempt was paid. Administrator reconciliation is required.");
        return;
      }
      if (item.checkoutId && item.checkoutId !== session.id) throw new Error("Payment session does not match the agreement.");
      if (session.amount_total !== item.chargeCents || session.currency !== "usd" || session.metadata?.engagementId !== id) throw new Error("Payment amount or currency does not match the accepted terms.");
      if (session.payment_status === "paid") {
        if (item.fundedAt) return;
        assertClipTransition(item.status, ["FUNDING"]);
        const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
        if (!intentId) throw new Error("A confirmed payment intent is required.");
        await tx.clipEngagement.update({ where: { id }, data: { status: "FUNDED", fundedAt: new Date(), dueAt: new Date(Date.now() + item.campaign.deliveryDays * 86400000), checkoutId: session.id, paymentIntentId: intentId } });
        await tx.walletTransaction.create({ data: { userId: item.campaign.developerId, amountCents: item.chargeCents, type: "CLIPPER_DEPOSIT", status: "COMPLETED", stripePaymentId: intentId, description: `Pre-funded Clippers agreement ${id}` } });
      } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
        await tx.clipEngagement.updateMany({ where: { id, status: "FUNDING", fundedAt: null }, data: { status: "ACCEPTED", checkoutId: null } });
      }
    });
  }
  if (event.type === "charge.dispute.created" || event.type === "charge.refunded") {
    const chargeId = event.type === "charge.dispute.created" ? z.object({ charge: z.union([z.string(), z.object({ id: z.string() })]) }).parse(event.data.object).charge : z.object({ id: z.string() }).parse(event.data.object).id;
    const charge = await stripe.charges.retrieve(typeof chargeId === "string" ? chargeId : chargeId.id);
    const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (!intentId) return;
    await serializable(async (tx) => {
      const item = await tx.clipEngagement.findUnique({ where: { paymentIntentId: intentId } });
      if (!item || ["CANCEL_PENDING", "CANCELLED"].includes(item.status)) return;
      if (item.status === "PAYMENT_PENDING") {
        await tx.clipEngagement.update({ where: { id: item.id }, data: { disputeReason: "Stripe reported a charge dispute/refund while transfer was pending. Administrator must reconcile the transfer.", disputeOpenedBy: "STRIPE" } });
        return;
      }
      await tx.clipEngagement.update({ where: { id: item.id }, data: { status: "DISPUTED", statusBeforeDispute: item.status === "DISPUTED" ? item.statusBeforeDispute : item.status, disputeReason: "Stripe reported a charge dispute or refund. Administrator payment reconciliation is required.", disputeOpenedBy: "STRIPE" } });
    });
  }
}

export async function releaseClipPayment(id: string, developerId: string) {
  const stripe = getStripe();
  const item = await prisma.clipEngagement.findUnique({ where: { id }, include: { campaign: true, creator: { select: { stripeConnectAccountId: true } } } });
  if (!item || item.campaign.developerId !== developerId) throw new Error("Agreement not found for your campaign.");
  if (item.status === "PAID") return "This creator has already been paid.";
  assertClipTransition(item.status, ["VERIFIED", "PAYMENT_PENDING"]);
  if (!item.verifiedAt || !item.verificationMethod || !item.fundedAt || !item.paymentIntentId || !item.creator.stripeConnectAccountId || !item.approvedDraftId || !item.approvedAt || !item.proofId || !item.publicationUrl) throw new Error("Funding, payout setup, draft approval, publication evidence, and verified publication are required.");
  const evidenceCount = await prisma.clipAsset.count({ where: { engagementId: id, ownerId: item.creatorId, ready: true, OR: [{ id: item.approvedDraftId, kind: "DRAFT" }, { id: item.proofId, kind: "PROOF" }] } });
  if (evidenceCount !== 2) throw new Error("Approved video and publication evidence must be completed private uploads for this agreement.");
  if (item.disputeReason && item.disputeOpenedBy === "STRIPE") throw new Error("Stripe payment reconciliation is required before release.");
  const intent = await stripe.paymentIntents.retrieve(item.paymentIntentId);
  const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
  if (intent.status !== "succeeded" || !chargeId) throw new Error("The developer's payment has not settled.");
  const charge = await stripe.charges.retrieve(chargeId);
  if (charge.refunded || charge.amount_refunded > 0 || charge.disputed) throw new Error("The funding payment is refunded or disputed. Open a dispute instead of releasing funds.");
  const account = await stripe.accounts.retrieve(item.creator.stripeConnectAccountId);
  if (!account.payouts_enabled || account.capabilities?.transfers !== "active") throw new Error("Creator Stripe payout setup needs attention. Funds have not been released.");
  await serializable(async (tx) => {
    const current = await tx.clipEngagement.findUniqueOrThrow({ where: { id } });
    assertClipTransition(current.status, ["VERIFIED", "PAYMENT_PENDING"]);
    if (current.status === "VERIFIED") {
      const payout = await tx.walletTransaction.create({ data: { userId: current.creatorId, amountCents: current.feeCents, type: "CLIPPER_PAYOUT", status: "PENDING", description: `Clippers payout ${id}` } });
      await tx.clipEngagement.update({ where: { id }, data: { status: "PAYMENT_PENDING", payoutTransactionId: payout.id, payoutDestinationId: item.creator.stripeConnectAccountId } });
    }
  });
  const pending = await prisma.clipEngagement.findUniqueOrThrow({ where: { id } });
  if (!pending.payoutDestinationId) throw new Error("Payout destination missing. Administrator reconciliation is required.");
  const previousTransfers = await stripe.transfers.list({ transfer_group: `clip_${id}`, limit: 100 });
  if (previousTransfers.has_more || previousTransfers.data.length > 1) throw new Error("Multiple transfers require administrator reconciliation.");
  const previousTransfer = previousTransfers.data[0];
  if (previousTransfer && (previousTransfer.amount !== item.feeCents || previousTransfer.reversed || (typeof previousTransfer.destination === "string" ? previousTransfer.destination : previousTransfer.destination?.id) !== pending.payoutDestinationId)) throw new Error("An existing transfer does not match this agreement. Administrator reconciliation is required.");
  const transfer = previousTransfer || await stripe.transfers.create({ amount: item.feeCents, currency: "usd", destination: pending.payoutDestinationId, source_transaction: chargeId, transfer_group: `clip_${id}`, metadata: { engagementId: id } }, { idempotencyKey: `clip-transfer-${id}` });
  await serializable(async (tx) => {
    const current = await tx.clipEngagement.findUniqueOrThrow({ where: { id } });
    if (current.status === "PAID") return;
    assertClipTransition(current.status, ["PAYMENT_PENDING"]);
    if (!current.payoutTransactionId) throw new Error("Payout ledger missing; administrator reconciliation is required.");
    const paidAt = new Date();
    await tx.clipEngagement.update({ where: { id }, data: { status: "PAID", transferId: transfer.id, paidAt, licenseEndsAt: new Date(paidAt.getTime() + 90 * 86400000), reviewDueAt: null } });
    await tx.walletTransaction.update({ where: { id: current.payoutTransactionId }, data: { status: "COMPLETED", stripePaymentId: transfer.id } });
    await tx.user.update({ where: { id: current.creatorId }, data: { walletBalanceCents: { increment: current.feeCents } } });
  });
  const paidItem = await prisma.clipEngagement.findUniqueOrThrow({ where: { id } });
  return `Creator fee transferred to Stripe. Organic repost license ends ${paidItem.licenseEndsAt?.toISOString().slice(0, 10)}. Bank payout timing is controlled by Stripe.`;
}

export async function refundClipPayment(id: string, userId: string, role: string, note: string) {
  const stripe = getStripe();
  const item = await prisma.clipEngagement.findUnique({ where: { id }, include: { campaign: true } });
  if (!item || (item.campaign.developerId !== userId && role !== "ADMIN")) throw new Error("Agreement unavailable.");
  if (item.status === "CANCELLED") return "This agreement is already cancelled.";
  const allowed = role === "ADMIN" ? ["FUNDED", "DISPUTED", "CANCEL_PENDING"] : ["FUNDED", "CANCEL_PENDING"];
  assertClipTransition(item.status, allowed);
  if (item.transferId || item.payoutTransactionId) throw new Error("A transfer exists. Stripe reconciliation is required; this refund shortcut is unavailable.");
  if (role !== "ADMIN" && await prisma.clipAsset.count({ where: { engagementId: id, kind: "DRAFT" } })) throw new Error("The creator has started uploading work. Open a dispute instead of cancelling.");
  if (!item.paymentIntentId) throw new Error("There is no funded payment to refund.");
  await serializable(async (tx) => {
    const current = await tx.clipEngagement.findUniqueOrThrow({ where: { id } });
    assertClipTransition(current.status, allowed);
    if (role !== "ADMIN" && await tx.clipAsset.count({ where: { engagementId: id, kind: "DRAFT" } })) throw new Error("Work has started. Administrator review is required.");
    await tx.clipEngagement.update({ where: { id }, data: { status: "CANCEL_PENDING", moderationNote: note } });
  });
  const existingRefunds = await stripe.refunds.list({ payment_intent: item.paymentIntentId, limit: 100 });
  if (existingRefunds.has_more || existingRefunds.data.length > 1 || existingRefunds.data.some((entry) => entry.amount !== item.chargeCents || entry.metadata?.engagementId !== id)) throw new Error("Existing partial or external refunds require administrator reconciliation.");
  const refund = existingRefunds.data[0] || await stripe.refunds.create({ payment_intent: item.paymentIntentId, metadata: { engagementId: id } }, { idempotencyKey: `clip-refund-${id}` });
  if (refund.status !== "succeeded") throw new Error(`Refund is ${refund.status || "processing"}. The agreement remains locked; retry to reconcile the same refund.`);
  await serializable(async (tx) => {
    const current = await tx.clipEngagement.findUniqueOrThrow({ where: { id } });
    if (current.status === "CANCELLED") return;
    assertClipTransition(current.status, ["CANCEL_PENDING"]);
    await tx.clipEngagement.update({ where: { id }, data: { status: "CANCELLED", refundId: refund.id } });
    await tx.walletTransaction.create({ data: { userId: item.campaign.developerId, amountCents: item.chargeCents, type: "CLIPPER_REFUND", status: "COMPLETED", stripePaymentId: refund.id, description: `Refunded Clippers agreement ${id}` } });
  });
  return "Agreement cancelled and full pre-funding refunded. No repost license was granted.";
}
