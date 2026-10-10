import { CampaignStatus, Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import { currentInstructionVersion } from "@/lib/instruction-versions";
import { autoReloadBalance, billingCompanySnapshot, sweepStaleTopUps } from "@/lib/funding-balance";
import { quoteSlotCharge, type SlotChargeQuote } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { billingTransaction as serializable } from "@/lib/billing-transaction";
import { startWindowHours } from "@/lib/quest-rules";
import { formatCents, usdToCents } from "@/lib/utils";
import { cancelFailedRefund, operationRefund, reserveBillingOperation } from "@/lib/billing-operations";
import { allocateSlotFunding, assertCampaignFunding, reconcileFundingPayment, releaseReplacementFunding } from "@/lib/funding-reversals";
import { escrowMissionCredits } from "@/lib/billing/ledger";
import { taxLedgerFields, serviceTaxAudit } from "@/lib/billing/tax-policy";
import { consumeCohortPromo } from "@/lib/cohort-promos";

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
  const campaigns = await prisma.appCampaign.findMany({ where: { id: { in: campaignIds }, fundingModel: "PAY_PER_TESTER" }, select: { id: true, bountyPerTaskUsd: true, claimedSlots: true, platformFeeDiscountPercent: true, developer: { select: { platformFeeWaived: true } } } });
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
      quote: quoteSlotCharge(usdToCents(campaign.bountyPerTaskUsd), paid.reduce((sum, charge) => sum + charge.stipendCents, 0), paid.reduce((sum, charge) => sum + charge.platformFeeCents, 0), campaign.developer.platformFeeWaived, campaign.platformFeeDiscountPercent),
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
    await assertCampaignFunding(tx, campaign.id);
    if (campaign.fundingModel !== "PAY_PER_TESTER") throw new Error("This cohort is prepaid; accept testers normally.");
    if (campaign.status !== CampaignStatus.ACTIVE || campaignHasEnded(campaign)) throw new Error("This cohort is not accepting testers.");
    const [holds, paid] = await Promise.all([
      activeHolds(tx, campaign.id),
      tx.slotCharge.findMany({ where: { campaignId: campaign.id, status: "SUCCEEDED" }, select: { stipendCents: true, platformFeeCents: true } }),
    ]);
    if (campaign.claimedSlots + holds >= campaign.totalSlots) throw new Error("All tester places in this cohort are already reserved.");
    const accept = async () => {
      const version = await currentInstructionVersion(tx, campaign.id);
      return tx.missionApplication.update({ where: { id: application.id }, data: { status: "ACCEPTED", instructionVersionId: version.id, startBy: acceptanceDeadline(campaign.expiresAt) } });
    };

    if (unusedPaidSlots(paid.length, campaign.claimedSlots, holds) > 0) {
      await serviceTaxAudit(tx, developerId);
      await accept();
      return { kind: "credit" };
    }

    const feePolicy = await tx.user.findUniqueOrThrow({ where: { id: developerId }, select: { platformFeeWaived: true } });
    const quote = quoteSlotCharge(
      usdToCents(campaign.bountyPerTaskUsd),
      paid.reduce((sum, charge) => sum + charge.stipendCents, 0),
      paid.reduce((sum, charge) => sum + charge.platformFeeCents, 0),
      feePolicy.platformFeeWaived,
      campaign.platformFeeDiscountPercent,
    );
    const funding = await escrowMissionCredits(tx, developerId, quote.totalCents, campaign.id);
    const developer = await tx.user.findUnique({ where: { id: developerId }, select: { fundingBalanceCents: true } });
    const balanceCents = developer?.fundingBalanceCents ?? 0;
    if (!funding.debited) return { kind: "short", quote, balanceCents };

    const transaction = await tx.walletTransaction.create({
      data: {
        userId: developerId,
        amountCents: quote.totalCents,
        campaignId: campaign.id,
        platformFeeCents: quote.platformFeeCents,
        ...taxLedgerFields(funding.tax),
        invoiceSnapshot: {
          version: 1,
          kind: "SLOT",
          cohortId: campaign.id,
          cohortTitle: campaign.title,
          rewardPoolCents: quote.stipendCents,
          platformFeeCents: quote.platformFeeCents,
          processingFeeCents: 0,
          company: await billingCompanySnapshot(tx, developerId),
          ...(funding.tax ? { tax: funding.tax } : {}),
        },
        type: TransactionType.ESCROW_DEPOSIT,
        status: TransactionStatus.COMPLETED,
        description: `Tester slot for ${campaign.title} (${campaign.id}), paid from balance`,
      },
      select: { id: true },
    });
    const charge = await tx.slotCharge.create({ data: { campaignId: campaign.id, applicationId: application.id, ...quote, processingFeeCents: 0, status: "SUCCEEDED", transactionId: transaction.id } });
    if (campaign.platformFeeDiscountPercent > 0) await consumeCohortPromo(tx, campaign.id);
    await allocateSlotFunding(tx, developerId, charge.id, campaign.id, quote.totalCents);
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
  const operation = await serializable(async (tx) => {
    const existing = await tx.billingOperation.findFirst({ where: { resourceId: chargeId, kind: "SLOT_REFUND", state: { in: ["RESERVED", "SUBMITTED", "FAILED"] } } });
    if (existing) return existing;
    const charge = await tx.slotCharge.findUnique({ where: { id: chargeId }, include: { campaign: true } });
    if (!charge || charge.status !== "SUCCEEDED" || !campaignHasEnded(charge.campaign)) return null;
    const paid = await tx.slotCharge.count({ where: { campaignId: charge.campaignId, status: "SUCCEEDED" } });
    const holds = await activeHolds(tx, charge.campaignId);
    const reservations = await tx.billingOperation.count({ where: { campaignId: charge.campaignId, kind: "SLOT_REFUND", state: { in: ["RESERVED", "SUBMITTED", "FAILED"] } } });
    if (unusedPaidSlots(paid, charge.campaign.claimedSlots, holds) <= reservations) return null;
    if (charge.stripePaymentIntentId) await reconcileFundingPayment(tx, charge.stripePaymentIntentId);
    const reversal = charge.stripePaymentIntentId ? await tx.fundingReversal.findUnique({ where: { paymentId: charge.stripePaymentIntentId } }) : null;
    const amountCents = Math.max(0, charge.stipendCents + charge.platformFeeCents - (reversal?.appliedCents ?? 0));
    if (!amountCents) throw new Error("This slot's card funding is fully reversed. Resolve its funding hold before refunding.");
    // Updating the campaign makes all competing slot reservations conflict/retry.
    await tx.appCampaign.update({ where: { id: charge.campaignId }, data: { refundedCents: { increment: 0 } } });
    const attempt = await tx.billingOperation.count({ where: { resourceId: charge.id, kind: "SLOT_REFUND" } });
    return reserveBillingOperation(tx, { id: `seedenv-slot-refund-${charge.id}-${attempt}`, kind: "SLOT_REFUND", resourceId: charge.id, userId: charge.campaign.developerId, campaignId: charge.campaignId, paymentId: charge.stripePaymentIntentId, amountCents, feeCents: Math.min(charge.platformFeeCents, amountCents) });
  });
  if (!operation) return 0;
  let refund;
  try { refund = operation.paymentId ? await operationRefund(operation) : null; }
  catch (error) { await cancelFailedRefund(operation.id); throw error; }
  return serializable(async (tx) => {
    const current = await tx.billingOperation.findUniqueOrThrow({ where: { id: operation.id } });
    if (current.state === "SETTLED") return 0;
    const charge = await tx.slotCharge.findUniqueOrThrow({ where: { id: operation.resourceId }, include: { campaign: true } });
    const updated = await tx.slotCharge.updateMany({ where: { id: charge.id, status: "SUCCEEDED" }, data: { status: "REFUNDED", stripeRefundId: refund?.id ?? null, refundedAt: new Date() } });
    if (!updated.count) throw new Error("Refund reservation no longer matches its slot ledger. Reconciliation is required.");
    if (!refund) {
      await tx.user.update({ where: { id: charge.campaign.developerId }, data: { fundingBalanceCents: { increment: operation.amountCents } } });
      const allocations = await tx.fundingAllocation.findMany({ where: { slotChargeId: charge.id } });
      for (const allocation of allocations) await tx.fundingAllocation.update({ where: { id: allocation.id }, data: { releasedCents: allocation.amountCents } });
    }
    await tx.appCampaign.update({ where: { id: charge.campaignId }, data: { refundedCents: { increment: operation.amountCents } } });
    await tx.walletTransaction.create({ data: { userId: charge.campaign.developerId, amountCents: operation.amountCents, campaignId: charge.campaignId, platformFeeCents: -operation.feeCents, type: TransactionType.ESCROW_REFUND, status: TransactionStatus.COMPLETED, stripePaymentId: refund?.id ?? null, description: refund ? `Unused tester slot refunded for ${charge.campaign.title} (${charge.campaignId})` : `Unused tester place credited to balance for ${charge.campaign.title} (${charge.campaignId})` } });
    await tx.billingOperation.update({ where: { id: operation.id }, data: { state: "SETTLED", remoteId: refund?.id, error: null } });
    return operation.amountCents;
  });
}

