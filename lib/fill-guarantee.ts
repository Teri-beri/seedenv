import { CampaignStatus, CohortFundingModel, TransactionStatus, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
import { usdToCents } from "@/lib/utils";

// The published promise: if a prepaid cohort's requested slots have not filled within four
// hours of going live, the platform fee returns to the developer's prepaid balance in full.
export const fillGuaranteeWindowMs = 4 * 60 * 60 * 1000;

export type FillGuaranteeCampaign = {
  fundingModel: CohortFundingModel;
  status: CampaignStatus;
  launchedAt: Date | null;
  cancelledAt: Date | null;
  totalSlots: number;
  claimedSlots: number;
  fillGuaranteeCreditedCents: number;
};

export function fillGuaranteeDeadline(launchedAt: Date) {
  return new Date(launchedAt.getTime() + fillGuaranteeWindowMs);
}

/**
 * Whether the guarantee has vested. Pure so the window rules stay testable without a database.
 * Pay-per-tester cohorts are excluded because their fee is only charged per accepted tester, so
 * an unfilled slot was never billed in the first place and there is nothing to return.
 */
export function fillGuaranteeVested(campaign: FillGuaranteeCampaign, now: Date) {
  if (campaign.fundingModel !== CohortFundingModel.PREPAID) return false;
  if (!campaign.launchedAt) return false;
  if (campaign.fillGuaranteeCreditedCents > 0) return false;
  const deadline = fillGuaranteeDeadline(campaign.launchedAt);
  if (now < deadline) return false;
  // Ending the cohort yourself before the window closes forfeits the guarantee; the normal
  // cancellation refund returns the unused places instead, and paying both would double-refund.
  if (campaign.cancelledAt && campaign.cancelledAt < deadline) return false;
  if (campaign.status === CampaignStatus.DRAFT || campaign.status === CampaignStatus.ESCROW_PENDING) return false;
  return campaign.claimedSlots < campaign.totalSlots;
}

/**
 * Credits the platform fee a prepaid cohort actually paid. Returns 0 when the guarantee has not
 * vested, the fee was waived, or the credit already ran. Safe to call repeatedly.
 */
export async function settleFillGuarantee(campaignId: string, now = new Date()) {
  return serializable(async (tx) => {
    const campaign = await tx.appCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || !fillGuaranteeVested(campaign, now)) return 0;

    const deposits = await tx.walletTransaction.findMany({
      where: { campaignId, type: TransactionType.ESCROW_DEPOSIT, status: TransactionStatus.COMPLETED },
    });
    // A recorded zero fee means the fee was waived, which is different from having no record at all.
    const recorded = deposits.filter((deposit) => deposit.platformFeeCents !== null);
    const feePaidCents = recorded.length
      ? recorded.reduce((sum, deposit) => sum + (deposit.platformFeeCents ?? 0), 0)
      : usdToCents(campaign.platformFeeUsd);
    const creditCents = Math.max(0, feePaidCents - campaign.fillGuaranteeCreditedCents);
    if (creditCents <= 0) return 0;

    const operationId = `seedenv-fill-guarantee-${campaignId}`;
    if (await tx.billingOperation.findUnique({ where: { id: operationId } })) return 0;

    await tx.billingOperation.create({
      data: {
        id: operationId,
        kind: "FILL_GUARANTEE_CREDIT",
        resourceId: campaignId,
        campaignId,
        userId: campaign.developerId,
        amountCents: creditCents,
        feeCents: creditCents,
        state: "SETTLED",
        firstAttemptAt: now,
      },
    });
    await tx.appCampaign.update({
      where: { id: campaignId },
      // refundedCents also rises so the end-of-cohort reconciliation cannot return this fee twice.
      data: { fillGuaranteeCreditedCents: creditCents, refundedCents: { increment: creditCents } },
    });
    await tx.user.update({ where: { id: campaign.developerId }, data: { fundingBalanceCents: { increment: creditCents } } });
    await tx.walletTransaction.create({
      data: {
        userId: campaign.developerId,
        campaignId,
        amountCents: creditCents,
        platformFeeCents: -creditCents,
        type: TransactionType.ESCROW_REFUND,
        status: TransactionStatus.COMPLETED,
        description: `4-hour fill guarantee: platform fee credited to balance for ${campaign.title} (${campaignId})`,
      },
    });
    return creditCents;
  });
}

/** Credits every prepaid cohort whose fill window closed unfilled. Driven by the slot-expiry cron. */
export async function sweepFillGuarantees(now = new Date(), limit = 25) {
  const candidates = await prisma.appCampaign.findMany({
    where: {
      fundingModel: CohortFundingModel.PREPAID,
      status: { in: [CampaignStatus.ACTIVE, CampaignStatus.PAUSED, CampaignStatus.COMPLETED] },
      fillGuaranteeCreditedCents: 0,
      launchedAt: { not: null, lte: new Date(now.getTime() - fillGuaranteeWindowMs) },
    },
    orderBy: { launchedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let creditedCents = 0;
  let cohorts = 0;
  for (const candidate of candidates) {
    try {
      const credited = await settleFillGuarantee(candidate.id, now);
      creditedCents += credited;
      if (credited > 0) cohorts += 1;
    } catch (error) {
      console.warn("SeedEnv fill guarantee credit failed:", error instanceof Error ? error.message : error);
    }
  }
  return { creditedCents, cohorts };
}
