import type { Prisma } from "@prisma/client";
import { REFERRAL_RULES, referralStackDiscountPercent } from "@/lib/config/referral";
import { standardPlatformFeeCents } from "@/lib/pricing";
import { queueReferralCredit, revokeCampaignReferralCredits, vestCampaignReferralCredits } from "@/lib/services/referral.service";

export async function automaticFeeBenefits(tx: Prisma.TransactionClient, userId: string, now = new Date(), draftId?: string) {
  const [prior, paidTopUp, first, credits] = await Promise.all([
    tx.walletTransaction.findFirst({ where: { userId, type: "ESCROW_DEPOSIT", status: "COMPLETED" }, select: { id: true } }),
    tx.balanceTopUp.findFirst({ where: { userId, campaignId: { not: null }, status: { in: ["SUCCEEDED", "REFUNDED"] } }, select: { id: true } }),
    tx.firstCohortBenefit.findUnique({ where: { userId } }),
    tx.feeCredit.findMany({ where: { userId, status: "VESTED", OR: [{ reservedDropId: null, expiresAt: { gt: now } }, ...(draftId ? [{ reservedDropId: draftId }] : [])] }, orderBy: [{ expiresAt: "asc" }, { id: "asc" }], take: 2 }),
  ]);
  return { firstCohort: !prior && !paidTopUp && (!first || first.campaignId === draftId && !first.fundedAt), referralDiscountPercent: referralStackDiscountPercent(credits.length), availableCreditIds: credits.map(credit => credit.id) };
}

export async function reserveAutomaticFeeBenefits(tx: Prisma.TransactionClient, userId: string, campaignId: string, accountWaived: boolean, promoDiscountPercent: number, now = new Date()) {
  // Every launch by the account, including simultaneous tabs, shares this lock.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fee-benefits:${userId}`}))`;
  const benefits = await automaticFeeBenefits(tx, userId, now);
  const existing = await tx.firstCohortBenefit.findUnique({ where: { userId } });
  const sameFirst = existing?.campaignId === campaignId && !existing.fundedAt;
  const firstCohortFeeWaived = !accountWaived && (benefits.firstCohort || sameFirst);
  if (firstCohortFeeWaived && !sameFirst) await tx.firstCohortBenefit.create({ data: { userId, campaignId } });
  // Keep all vouchers on the account when an automatic or permanent waiver applies.
  if (accountWaived || firstCohortFeeWaived || promoDiscountPercent >= 75) {
    return { firstCohortFeeWaived, referralDiscountPercent: 0, effectiveDiscountPercent: firstCohortFeeWaived ? 100 : promoDiscountPercent };
  }
  const already = await tx.feeCredit.findMany({ where: { userId, reservedDropId: campaignId, status: "VESTED" }, orderBy: { id: "asc" } });
  const candidates = already.length ? already.map(credit => credit.id) : benefits.availableCreditIds;
  let count = 0;
  for (const id of candidates) {
    const previous = Math.min(75, 100 - (100 - promoDiscountPercent) * (1 - referralStackDiscountPercent(count) / 100));
    if (previous >= 75) break;
    const changed = await tx.feeCredit.updateMany({ where: { id, userId, status: "VESTED", OR: [{ reservedDropId: campaignId }, { reservedDropId: null, expiresAt: { gt: now } }] }, data: { reservedDropId: campaignId } });
    if (changed.count !== 1) throw new Error("Your referral credits changed. Refresh Budget before launching.");
    count++;
  }
  const referralDiscountPercent = referralStackDiscountPercent(count);
  const effectiveDiscountPercent = count ? Math.round(Math.min(75, 100 - (100 - promoDiscountPercent) * (1 - referralDiscountPercent / 100))) : promoDiscountPercent;
  return { firstCohortFeeWaived: false, referralDiscountPercent, effectiveDiscountPercent };
}

export async function recordCampaignFeeBenefits(tx: Prisma.TransactionClient, campaignId: string) {
  const campaign = await tx.appCampaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.referralPolicyVersion !== REFERRAL_RULES.POLICY_VERSION) return;
  const deposits = await tx.walletTransaction.findMany({ where: { campaignId, type: "ESCROW_DEPOSIT", status: "COMPLETED" }, select: { amountCents: true, platformFeeCents: true } });
  if (!deposits.length) return;
  await tx.firstCohortBenefit.updateMany({ where: { campaignId, fundedAt: null }, data: { fundedAt: new Date() } });
  const credits = await tx.feeCredit.findMany({ where: { OR: [{ reservedDropId: campaignId }, { redeemedDropId: campaignId }] }, orderBy: { id: "asc" } });
  if (!credits.length) return;
  const pool = deposits.reduce((sum, deposit) => sum + Math.max(0, deposit.amountCents - (deposit.platformFeeCents ?? 0)), 0);
  const base = standardPlatformFeeCents(pool);
  // Credit savings are actual servicing fees avoided on funded escrow, not face values.
  const promoBaselineFee = Math.round(base * (100 - campaign.promoDiscountPercent) / 100);
  const totalSavings = Math.max(0, promoBaselineFee - deposits.reduce((sum, deposit) => sum + (deposit.platformFeeCents ?? 0), 0));
  let allocated = 0;
  const initialRate = 100 - campaign.promoDiscountPercent;
  const firstMarginalRate = Math.min(initialRate * 0.5, Math.max(0, initialRate - 25));
  const totalMarginalRate = Math.max(0, initialRate - (100 - campaign.platformFeeDiscountPercent));
  for (let index = 0; index < credits.length; index++) {
    const credit = credits[index];
    const weight = totalMarginalRate > 0 ? firstMarginalRate / totalMarginalRate : 0;
    const savings = Math.max(credit.redeemedDiscountCents, index === credits.length - 1 ? totalSavings - allocated : Math.round(totalSavings * weight));
    allocated += savings;
    await tx.feeCredit.update({ where: { id: credit.id }, data: {
      status: credit.status === "REVOKED" ? "REVOKED" : "REDEEMED", reservedDropId: null, redeemedDropId: campaignId,
      redeemedAt: credit.redeemedAt ?? new Date(), redeemedDiscountCents: savings,
    } });
    if (credit.status === "REVOKED") await revokeCampaignReferralCredits(tx, credit.qualifyingDropId, "Source cohort funding was revoked");
  }
}

export async function reconcileReferralMilestone(tx: Prisma.TransactionClient, campaignId: string) {
  await queueReferralCredit(tx, campaignId);
  await vestCampaignReferralCredits(tx, campaignId);
}

export async function releaseUnfundedFeeBenefits(tx: Prisma.TransactionClient, campaignId: string) {
  if (await tx.walletTransaction.findFirst({ where: { campaignId, type: "ESCROW_DEPOSIT", status: "COMPLETED" } })) return;
  if (await tx.balanceTopUp.findFirst({ where: { campaignId, status: { in: ["SUCCEEDED", "REFUNDED"] } } })) {
    await tx.firstCohortBenefit.updateMany({ where: { campaignId, fundedAt: null }, data: { fundedAt: new Date() } });
    return;
  }
  await tx.firstCohortBenefit.deleteMany({ where: { campaignId, fundedAt: null } });
  await tx.feeCredit.updateMany({ where: { reservedDropId: campaignId, status: "VESTED" }, data: { reservedDropId: null } });
}
