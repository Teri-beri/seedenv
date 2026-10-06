import { CampaignStatus, Prisma, type SlotChargeStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { billingDetailsSchema } from "@/lib/enterprise-rules";
import { quoteSlotCharge, type SlotChargeQuote } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
import { startWindowHours } from "@/lib/quest-rules";
import { getStripe } from "@/lib/stripe";
import { formatCents, usdToCents } from "@/lib/utils";

export const STALE_SLOT_CHARGE_MS = 15 * 60 * 1000;

type CampaignWindow = { status: CampaignStatus; cancelledAt: Date | null; expiresAt: Date };

export function campaignHasEnded(campaign: CampaignWindow, now = new Date()) {
  return Boolean(campaign.cancelledAt) || campaign.status === CampaignStatus.COMPLETED || campaign.expiresAt <= now;
}

// Paid slots not tied to an approved, in-progress, or accepted tester.
export function unusedPaidSlots(paidSlots: number, claimedSlots: number, activeHolds: number) {
  return Math.max(0, paidSlots - Math.max(0, claimedSlots) - Math.max(0, activeHolds));
}

// Prepaid cohorts: unused stipends are refundable; the platform fee only when no tester ever started.
export function prepaidRefundTargetCents(input: { totalSlots: number; claimedSlots: number; bountyCents: number; platformFeeCents: number; submissionsEver: number }) {
  const unusedStipends = Math.max(0, input.totalSlots - Math.max(0, input.claimedSlots)) * input.bountyCents;
  return unusedStipends + (input.submissionsEver === 0 ? input.platformFeeCents : 0);
}

function acceptanceDeadline(expiresAt: Date) {
  return new Date(Math.min(expiresAt.getTime(), Date.now() + startWindowHours * 3600000));
}

async function activeHolds(tx: Prisma.TransactionClient, campaignId: string) {
  return tx.missionApplication.count({ where: { campaignId, status: "ACCEPTED", startBy: { gt: new Date() } } });
}

function stripeErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
}

function declineMessage(code: string) {
  if (code === "authentication_required") return "Your bank asked for card authentication, which can't happen automatically. Update your card in Billing and accept again.";
  if (code === "card_declined" || code === "insufficient_funds" || code === "expired_card") return "Your card was declined, so this tester was not accepted. Update your card in Billing and try again.";
  return "We couldn't charge your saved card, so this tester was not accepted. Check your card in Billing and try again.";
}

async function savedPaymentMethod(stripeCustomerId: string | null) {
  if (!stripeCustomerId) return null;
  try {
    const customer = await getStripe().customers.retrieve(stripeCustomerId);
    if (customer.deleted) return null;
    const method = customer.invoice_settings.default_payment_method;
    return typeof method === "string" ? method : method?.id || null;
  } catch {
    return null;
  }
}

async function recordSucceededCharge(tx: Prisma.TransactionClient, chargeId: string, paymentIntentId: string) {
  const charge = await tx.slotCharge.findUnique({ where: { id: chargeId }, include: { campaign: { select: { id: true, title: true, developerId: true } } } });
  if (!charge) throw new Error("Slot charge record is missing.");
  if (charge.status === "SUCCEEDED" || charge.status === "REFUNDED") return charge;
  const profile = await tx.billingProfile.findUnique({ where: { userId: charge.campaign.developerId } });
  const company = profile ? billingDetailsSchema.safeParse({ ...profile, taxId: profile.taxId || "", billingEmail: profile.billingEmail || "", addressLine2: profile.addressLine2 || "", region: profile.region || "" }) : null;
  const transaction = await tx.walletTransaction.create({
    data: {
      userId: charge.campaign.developerId,
      amountCents: charge.totalCents,
      campaignId: charge.campaignId,
      platformFeeCents: charge.platformFeeCents,
      invoiceSnapshot: {
        version: 1,
        cohortId: charge.campaignId,
        cohortTitle: charge.campaign.title,
        rewardPoolCents: charge.stipendCents,
        platformFeeCents: charge.platformFeeCents,
        processingFeeCents: charge.processingFeeCents,
        company: company?.success ? company.data : null,
      },
      type: TransactionType.ESCROW_DEPOSIT,
      status: TransactionStatus.COMPLETED,
      stripePaymentId: paymentIntentId,
      description: `Tester slot for ${charge.campaign.title} (${charge.campaignId})`,
    },
    select: { id: true },
  });
  return tx.slotCharge.update({ where: { id: chargeId }, data: { status: "SUCCEEDED", stripePaymentIntentId: paymentIntentId, transactionId: transaction.id, failureReason: null } });
}

