import type { Prisma } from "@prisma/client";
import { REFERRAL_RULES } from "@/lib/config/referral";
import { usdToCents } from "@/lib/utils";

export async function assertReferralAcyclic(tx: Prisma.TransactionClient, refereeUserId: string, referrerId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(7243102401)`;
  let current: string | null = referrerId;
  const visited = new Set<string>();
  while (current) {
    if (current === refereeUserId || visited.has(current)) throw new Error("Circular or reciprocal referrals are prohibited.");
    visited.add(current);
    const user: { referredById: string | null } | null = await tx.user.findUnique({ where: { id: current }, select: { referredById: true } });
    if (!user) throw new Error("The referring account is unavailable.");
    current = user.referredById;
  }
}

// Top-ups are reusable balance, not tester escrow. Only actual funded places qualify.
export async function queueReferralCredit(tx: Prisma.TransactionClient, campaignId: string) {
  const campaign = await tx.appCampaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.cancelledAt || campaign.billingHoldCents > 0 || campaign.refundedCents > 0) return;
  const referral = await tx.developerReferral.findUnique({ where: { developerId: campaign.developerId } });
  if (!referral || referral.qualifiedAt) return;
  const developer = await tx.user.findUniqueOrThrow({ where: { id: campaign.developerId } });
  if (developer.referredById !== referral.inviterId) throw new Error("Developer referral graph requires reconciliation.");
  if (developer.fundingBalanceCents < 0) return;
  const deposits = await tx.walletTransaction.findMany({ where: { campaignId, type: "ESCROW_DEPOSIT", status: "COMPLETED" }, select: { amountCents: true, platformFeeCents: true } });
  const fundedTesterCents = Math.min(
    usdToCents(campaign.totalSlots * campaign.bountyPerTaskUsd),
    deposits.reduce((sum, row) => sum + Math.max(0, row.amountCents - (row.platformFeeCents ?? 0)), 0),
  );
  if (fundedTesterCents < REFERRAL_RULES.MIN_QUALIFYING_ESCROW_CENTS) return;
  await tx.feeCredit.upsert({
    where: { sourceReferralId: developer.id },
    create: { userId: referral.inviterId, sourceReferralId: developer.id, qualifyingDropId: campaignId },
    update: {},
  });
}

export async function vestCampaignReferralCredits(tx: Prisma.TransactionClient, campaignId: string, now = new Date()) {
  const campaign = await tx.appCampaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.cancelledAt || campaign.billingHoldCents > 0 || campaign.refundedCents > 0 || !["ACTIVE", "COMPLETED"].includes(campaign.status)) return;
  const developer = await tx.user.findUniqueOrThrow({ where: { id: campaign.developerId } });
  if (developer.fundingBalanceCents < 0) return;
  // Do not trust mutable claimedSlots or COMPLETED (which also means cancelled).
  const started = await tx.submission.count({ where: { campaignId, testerId: { not: campaign.developerId }, denialReviewPending: false, hardwareStatus: { not: "EMULATOR_FLAGGED" }, OR: [
    { status: "APPROVED" },
    { status: "PENDING", OR: [{ expiresAt: { gt: now } }, { submittedAt: { not: null } }] },
  ] } });
  if (started < Math.ceil(campaign.totalSlots / 2)) return;
  const changed = await tx.feeCredit.updateMany({
    where: { qualifyingDropId: campaignId, status: "PENDING" },
    data: { status: "VESTED", vestedAt: now, expiresAt: new Date(now.getTime() + REFERRAL_RULES.VOUCHER_EXPIRY_DAYS * 86400000) },
  });
  if (changed.count) await tx.developerReferral.updateMany({ where: { developerId: campaign.developerId, qualifiedAt: null }, data: { qualifiedAt: now, qualifiedCampaignId: campaignId } });
}

export async function revokeCampaignReferralCredits(tx: Prisma.TransactionClient, campaignId: string, reason: string) {
  const credits = await tx.feeCredit.findMany({ where: { qualifyingDropId: campaignId, status: { not: "EXPIRED" } } });
  for (const credit of credits) {
    const delta = Math.max(0, credit.redeemedDiscountCents - credit.clawbackCents);
    await tx.feeCredit.update({ where: { id: credit.id }, data: { status: "REVOKED", clawbackCents: { increment: delta } } });
    if (!delta) continue;
    const key = `referral-clawback:${credit.id}:${credit.redeemedDiscountCents}`;
    await tx.referralAudit.create({ data: { eventKey: key, userId: credit.userId, campaignId, creditId: credit.id, amountCents: delta, reason } });
    await tx.user.update({ where: { id: credit.userId }, data: { fundingBalanceCents: { decrement: delta } } });
    await tx.walletTransaction.create({ data: { userId: credit.userId, campaignId: credit.redeemedDropId, amountCents: delta, platformFeeCents: delta, type: "PLATFORM_FEE", status: "COMPLETED", description: `Referral credit clawback: ${reason} (${credit.id})` } });
  }
}
