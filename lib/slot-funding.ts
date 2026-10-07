import { CampaignStatus, Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import { autoReloadBalance, billingCompanySnapshot, sweepStaleTopUps } from "@/lib/funding-balance";
import { quoteSlotCharge, type SlotChargeQuote } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
import { startWindowHours } from "@/lib/quest-rules";
import { getStripe } from "@/lib/stripe";
import { formatCents, usdToCents } from "@/lib/utils";

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

export type AcceptWithFundingResult = { accepted: boolean; charged: SlotChargeQuote | null; message: string; balanceCents?: number };

type AcceptPlan =
  | { kind: "credit" }
  | { kind: "debited"; quote: SlotChargeQuote; balanceCents: number }
  | { kind: "short"; quote: SlotChargeQuote; balanceCents: number };

function acceptFromBalance(developerId: string, applicationId: string) {
  return serializable(async (tx): Promise<AcceptPlan> => {
    const application = await tx.missionApplication.findUnique({ where: { id: applicationId }, include: { campaign: true } });
    if (!application || application.campaign.developerId !== developerId || application.status !== "PENDING") throw new Error("Pending application not found for your campaign.");
    const campaign = application.campaign;
    if (campaign.fundingModel !== "PAY_PER_TESTER") throw new Error("This cohort is prepaid; accept testers normally.");
    if (campaign.status !== CampaignStatus.ACTIVE || campaignHasEnded(campaign)) throw new Error("This cohort is not accepting testers.");
    const [holds, paid] = await Promise.all([
      activeHolds(tx, campaign.id),
      tx.slotCharge.findMany({ where: { campaignId: campaign.id, status: "SUCCEEDED" }, select: { stipendCents: true, platformFeeCents: true } }),
    ]);
    if (campaign.claimedSlots + holds >= campaign.totalSlots) throw new Error("All tester places in this cohort are already reserved.");
    const accept = () => tx.missionApplication.update({ where: { id: application.id }, data: { status: "ACCEPTED", startBy: acceptanceDeadline(campaign.expiresAt) } });

    if (unusedPaidSlots(paid.length, campaign.claimedSlots, holds) > 0) {
      await accept();
      return { kind: "credit" };
    }

    const quote = quoteSlotCharge(
      usdToCents(campaign.bountyPerTaskUsd),
      paid.reduce((sum, charge) => sum + charge.stipendCents, 0),
      paid.reduce((sum, charge) => sum + charge.platformFeeCents, 0),
    );
    const debited = await tx.user.updateMany({ where: { id: developerId, fundingBalanceCents: { gte: quote.totalCents } }, data: { fundingBalanceCents: { decrement: quote.totalCents } } });
    const developer = await tx.user.findUnique({ where: { id: developerId }, select: { fundingBalanceCents: true } });
    const balanceCents = developer?.fundingBalanceCents ?? 0;
    if (!debited.count) return { kind: "short", quote, balanceCents };

    const transaction = await tx.walletTransaction.create({
      data: {
        userId: developerId,
        amountCents: quote.totalCents,
        campaignId: campaign.id,
        platformFeeCents: quote.platformFeeCents,
        invoiceSnapshot: {
          version: 1,
          kind: "SLOT",
          cohortId: campaign.id,
          cohortTitle: campaign.title,
          rewardPoolCents: quote.stipendCents,
          platformFeeCents: quote.platformFeeCents,
          processingFeeCents: 0,
          company: await billingCompanySnapshot(tx, developerId),
        },
        type: TransactionType.ESCROW_DEPOSIT,
        status: TransactionStatus.COMPLETED,
        description: `Tester slot for ${campaign.title} (${campaign.id}), paid from balance`,
      },
      select: { id: true },
    });
    await tx.slotCharge.create({ data: { campaignId: campaign.id, applicationId: application.id, ...quote, processingFeeCents: 0, status: "SUCCEEDED", transactionId: transaction.id } });
    await accept();
    return { kind: "debited", quote, balanceCents };
  });
}

// Accepts a tester on a pay-per-tester cohort, drawing one slot (reward + platform fee) from the prepaid balance.
// If the balance is short and auto-reload is on, the saved card is topped up once and the acceptance retried.
export async function acceptApplicationWithFunding(developerId: string, applicationId: string): Promise<AcceptWithFundingResult> {
  let plan = await acceptFromBalance(developerId, applicationId);
  let reloadNote = "";
  if (plan.kind === "short") {
    const developer = await prisma.user.findUnique({ where: { id: developerId }, select: { autoReloadCents: true } });
    if ((developer?.autoReloadCents ?? 0) > 0) {
      const reload = await autoReloadBalance(developerId, plan.quote.totalCents - plan.balanceCents, applicationId);
      if (reload) reloadNote = ` Auto-reload added ${formatCents(reload.creditCents)} to your balance (card charged ${formatCents(reload.totalCents)}).`;
      plan = await acceptFromBalance(developerId, applicationId);
    }
  }
  if (plan.kind === "credit") return { accepted: true, charged: null, message: "Accepted using an already-paid place. Nothing new was drawn from your balance. The tester has up to 24 hours to start." };
  if (plan.kind === "short") {
    return { accepted: false, charged: null, balanceCents: plan.balanceCents, message: `Your balance is ${formatCents(plan.balanceCents)}; this tester needs ${formatCents(plan.quote.totalCents)}. Add funds in Billing, then accept again.` };
  }
  return {
    accepted: true,
    charged: plan.quote,
    balanceCents: plan.balanceCents,
    message: `Accepted. ${formatCents(plan.quote.totalCents)} drawn from your balance (reward ${formatCents(plan.quote.stipendCents)} + platform fee ${formatCents(plan.quote.platformFeeCents)}); ${formatCents(plan.balanceCents)} left.${reloadNote} The tester has up to 24 hours to start.`,
  };
}

// Returns an unused place to the developer's balance. Legacy card-charged places are refunded to the card.
async function refundSlotCharge(chargeId: string) {
  const charge = await prisma.slotCharge.findUnique({ where: { id: chargeId }, include: { campaign: { select: { developerId: true, title: true } } } });
  if (!charge || charge.status !== "SUCCEEDED") return 0;
  const amount = charge.stipendCents + charge.platformFeeCents;
  const refund = charge.stripePaymentIntentId
    ? await getStripe().refunds.create({ payment_intent: charge.stripePaymentIntentId, amount, metadata: { type: "SEEDENV_SLOT_REFUND", slotChargeId: charge.id } }, { idempotencyKey: `seedenv-slot-refund-${charge.id}` })
    : null;
  return serializable(async (tx) => {
    const updated = await tx.slotCharge.updateMany({ where: { id: charge.id, status: "SUCCEEDED" }, data: { status: "REFUNDED", stripeRefundId: refund?.id ?? null, refundedAt: new Date() } });
    if (!updated.count) return 0;
    if (!refund) await tx.user.update({ where: { id: charge.campaign.developerId }, data: { fundingBalanceCents: { increment: amount } } });
    await tx.appCampaign.update({ where: { id: charge.campaignId }, data: { refundedCents: { increment: amount } } });
    await tx.walletTransaction.create({ data: { userId: charge.campaign.developerId, amountCents: amount, campaignId: charge.campaignId, platformFeeCents: -charge.platformFeeCents, type: TransactionType.ESCROW_REFUND, status: TransactionStatus.COMPLETED, stripePaymentId: refund?.id ?? null, description: refund ? `Unused tester slot refunded for ${charge.campaign.title} (${charge.campaignId})` : `Unused tester place credited to balance for ${charge.campaign.title} (${charge.campaignId})` } });
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

// Returns paid-but-unused tester places (to the balance) once a cohort has ended (cancelled or expired). Safe to repeat.
export async function reconcileCampaignFunding(campaignId: string, now = new Date()) {
  const campaign = await prisma.appCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || !campaignHasEnded(campaign, now)) return { refundedCents: 0, finalized: false };
  let refundedCents = 0;
  if (campaign.fundingModel === "PAY_PER_TESTER") {
    const [holds, paid] = await Promise.all([
      prisma.missionApplication.count({ where: { campaignId, status: "ACCEPTED", startBy: { gt: now } } }),
      prisma.slotCharge.findMany({ where: { campaignId, status: "SUCCEEDED" }, orderBy: { createdAt: "desc" }, select: { id: true } }),
    ]);
    // Refund newest charges first so the cumulative platform-fee floor unwinds in order.
    for (const charge of paid.slice(0, unusedPaidSlots(paid.length, campaign.claimedSlots, holds))) refundedCents += await refundSlotCharge(charge.id);
  } else if (process.env.STRIPE_SECRET_KEY) {
    refundedCents += await refundPrepaidCampaign(campaignId);
  }
  const inProgress = await prisma.submission.count({ where: { campaignId, status: "PENDING" } });
  const finalized = inProgress === 0 && campaign.status !== CampaignStatus.COMPLETED && campaign.status !== CampaignStatus.DRAFT;
  if (finalized) {
    const completed = await prisma.appCampaign.updateMany({ where: { id: campaignId, status: { in: [CampaignStatus.ACTIVE, CampaignStatus.PAUSED, CampaignStatus.ESCROW_PENDING] } }, data: { status: CampaignStatus.COMPLETED } });
    // The AI release report is best-effort and must never delay or fail settlement.
    if (completed.count === 1) void import("@/lib/ai/campaign-synthesis").then(({ synthesizeCampaign }) => synthesizeCampaign(campaignId)).catch(() => undefined);
  }
  return { refundedCents, finalized };
}

let sweepInFlight: Promise<{ refundedCents: number; campaigns: number }> | null = null;

// Background safety net: settles interrupted top-ups and returns unused places on ended cohorts.
export function sweepCampaignFunding(now = new Date(), limit = 25) {
  if (sweepInFlight) return sweepInFlight;
  sweepInFlight = (async () => {
    try { await sweepStaleTopUps(now, limit); } catch (error) { console.warn("SeedEnv stale top-up sweep failed:", error instanceof Error ? error.message : error); }
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

// Ends a cohort: closes applications, keeps in-progress testers' pay safe, and returns unused paid places.
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