export type SlotChargePreview = { credit: boolean; quote: SlotChargeQuote | null };

// What accepting one more tester would cost right now, per pay-per-tester campaign (read-only).
export async function previewNextSlotCharges(campaignIds: string[]) {
  const previews = new Map<string, SlotChargePreview>();
  if (!campaignIds.length) return previews;
  const campaigns = await prisma.appCampaign.findMany({ where: { id: { in: campaignIds }, fundingModel: "PAY_PER_TESTER" }, select: { id: true, bountyPerTaskUsd: true, claimedSlots: true } });
  await Promise.all(campaigns.map(async (campaign) => {
    const [holds, paid] = await Promise.all([
      prisma.missionApplication.count({ where: { campaignId: campaign.id, status: "ACCEPTED", startBy: { gt: new Date() } } }),
      prisma.slotCharge.findMany({ where: { campaignId: campaign.id, status: "SUCCEEDED" }, select: { stipendCents: true, platformFeeCents: true } }),
    ]);
    if (unusedPaidSlots(paid.length, campaign.claimedSlots, holds) > 0) {
      previews.set(campaign.id, { credit: true, quote: null });
      return;
    }
    previews.set(campaign.id, {
      credit: false,
      quote: quoteSlotCharge(usdToCents(campaign.bountyPerTaskUsd), paid.reduce((sum, charge) => sum + charge.stipendCents, 0), paid.reduce((sum, charge) => sum + charge.platformFeeCents, 0)),
    });
  }));
  return previews;
}

export type AcceptWithFundingResult = { accepted: boolean; charged: SlotChargeQuote | null; message: string };

