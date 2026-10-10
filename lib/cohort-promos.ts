import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireMember } from "@/lib/member";
import { prisma } from "@/lib/prisma";
import { billingTransaction } from "@/lib/billing-transaction";
import { getStripe } from "@/lib/stripe";
import { quoteCampaignFunding } from "@/lib/pricing";
import { qualifyDeveloperReferral } from "@/lib/developer-referrals";
import { releaseUnfundedFeeBenefits } from "@/lib/services/billing.service";

export const promoCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,39}$/, "Use 3-40 letters, numbers, hyphens or underscores.");
export const promoStackSchema = z.string().trim().toUpperCase().max(81).transform((value) => value.split(",").map((code) => code.trim()).filter(Boolean)).pipe(z.array(promoCodeSchema).max(2).refine((codes) => new Set(codes).size === codes.length, "Each code can appear only once.")).transform((codes) => codes.join(","));
export const promoSettingsSchema = z.object({
  code: promoCodeSchema,
  discountPercent: z.number().int().min(1).max(100),
  maxRedemptions: z.number().int().min(1).max(100000),
  expiresAt: z.coerce.date().refine((date) => date > new Date(), "Expiry must be in the future."),
});

const ownerId = "cmtuw6sak0000fk5lkk0ceot9";
export class CohortPromoError extends Error {}
export function canManageCohortPromos(user: { id: string; role: string }) {
  return user.role === "ADMIN" || user.id === ownerId;
}

export async function requirePromoOperator() {
  const user = await requireMember();
  if (!canManageCohortPromos(user)) throw new Error("Only SeedEnv administrators and the verified owner can manage promo codes.");
  return user;
}

export async function eligibleCohortPromo(tx: Prisma.TransactionClient, developerId: string, rawCode: string) {
  const code = promoCodeSchema.parse(rawCode);
  const promo = await tx.cohortPromoCode.findUnique({ where: { code } });
  if (!promo || !promo.enabled || (promo.expiresAt && promo.expiresAt <= new Date()) || (promo.ownerId && promo.ownerId !== developerId)) throw new CohortPromoError("This promo code is invalid, expired, disabled, or belongs to another account.");
  const previous = await tx.cohortPromoRedemption.findUnique({ where: { promoCodeId_developerId: { promoCodeId: promo.id, developerId } } });
  if (previous?.consumedAt) throw new CohortPromoError("You have already used this code for a paid cohort. Each code can be used once per developer.");
  if (!previous && promo.reservedCount >= promo.maxRedemptions) throw new CohortPromoError("This promo code is fully reserved or redeemed.");
  return promo;
}

export async function reserveCohortPromo(tx: Prisma.TransactionClient, developerId: string, campaignId: string, rawCode: string) {
  const promo = await eligibleCohortPromo(tx, developerId, rawCode);
  const previous = await tx.cohortPromoRedemption.findUnique({ where: { promoCodeId_developerId: { promoCodeId: promo.id, developerId } } });
  if (previous) {
    if (previous.paymentPending) throw new CohortPromoError("The previous checkout is still pending. Close it before moving this code.");
    if (previous.campaignId !== campaignId) {
      const old = await tx.appCampaign.findUniqueOrThrow({ where: { id: previous.campaignId } });
      const normal = quoteCampaignFunding(old.totalSlots * old.bountyPerTaskUsd, old.cohortType);
      await tx.appCampaign.update({ where: { id: old.id }, data: {
        status: "DRAFT", platformFeeDiscountPercent: 0, promoCodeDraft: null,
        ...(old.referralPolicyVersion === 1 ? { firstCohortFeeWaived: false, referralDiscountPercent: 0, promoDiscountPercent: 0 } : {}),
        totalBudgetUsd: normal.totalBudgetUsd, platformFeeUsd: normal.platformFeeUsd,
      } });
      if (old.referralPolicyVersion === 1) await releaseUnfundedFeeBenefits(tx, old.id);
      const companions = await tx.cohortPromoRedemption.findMany({ where: { campaignId: old.id, id: { not: previous.id } } });
      for (const companion of companions) {
        if (companion.consumedAt || companion.paymentPending) throw new CohortPromoError("The previous cohort still has paid or pending discounts; reconcile it before moving credits.");
        await tx.cohortPromoRedemption.delete({ where: { id: companion.id } });
        await tx.cohortPromoCode.update({ where: { id: companion.promoCodeId }, data: { reservedCount: { decrement: 1 } } });
      }
      await tx.cohortPromoRedemption.update({ where: { id: previous.id }, data: { campaignId, checkoutSessionId: null } });
    }
    return promo;
  }
  const reserved = await tx.cohortPromoCode.updateMany({
    where: { id: promo.id, enabled: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], reservedCount: promo.reservedCount },
    data: { reservedCount: { increment: 1 } },
  });
  if (reserved.count !== 1) throw new CohortPromoError("This code changed while you were launching. Apply it again before continuing.");
  await tx.cohortPromoRedemption.create({ data: { promoCodeId: promo.id, developerId, campaignId, discountPercent: promo.discountPercent } });
  return promo;
}

