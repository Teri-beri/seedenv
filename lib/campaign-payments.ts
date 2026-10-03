import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
import { getStripe } from "@/lib/stripe";
import { usdToCents } from "@/lib/utils";

export type CampaignPaymentEvent = { type: string; data: { object: { id?: string } } };

export async function handleStripeWebhook(event: CampaignPaymentEvent) {
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) return { ignored: true };
  if (!event.data.object.id) throw new Error("Checkout event has no session ID.");
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(event.data.object.id);
  const metadata = session.metadata || {};
  if (metadata.type === "SEEDENV_PAYMENT_METHOD_SETUP") {
    if (session.mode !== "setup" || session.status !== "complete") throw new Error("Payment method setup is not complete.");
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    const setupIntentId = typeof session.setup_intent === "string" ? session.setup_intent : session.setup_intent?.id;
    if (!customerId || !setupIntentId || !metadata.seedenvUserId) throw new Error("Payment method setup identifiers are missing.");
    const user = await prisma.user.findFirst({ where: { id: metadata.seedenvUserId, stripeCustomerId: customerId }, select: { id: true } });
    if (!user) throw new Error("Payment method setup does not match a member.");
    const intent = await stripe.setupIntents.retrieve(setupIntentId);
    const paymentMethod = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
    const intentCustomer = typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
    if (intent.status !== "succeeded" || intentCustomer !== customerId || !paymentMethod) throw new Error("Payment method setup has not succeeded for this customer.");
    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethod } });
    return { paymentMethodSaved: true, userId: user.id };
  }
  if (metadata.type !== "SEEDENV_CAMPAIGN_ESCROW") return { ignored: true };
  if (session.mode !== "payment" || session.status !== "complete" || session.payment_status !== "paid") return { awaitingPayment: true };
  const paymentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!metadata.campaignId || !metadata.developerId || !paymentId) throw new Error("Campaign funding identifiers are missing.");
  return serializable(async (tx) => {
    const campaign = await tx.appCampaign.findUnique({ where: { id: metadata.campaignId } });
    if (!campaign || campaign.developerId !== metadata.developerId) throw new Error("Campaign funding ownership does not match.");
    const amount = usdToCents(campaign.totalBudgetUsd);
    if (session.currency !== "usd" || session.amount_total !== amount) throw new Error("Campaign funding amount or currency does not match.");
    const description = `Escrow deposit for ${campaign.title} (${campaign.id})`;
    const deposits = await tx.walletTransaction.findMany({ where: { userId: campaign.developerId, type: "ESCROW_DEPOSIT", description } });
    if (deposits.some((deposit) => deposit.status === "COMPLETED" && deposit.stripePaymentId === paymentId && deposit.amountCents === amount)) return { duplicate: true, campaignId: campaign.id };
    if (campaign.status !== "ESCROW_PENDING") throw new Error("This campaign is not awaiting funding. Reconcile the payment before changing its state.");
    if (deposits.length !== 1 || deposits[0].status !== "PENDING" || deposits[0].amountCents !== amount) throw new Error("The campaign funding ledger needs reconciliation.");
    await tx.walletTransaction.update({ where: { id: deposits[0].id }, data: { status: "COMPLETED", stripePaymentId: paymentId } });
    await tx.appCampaign.update({ where: { id: campaign.id }, data: { status: "ACTIVE" } });
    return { activated: true, campaignId: campaign.id };
  });
}
