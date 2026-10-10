import { prisma } from "@/lib/prisma";
import { billingTransaction } from "@/lib/billing-transaction";
import { vestCampaignReferralCredits, revokeCampaignReferralCredits } from "@/lib/services/referral.service";
import { getStripe } from "@/lib/stripe";
import { handleStripeWebhook } from "@/lib/campaign-payments";
import { releaseExpiredCampaignCheckout } from "@/lib/services/checkout-reconciliation";

export async function reconcileReferralCredits(now = new Date(), limit = 25) {
  const expired = await prisma.feeCredit.updateMany({ where: { status: "VESTED", reservedDropId: null, expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
  const pending = await prisma.feeCredit.findMany({ where: { status: "PENDING" }, distinct: ["qualifyingDropId"], select: { qualifyingDropId: true }, orderBy: [{ reviewedAt: "asc" }, { id: "asc" }], take: limit });
  for (const credit of pending) {
    await billingTransaction(async tx => {
      const campaign = await tx.appCampaign.findUnique({ where: { id: credit.qualifyingDropId } });
      if (!campaign || campaign.cancelledAt || campaign.refundedCents > 0 || campaign.billingHoldCents > 0) {
        await revokeCampaignReferralCredits(tx, credit.qualifyingDropId, "Qualifying cohort unavailable, cancelled, refunded or disputed");
      } else {
        await vestCampaignReferralCredits(tx, campaign.id, now);
        if (campaign.expiresAt <= now) await tx.feeCredit.updateMany({ where: { qualifyingDropId: campaign.id, status: "PENDING" }, data: { status: "REVOKED" } });
      }
      await tx.feeCredit.updateMany({ where: { qualifyingDropId: credit.qualifyingDropId, status: "PENDING" }, data: { reviewedAt: now } });
    });
  }
  let checkoutsReviewed = 0;
  if (process.env.STRIPE_SECRET_KEY) {
    const checkouts = await prisma.appCampaign.findMany({ where: { referralPolicyVersion: 1, status: "ESCROW_PENDING", fundingCheckoutSessionId: { not: null } }, orderBy: { updatedAt: "asc" }, take: limit });
    for (const campaign of checkouts) {
      const session = await getStripe().checkout.sessions.retrieve(campaign.fundingCheckoutSessionId!);
      if (session.status === "expired") await releaseExpiredCampaignCheckout(session);
      else if (session.status === "complete" && session.payment_status === "paid") await handleStripeWebhook({ type: "checkout.session.completed", data: { object: { id: session.id } } });
      else await prisma.appCampaign.update({ where: { id: campaign.id }, data: { updatedAt: now } });
      checkoutsReviewed++;
    }
  }
  return { expired: expired.count, reviewed: pending.length, checkoutsReviewed };
}