async function refundPrepaidCampaign(campaignId: string) {
  const operation = await serializable(async (tx) => {
    const pending = await tx.billingOperation.findFirst({ where: { resourceId: campaignId, kind: { in: ["PREPAID_REFUND", "PREPAID_BALANCE_REFUND"] }, state: { in: ["RESERVED", "SUBMITTED", "FAILED"] } } });
    if (pending) return pending;
    const campaign = await tx.appCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.fundingModel !== "PREPAID" || !campaignHasEnded(campaign)) return null;
    const deposit = await tx.walletTransaction.findFirst({ where: { campaignId, type: TransactionType.ESCROW_DEPOSIT, status: TransactionStatus.COMPLETED, stripePaymentId: { not: null } }, orderBy: { createdAt: "asc" } });
    if (!deposit?.stripePaymentId) return null;
    await reconcileFundingPayment(tx, deposit.stripePaymentId);
    const reversal = await tx.fundingReversal.findUnique({ where: { paymentId: deposit.stripePaymentId } });
    const submissionsEver = await tx.submission.count({ where: { campaignId } });
    const target = Math.min(deposit.amountCents, prepaidRefundTargetCents({ totalSlots: campaign.totalSlots, claimedSlots: campaign.claimedSlots, bountyCents: usdToCents(campaign.bountyPerTaskUsd), platformFeeCents: deposit.platformFeeCents ?? usdToCents(campaign.platformFeeUsd), submissionsEver }));
    const cardRefunds = await tx.billingOperation.findMany({ where: { campaignId, kind: "PREPAID_REFUND", state: "SETTLED" } });
    const balanceRefunds = await tx.billingOperation.findMany({ where: { campaignId, kind: "PREPAID_BALANCE_REFUND", state: "SETTLED" } });
    const balanceReturned = balanceRefunds.reduce((sum, row) => sum + row.amountCents, 0);
    const cardReturned = Math.max(cardRefunds.reduce((sum, row) => sum + row.amountCents, 0), campaign.refundedCents - balanceReturned);
    const cardAvailable = Math.max(0, deposit.amountCents - cardReturned - (reversal?.appliedCents ?? 0));
    const replacements = await tx.walletTransaction.findMany({ where: { campaignId, type: "ESCROW_DEPOSIT", status: "COMPLETED", stripePaymentId: null } });
    const replacementCents = replacements.reduce((sum, row) => sum + row.amountCents, 0);
    const restored = await tx.walletTransaction.findMany({ where: { campaignId, type: "FUNDING_RESTORATION", status: "COMPLETED" } });
    const replacementRestored = restored.reduce((sum, row) => {
      const snapshot = row.invoiceSnapshot;
      return sum + (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && typeof snapshot.returnedReplacementCents === "number" ? snapshot.returnedReplacementCents : 0);
    }, 0);
    const replacementAvailable = Math.max(0, replacementCents - balanceReturned - replacementRestored);
    const card = cardAvailable > 0;
    const delta = Math.min(target - campaign.refundedCents, card ? cardAvailable : replacementAvailable);
    if (delta <= 0) return null;
    await tx.appCampaign.update({ where: { id: campaignId }, data: { refundedCents: { increment: 0 } } });
    const attempt = await tx.billingOperation.count({ where: { resourceId: campaignId, kind: { in: ["PREPAID_REFUND", "PREPAID_BALANCE_REFUND"] } } });
    return reserveBillingOperation(tx, { id: `seedenv-prepaid-refund-${campaignId}-${attempt}`, kind: card ? "PREPAID_REFUND" : "PREPAID_BALANCE_REFUND", resourceId: campaignId, campaignId, userId: campaign.developerId, paymentId: card ? deposit.stripePaymentId : null, amountCents: delta, feeCents: submissionsEver === 0 ? Math.min(delta, deposit.platformFeeCents ?? 0) : 0 });
  });
  if (!operation) return 0;
  let refund;
  try { refund = operation.paymentId ? await operationRefund(operation) : null; }
  catch (error) { await cancelFailedRefund(operation.id); throw error; }
  return serializable(async (tx) => {
    const current = await tx.billingOperation.findUniqueOrThrow({ where: { id: operation.id } });
    if (current.state === "SETTLED") return 0;
    const campaign = await tx.appCampaign.update({ where: { id: campaignId }, data: { refundedCents: { increment: operation.amountCents } } });
    if (!refund) {
      await tx.user.update({ where: { id: operation.userId }, data: { fundingBalanceCents: { increment: operation.amountCents } } });
      await releaseReplacementFunding(tx, campaignId, operation.amountCents);
    }
    await tx.walletTransaction.create({ data: { userId: campaign.developerId, amountCents: operation.amountCents, campaignId, platformFeeCents: -operation.feeCents, type: TransactionType.ESCROW_REFUND, status: TransactionStatus.COMPLETED, stripePaymentId: refund?.id, description: `Unused escrow refunded for ${campaign.title} (${campaignId})` } });
    await tx.billingOperation.update({ where: { id: operation.id }, data: { state: "SETTLED", remoteId: refund?.id, error: null } });
    return operation.amountCents;
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
    for (;;) {
      const refunded = await refundPrepaidCampaign(campaignId);
      refundedCents += refunded;
      if (!refunded) break;
    }
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
