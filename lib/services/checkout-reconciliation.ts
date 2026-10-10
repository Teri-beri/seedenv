import type Stripe from "stripe";
import { billingTransaction } from "@/lib/billing-transaction";
import { releaseUnfundedFeeBenefits } from "@/lib/services/billing.service";

export async function releaseExpiredCampaignCheckout(session: Stripe.Checkout.Session) {
  if (session.status !== "expired" || session.payment_status === "paid") throw new Error("Only a confirmed expired, unpaid checkout can release fee benefits.");
  const metadata = session.metadata || {};
  if (metadata.type !== "SEEDENV_CAMPAIGN_ESCROW" || !metadata.campaignId || !metadata.developerId) return { ignored: true };
  return billingTransaction(async tx => {
    const campaign = await tx.appCampaign.findUniqueOrThrow({ where: { id: metadata.campaignId } });
    if (campaign.referralPolicyVersion !== 1) return { ignored: true };
    if (campaign.developerId !== metadata.developerId || !metadata.checkoutAttemptId || campaign.fundingCheckoutAttemptId !== metadata.checkoutAttemptId || campaign.fundingCheckoutSessionId && campaign.fundingCheckoutSessionId !== session.id) {
      throw new Error("Expired checkout does not match the cohort's current funding attempt.");
    }
    const deposit = await tx.walletTransaction.findUniqueOrThrow({ where: { id: metadata.checkoutAttemptId } });
    if (deposit.campaignId !== campaign.id || deposit.userId !== campaign.developerId || deposit.type !== "ESCROW_DEPOSIT" || deposit.status === "COMPLETED") throw new Error("Expired checkout ledger requires reconciliation.");
    await tx.walletTransaction.updateMany({ where: { id: deposit.id, status: "PENDING" }, data: { status: "FAILED" } });
    await tx.cohortPromoRedemption.updateMany({ where: { campaignId: campaign.id, consumedAt: null }, data: { paymentPending: false, checkoutSessionId: null } });
    await tx.appCampaign.updateMany({ where: { id: campaign.id, status: "ESCROW_PENDING" }, data: { status: "DRAFT", fundingCheckoutSessionId: null } });
    await releaseUnfundedFeeBenefits(tx, campaign.id);
    return { expired: true, campaignId: campaign.id };
  });
}