// Accepts a tester on a pay-per-tester cohort, charging the developer's saved card for one slot first.
export async function acceptApplicationWithFunding(developerId: string, applicationId: string): Promise<AcceptWithFundingResult> {
  const plan = await serializable(async (tx) => {
    const application = await tx.missionApplication.findUnique({ where: { id: applicationId }, include: { campaign: true } });
    if (!application || application.campaign.developerId !== developerId || application.status !== "PENDING") throw new Error("Pending application not found for your campaign.");
    const campaign = application.campaign;
    if (campaign.fundingModel !== "PAY_PER_TESTER") throw new Error("This cohort is prepaid; accept testers normally.");
    if (campaign.status !== CampaignStatus.ACTIVE || campaignHasEnded(campaign)) throw new Error("This cohort is not accepting testers.");
    const [holds, inFlight, paid] = await Promise.all([
      activeHolds(tx, campaign.id),
      tx.slotCharge.findMany({ where: { campaignId: campaign.id, status: "PENDING" }, select: { applicationId: true } }),
      tx.slotCharge.findMany({ where: { campaignId: campaign.id, status: "SUCCEEDED" }, select: { stipendCents: true, platformFeeCents: true } }),
    ]);
    if (inFlight.some((charge) => charge.applicationId === application.id)) throw new Error("A charge for this tester is already processing. Refresh in a moment.");
    if (campaign.claimedSlots + holds + inFlight.length >= campaign.totalSlots) throw new Error("All tester places in this cohort are already reserved.");

    if (unusedPaidSlots(paid.length, campaign.claimedSlots, holds) > 0) {
      await tx.missionApplication.update({ where: { id: application.id }, data: { status: "ACCEPTED", startBy: acceptanceDeadline(campaign.expiresAt) } });
      return { kind: "credit" as const };
    }

    const quote = quoteSlotCharge(
      usdToCents(campaign.bountyPerTaskUsd),
      paid.reduce((sum, charge) => sum + charge.stipendCents, 0),
      paid.reduce((sum, charge) => sum + charge.platformFeeCents, 0),
    );
    const charge = await tx.slotCharge.create({ data: { campaignId: campaign.id, applicationId: application.id, ...quote } });
    return { kind: "charge" as const, chargeId: charge.id, quote, campaignId: campaign.id, campaignTitle: campaign.title };
  });

  if (plan.kind === "credit") return { accepted: true, charged: null, message: "Accepted using an already-paid slot. No new charge. The tester has up to 24 hours to start." };

  const developer = await prisma.user.findUnique({ where: { id: developerId }, select: { stripeCustomerId: true } });
  const fail = async (reason: string) => {
    await prisma.slotCharge.updateMany({ where: { id: plan.chargeId, status: "PENDING" }, data: { status: "FAILED", failureReason: reason.slice(0, 500) } });
  };
  if (!process.env.STRIPE_SECRET_KEY) {
    await fail("Stripe is not configured.");
    throw new Error("Payments are not configured yet. Please try again later.");
  }
  const paymentMethod = await savedPaymentMethod(developer?.stripeCustomerId || null);
  if (!developer?.stripeCustomerId || !paymentMethod) {
    await fail("No saved payment method.");
    throw new Error("Add a card in Billing before accepting testers.");
  }

  class ChargeDeclined extends Error {}
  let paymentIntentId: string;
  try {
    const intent = await getStripe().paymentIntents.create({
      amount: plan.quote.totalCents,
      currency: "usd",
      customer: developer.stripeCustomerId,
      payment_method: paymentMethod,
      off_session: true,
      confirm: true,
      description: `SeedEnv tester slot: ${plan.campaignTitle}`,
      metadata: { type: "SEEDENV_SLOT_CHARGE", slotChargeId: plan.chargeId, campaignId: plan.campaignId, applicationId },
    }, { idempotencyKey: `seedenv-slot-${plan.chargeId}` });
    if (intent.status !== "succeeded") {
      try { await getStripe().paymentIntents.cancel(intent.id); } catch { /* already final */ }
      await fail(`Payment status ${intent.status}`);
      throw new ChargeDeclined(declineMessage(intent.status === "requires_action" ? "authentication_required" : ""));
    }
    paymentIntentId = intent.id;
  } catch (error) {
    const current = await prisma.slotCharge.findUnique({ where: { id: plan.chargeId }, select: { status: true } });
    if (current?.status === "PENDING") await fail(stripeErrorCode(error) || (error instanceof Error ? error.message : "Charge failed"));
    if (error instanceof ChargeDeclined) throw error;
    throw new Error(declineMessage(stripeErrorCode(error)));
  }

  return serializable(async (tx) => {
    await recordSucceededCharge(tx, plan.chargeId, paymentIntentId);
    const application = await tx.missionApplication.findUnique({ where: { id: applicationId }, include: { campaign: true } });
    const campaign = application?.campaign;
    const holds = campaign ? await activeHolds(tx, campaign.id) : 0;
    if (!application || !campaign || application.status !== "PENDING" || campaign.status !== CampaignStatus.ACTIVE || campaignHasEnded(campaign) || campaign.claimedSlots + holds >= campaign.totalSlots) {
      return { accepted: false, charged: plan.quote, message: `Charged ${formatCents(plan.quote.totalCents)}, but this application changed before acceptance. The paid slot will be used for your next accepted tester or refunded when the cohort ends.` };
    }
    await tx.missionApplication.update({ where: { id: application.id }, data: { status: "ACCEPTED", startBy: acceptanceDeadline(campaign.expiresAt) } });
    return { accepted: true, charged: plan.quote, message: `Accepted. Charged ${formatCents(plan.quote.totalCents)} (stipend ${formatCents(plan.quote.stipendCents)} + platform fee ${formatCents(plan.quote.platformFeeCents)} + card processing ${formatCents(plan.quote.processingFeeCents)}). The tester has up to 24 hours to start.` };
  });
}

async function refundSlotCharge(chargeId: string) {
  const charge = await prisma.slotCharge.findUnique({ where: { id: chargeId }, include: { campaign: { select: { developerId: true, title: true } } } });
  if (!charge || charge.status !== "SUCCEEDED" || !charge.stripePaymentIntentId) return 0;
  const amount = charge.stipendCents + charge.platformFeeCents;
  const refund = await getStripe().refunds.create({ payment_intent: charge.stripePaymentIntentId, amount, metadata: { type: "SEEDENV_SLOT_REFUND", slotChargeId: charge.id } }, { idempotencyKey: `seedenv-slot-refund-${charge.id}` });
  return serializable(async (tx) => {
    const updated = await tx.slotCharge.updateMany({ where: { id: charge.id, status: "SUCCEEDED" }, data: { status: "REFUNDED", stripeRefundId: refund.id, refundedAt: new Date() } });
    if (!updated.count) return 0;
    await tx.appCampaign.update({ where: { id: charge.campaignId }, data: { refundedCents: { increment: amount } } });
    await tx.walletTransaction.create({ data: { userId: charge.campaign.developerId, amountCents: amount, campaignId: charge.campaignId, platformFeeCents: -charge.platformFeeCents, type: TransactionType.ESCROW_REFUND, status: TransactionStatus.COMPLETED, stripePaymentId: refund.id, description: `Unused tester slot refunded for ${charge.campaign.title} (${charge.campaignId})` } });
    return amount;
  });
}