// Payment and transfer both use serializable billing transactions: only one can win.
export async function consumeCohortPromo(tx: Prisma.TransactionClient, campaignId: string) {
  await tx.cohortPromoRedemption.updateMany({
    where: { campaignId, consumedAt: null },
    data: { consumedAt: new Date(), paymentPending: false },
  });
  const campaign = await tx.appCampaign.findUniqueOrThrow({ where: { id: campaignId }, select: { developerId: true } });
  await qualifyDeveloperReferral(tx, campaign.developerId, campaignId);
}

export async function recordCohortPromoCheckout(campaignId: string, sessionId: string) {
  await prisma.cohortPromoRedemption.updateMany({
    where: { campaignId, consumedAt: null, paymentPending: true },
    data: { checkoutSessionId: sessionId },
  });
}

export async function failedCohortPromoCheckout(campaignId: string) {
  await prisma.cohortPromoRedemption.updateMany({
    where: { campaignId, consumedAt: null },
    data: { paymentPending: false },
  });
}

export async function prepareCohortPromoRetry(developerId: string, rawCode: string) {
  const redemption = await prisma.cohortPromoRedemption.findFirst({
    where: { developerId, promoCode: { code: promoCodeSchema.parse(rawCode) } },
  });
  if (!redemption || redemption.consumedAt || !redemption.paymentPending) return;
  if (!redemption.checkoutSessionId) throw new CohortPromoError("Your previous checkout is still being prepared. Try again shortly; if it persists, contact support before starting another payment.");
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(redemption.checkoutSessionId);
  if (session.status === "complete") throw new CohortPromoError("Your previous checkout completed. Wait for payment confirmation before continuing; this code cannot fund two cohorts.");
  if (session.status !== "expired") {
    const closed = await stripe.checkout.sessions.expire(session.id);
    if (closed.status !== "expired") throw new CohortPromoError("The previous checkout could not be closed. Try again before moving this code.");
  }
  await billingTransaction(async (tx) => {
    const current = await tx.cohortPromoRedemption.findUniqueOrThrow({ where: { id: redemption.id } });
    if (current.consumedAt) throw new CohortPromoError("This code has already been used for a successful payment.");
    if (current.checkoutSessionId !== session.id) throw new CohortPromoError("The previous checkout changed. Try again.");
    await tx.cohortPromoRedemption.updateMany({ where: { campaignId: current.campaignId, consumedAt: null }, data: { paymentPending: false, checkoutSessionId: null } });
    await tx.balanceTopUp.updateMany({
      where: { campaignId: current.campaignId, status: "PENDING", stripeCheckoutSessionId: session.id },
      data: { status: "FAILED", failureReason: "Checkout closed to retry or move the promo code." },
    });
    await tx.walletTransaction.updateMany({
      where: { campaignId: current.campaignId, status: "PENDING", type: "ESCROW_DEPOSIT" },
      data: { status: "FAILED" },
    });
    await tx.appCampaign.updateMany({ where: { id: current.campaignId, status: { in: ["ESCROW_PENDING", "PAUSED"] } }, data: { status: "DRAFT" } });
    await releaseUnfundedFeeBenefits(tx, current.campaignId);
  });
}