async function refundPrepaidCampaign(campaignId: string) {
  const campaign = await prisma.appCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.fundingModel !== "PREPAID") return 0;
  const deposit = await prisma.walletTransaction.findFirst({ where: { campaignId, type: TransactionType.ESCROW_DEPOSIT, status: TransactionStatus.COMPLETED, stripePaymentId: { not: null } }, orderBy: { createdAt: "asc" } });
  if (!deposit?.stripePaymentId) return 0;
  const submissionsEver = await prisma.submission.count({ where: { campaignId } });
  const target = Math.min(deposit.amountCents, prepaidRefundTargetCents({
    totalSlots: campaign.totalSlots,
    claimedSlots: campaign.claimedSlots,
    bountyCents: usdToCents(campaign.bountyPerTaskUsd),
    platformFeeCents: deposit.platformFeeCents ?? usdToCents(campaign.platformFeeUsd),
    submissionsEver,
  }));
  const delta = target - campaign.refundedCents;
  if (delta <= 0) return 0;
  const refund = await getStripe().refunds.create({ payment_intent: deposit.stripePaymentId, amount: delta, metadata: { type: "SEEDENV_PREPAID_REFUND", campaignId } }, { idempotencyKey: `seedenv-prepaid-refund-${campaignId}-${target}` });
  return serializable(async (tx) => {
    const updated = await tx.appCampaign.updateMany({ where: { id: campaignId, refundedCents: campaign.refundedCents }, data: { refundedCents: target } });
    if (!updated.count) return 0;
    const feeRefund = submissionsEver === 0 ? Math.max(0, Math.min(delta, deposit.platformFeeCents ?? 0)) : 0;
    await tx.walletTransaction.create({ data: { userId: campaign.developerId, amountCents: delta, campaignId, platformFeeCents: -feeRefund, type: TransactionType.ESCROW_REFUND, status: TransactionStatus.COMPLETED, stripePaymentId: refund.id, description: `Unused escrow refunded for ${campaign.title} (${campaignId})` } });
    return delta;
  });
}

// Refunds any paid-but-unused tester slots once a cohort has ended (cancelled or expired). Safe to repeat.
export async function reconcileCampaignFunding(campaignId: string, now = new Date()) {
  const campaign = await prisma.appCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || !campaignHasEnded(campaign, now) || !process.env.STRIPE_SECRET_KEY) return { refundedCents: 0, finalized: false };
  let refundedCents = 0;
  if (campaign.fundingModel === "PAY_PER_TESTER") {
    const [holds, paid] = await Promise.all([
      prisma.missionApplication.count({ where: { campaignId, status: "ACCEPTED", startBy: { gt: now } } }),
      prisma.slotCharge.findMany({ where: { campaignId, status: "SUCCEEDED" }, orderBy: { createdAt: "desc" }, select: { id: true } }),
    ]);
    // Refund newest charges first so the cumulative platform-fee floor unwinds in order.
    for (const charge of paid.slice(0, unusedPaidSlots(paid.length, campaign.claimedSlots, holds))) refundedCents += await refundSlotCharge(charge.id);
  } else {
    refundedCents += await refundPrepaidCampaign(campaignId);
  }
  const inProgress = await prisma.submission.count({ where: { campaignId, status: "PENDING" } });
  const finalized = inProgress === 0 && campaign.status !== CampaignStatus.COMPLETED && campaign.status !== CampaignStatus.DRAFT;
  if (finalized) await prisma.appCampaign.updateMany({ where: { id: campaignId, status: { in: [CampaignStatus.ACTIVE, CampaignStatus.PAUSED, CampaignStatus.ESCROW_PENDING] } }, data: { status: CampaignStatus.COMPLETED } });
  return { refundedCents, finalized };
}

async function resolveStaleCharge(chargeId: string) {
  const stripe = getStripe();
  const found = await stripe.paymentIntents.search({ query: `metadata['slotChargeId']:'${chargeId.replace(/[^a-zA-Z0-9_-]/g, "")}'`, limit: 1 });
  const intent = found.data[0];
  if (intent?.status === "succeeded") {
    await serializable((tx) => recordSucceededCharge(tx, chargeId, intent.id));
    return "SUCCEEDED" as SlotChargeStatus;
  }
  if (intent && !["canceled", "requires_payment_method"].includes(intent.status)) {
    try { await stripe.paymentIntents.cancel(intent.id); } catch { return "PENDING" as SlotChargeStatus; }
  }
  await prisma.slotCharge.updateMany({ where: { id: chargeId, status: "PENDING" }, data: { status: "FAILED", failureReason: "Charge did not complete." } });
  return "FAILED" as SlotChargeStatus;
}

let sweepInFlight: Promise<{ refundedCents: number; campaigns: number }> | null = null;

// Background safety net: settles interrupted charges and refunds unused slots on ended cohorts.
export function sweepCampaignFunding(now = new Date(), limit = 25) {
  if (!process.env.STRIPE_SECRET_KEY) return Promise.resolve({ refundedCents: 0, campaigns: 0 });
  if (sweepInFlight) return sweepInFlight;
  sweepInFlight = (async () => {
    const stale = await prisma.slotCharge.findMany({ where: { status: "PENDING", createdAt: { lte: new Date(now.getTime() - STALE_SLOT_CHARGE_MS) } }, take: limit, select: { id: true } });
    for (const charge of stale) {
      try { await resolveStaleCharge(charge.id); } catch (error) { console.warn("SeedEnv stale slot charge check failed:", error instanceof Error ? error.message : error); }
    }
    const ended = await prisma.appCampaign.findMany({
      where: { status: { in: [CampaignStatus.ACTIVE, CampaignStatus.PAUSED, CampaignStatus.ESCROW_PENDING] }, OR: [{ cancelledAt: { not: null } }, { expiresAt: { lte: now } }] },
      orderBy: { expiresAt: "asc" },
      take: limit,
      select: { id: true },
    });
    let refundedCents = 0;
    for (const campaign of ended) {
      try { refundedCents += (await reconcileCampaignFunding(campaign.id, now)).refundedCents; } catch (error) { console.warn("SeedEnv cohort refund reconciliation failed:", error instanceof Error ? error.message : error); }
    }
    return { refundedCents, campaigns: ended.length };
  })().finally(() => { sweepInFlight = null; });
  return sweepInFlight;
}

// Ends a cohort: closes applications, keeps in-progress testers' pay safe, and refunds unused paid slots.
export async function cancelCohort(developerId: string, campaignId: string, isAdmin = false) {
  const summary = await serializable(async (tx) => {
    const campaign = await tx.appCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || (campaign.developerId !== developerId && !isAdmin)) throw new Error("Cohort not found.");
    if (campaign.cancelledAt || campaign.status === CampaignStatus.COMPLETED) throw new Error("This cohort has already ended.");
    if (campaign.status === CampaignStatus.DRAFT) throw new Error("Drafts are not live. Delete or edit the draft instead.");
    const open = await tx.missionApplication.findMany({ where: { campaignId, status: { in: ["PENDING", "ACCEPTED"] } } });
    for (const application of open) {
      await tx.missionApplication.update({ where: { id: application.id }, data: { status: application.status === "PENDING" ? "DECLINED" : "WITHDRAWN", passReserved: false } });
      if (application.passReserved) await tx.user.update({ where: { id: application.testerId }, data: { discoveryPasses: { increment: 1 } } });
    }
    await tx.appCampaign.update({ where: { id: campaignId }, data: { cancelledAt: new Date(), status: campaign.status === CampaignStatus.ACTIVE ? CampaignStatus.PAUSED : campaign.status } });
    const inProgress = await tx.submission.count({ where: { campaignId, status: "PENDING" } });
    return { closedApplications: open.length, inProgress };
  });
  let refundedCents = 0;
  try {
    refundedCents = (await reconcileCampaignFunding(campaignId)).refundedCents;
  } catch (error) {
    console.error("SeedEnv cohort cancellation refund failed; the sweep will retry:", error);
  }
  return { ...summary, refundedCents };
}
