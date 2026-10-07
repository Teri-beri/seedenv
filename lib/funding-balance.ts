import { CampaignStatus, Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import { billingDetailsSchema } from "@/lib/enterprise-rules";
import { quoteTopUp, topUpForShortfall, type TopUpQuote } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
import { getStripe } from "@/lib/stripe";
import { ensureStripeCustomer } from "@/lib/stripe-customer";

export const STALE_TOP_UP_MS = 15 * 60 * 1000;
const CHECKOUT_EXPIRY_SECONDS = 60 * 60;
const CHECKOUT_LIFETIME_MS = 2 * CHECKOUT_EXPIRY_SECONDS * 1000;

export function stripeErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
}

export function declineMessage(code: string) {
  if (code === "authentication_required") return "Your bank asked for card authentication, which can't happen automatically. Add funds manually from Billing.";
  if (code === "card_declined" || code === "insufficient_funds" || code === "expired_card") return "Your saved card was declined. Update it in Billing or add funds manually.";
  return "We couldn't charge your saved card. Check it in Billing or add funds manually.";
}

export async function savedPaymentMethod(stripeCustomerId: string | null) {
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

export async function billingCompanySnapshot(tx: Prisma.TransactionClient, userId: string) {
  const profile = await tx.billingProfile.findUnique({ where: { userId } });
  if (!profile) return null;
  const company = billingDetailsSchema.safeParse({ ...profile, taxId: profile.taxId || "", billingEmail: profile.billingEmail || "", addressLine2: profile.addressLine2 || "", region: profile.region || "" });
  return company.success ? company.data : null;
}

// A custom cohort launched together with a top-up goes live once that top-up is paid.
async function activateFundedCohort(tx: Prisma.TransactionClient, userId: string, campaignId: string) {
  const campaign = await tx.appCampaign.findFirst({ where: { id: campaignId, developerId: userId, status: CampaignStatus.ESCROW_PENDING, fundingModel: "PAY_PER_TESTER", cancelledAt: null }, select: { id: true } });
  if (!campaign) return false;
  await tx.appCampaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.ACTIVE, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
  return true;
}

// Credits a paid top-up exactly once and writes its receipt.
export async function creditTopUp(tx: Prisma.TransactionClient, topUpId: string, paymentIntentId: string) {
  const topUp = await tx.balanceTopUp.findUnique({ where: { id: topUpId } });
  if (!topUp) throw new Error("Balance top-up record is missing.");
  if (topUp.status === "SUCCEEDED" || topUp.status === "REFUNDED") return { credited: false, activated: false, topUp };
  const transaction = await tx.walletTransaction.create({
    data: {
      userId: topUp.userId,
      amountCents: topUp.totalCents,
      platformFeeCents: 0,
      invoiceSnapshot: {
        version: 1,
        kind: "TOP_UP",
        cohortId: "balance",
        cohortTitle: "Prepaid balance top-up",
        rewardPoolCents: topUp.creditCents,
        platformFeeCents: 0,
        processingFeeCents: topUp.processingFeeCents,
        company: await billingCompanySnapshot(tx, topUp.userId),
      },
      type: TransactionType.BALANCE_TOPUP,
      status: TransactionStatus.COMPLETED,
      stripePaymentId: paymentIntentId,
      description: `Prepaid balance top-up (${topUp.id})`,
    },
    select: { id: true },
  });
  await tx.balanceTopUp.update({ where: { id: topUp.id }, data: { status: "SUCCEEDED", stripePaymentIntentId: paymentIntentId, transactionId: transaction.id, failureReason: null } });
  await tx.user.update({ where: { id: topUp.userId }, data: { fundingBalanceCents: { increment: topUp.creditCents } } });
  const activated = topUp.campaignId ? await activateFundedCohort(tx, topUp.userId, topUp.campaignId) : false;
  return { credited: true, activated, topUp };
}

type TopUpMember = { id: string; email: string; name: string | null; username: string; stripeCustomerId: string | null };

export async function createTopUpCheckout(user: TopUpMember, creditCents: number, options: { campaignId?: string; successPath: string; cancelPath: string }) {
  const quote = quoteTopUp(creditCents);
  const customerId = await ensureStripeCustomer(user);
  const topUp = await prisma.balanceTopUp.create({ data: { userId: user.id, creditCents: quote.creditCents, processingFeeCents: quote.processingFeeCents, totalCents: quote.totalCents, source: "CHECKOUT", campaignId: options.campaignId || null } });
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://seedenv.com";
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_EXPIRY_SECONDS,
      payment_method_types: ["card"],
      line_items: [
        { quantity: 1, price_data: { currency: "usd", unit_amount: quote.creditCents, product_data: { name: "SeedEnv prepaid balance", description: "Used for tester rewards and platform fees as you accept testers. Unused balance is refundable." } } },
        { quantity: 1, price_data: { currency: "usd", unit_amount: quote.processingFeeCents, product_data: { name: "Card processing", description: "Stripe 2.9% + 30¢, charged once per top-up. Non-refundable." } } },
      ],
      payment_intent_data: { setup_future_usage: "off_session", description: "SeedEnv prepaid balance top-up", metadata: { type: "SEEDENV_BALANCE_TOPUP", topUpId: topUp.id } },
      success_url: `${base}${options.successPath}`,
      cancel_url: `${base}${options.cancelPath}`,
      metadata: { type: "SEEDENV_BALANCE_TOPUP", topUpId: topUp.id, seedenvUserId: user.id },
    }, { idempotencyKey: `seedenv-topup-${topUp.id}` });
    if (!session.url) throw new Error("Stripe did not return a checkout link.");
    await prisma.balanceTopUp.update({ where: { id: topUp.id }, data: { stripeCheckoutSessionId: session.id } });
    return { url: session.url, topUpId: topUp.id, quote };
  } catch (error) {
    await prisma.balanceTopUp.updateMany({ where: { id: topUp.id, status: "PENDING" }, data: { status: "FAILED", failureReason: (error instanceof Error ? error.message : "Checkout failed").slice(0, 500) } });
    throw error;
  }
}

// Stripe Checkout webhook for top-ups. Verifies amount and owner before crediting.
export async function handleTopUpCheckout(session: { id: string; mode: string | null; status: string | null; payment_status: string; currency: string | null; amount_total: number | null; metadata: Record<string, string> | null; payment_intent: string | { id: string } | null; customer: string | { id: string } | null }) {
  const metadata = session.metadata || {};
  if (session.mode !== "payment" || session.status !== "complete" || session.payment_status !== "paid") return { awaitingPayment: true };
  const topUp = metadata.topUpId ? await prisma.balanceTopUp.findUnique({ where: { id: metadata.topUpId } }) : null;
  if (!topUp || topUp.userId !== metadata.seedenvUserId) throw new Error("Balance top-up does not match a member.");
  if (session.currency !== "usd" || session.amount_total !== topUp.totalCents) throw new Error("Balance top-up amount or currency does not match.");
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) throw new Error("Balance top-up has no payment reference.");
  const result = await serializable((tx) => creditTopUp(tx, topUp.id, paymentIntentId));
  await rememberCardForAutoReload(typeof session.customer === "string" ? session.customer : session.customer?.id, paymentIntentId);
  return { balanceCredited: result.credited, cohortActivated: result.activated, topUpId: topUp.id };
}

async function rememberCardForAutoReload(customerId: string | undefined, paymentIntentId: string) {
  if (!customerId) return;
  try {
    const stripe = getStripe();
    if (await savedPaymentMethod(customerId)) return;
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const method = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
    if (method) await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: method } });
  } catch (error) {
    console.warn("SeedEnv could not save the top-up card for auto-reload:", error instanceof Error ? error.message : error);
  }
}

const RELOAD_IN_PROGRESS = "An auto-reload for this tester is already in progress. Try again in a moment.";
const RELOAD_COOLDOWN_MS = 60_000;

// Off-session top-up used when an acceptance would overdraw the balance and auto-reload is on.
// Reloads are keyed per application so concurrent accepts of the same tester cannot each charge the card.
export async function autoReloadBalance(userId: string, shortfallCents: number, applicationId: string): Promise<TopUpQuote | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true, autoReloadCents: true } });
  if (!user || user.autoReloadCents <= 0) throw new Error("Auto-reload is off. Add funds in Billing.");
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Payments are not configured yet. Please try again later.");
  const quote = quoteTopUp(Math.max(user.autoReloadCents, topUpForShortfall(shortfallCents)));
  const paymentMethod = await savedPaymentMethod(user.stripeCustomerId);
  if (!user.stripeCustomerId || !paymentMethod) throw new Error("Auto-reload needs a saved card. Add funds once from Billing to save one.");
  const prefix = `reload_${applicationId}_`;
  const prior = await prisma.balanceTopUp.findMany({ where: { id: { startsWith: prefix } }, select: { status: true, updatedAt: true } });
  if (prior.some((row) => row.status === "PENDING")) throw new Error(RELOAD_IN_PROGRESS);
  if (prior.some((row) => row.status === "SUCCEEDED" && Date.now() - row.updatedAt.getTime() < RELOAD_COOLDOWN_MS)) return null;
  let topUp: { id: string };
  try {
    topUp = await prisma.balanceTopUp.create({ data: { id: `${prefix}${prior.length}`, userId, creditCents: quote.creditCents, processingFeeCents: quote.processingFeeCents, totalCents: quote.totalCents, source: "AUTO_RELOAD" }, select: { id: true } });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") throw new Error(RELOAD_IN_PROGRESS);
    throw error;
  }
  const fail = (reason: string) => prisma.balanceTopUp.updateMany({ where: { id: topUp.id, status: "PENDING" }, data: { status: "FAILED", failureReason: reason.slice(0, 500) } });
  let paymentIntentId: string;
  try {
    const intent = await getStripe().paymentIntents.create({
      amount: quote.totalCents,
      currency: "usd",
      customer: user.stripeCustomerId,
      payment_method: paymentMethod,
      off_session: true,
      confirm: true,
      description: "SeedEnv prepaid balance auto-reload",
      metadata: { type: "SEEDENV_BALANCE_TOPUP", topUpId: topUp.id },
    }, { idempotencyKey: `seedenv-topup-${topUp.id}` });
    if (intent.status !== "succeeded") {
      try { await getStripe().paymentIntents.cancel(intent.id); } catch { /* already final */ }
      await fail(`Payment status ${intent.status}`);
      throw Object.assign(new Error("declined"), { code: intent.status === "requires_action" ? "authentication_required" : "" });
    }
    paymentIntentId = intent.id;
  } catch (error) {
    const definite = error instanceof Error && (error.message === "declined" || ("type" in error && error.type === "StripeCardError"));
    // A network or API error may hide a successful charge; leave it pending so the sweep credits or fails it from Stripe.
    if (!definite) throw new Error("We couldn't confirm the auto-reload with Stripe yet. If your card was charged, the funds are added to your balance automatically within about 15 minutes.");
    await fail(stripeErrorCode(error) || error.message);
    throw new Error(declineMessage(stripeErrorCode(error)));
  }
  await serializable((tx) => creditTopUp(tx, topUp.id, paymentIntentId));
  return quote;
}

// Refunds the whole available balance to the cards that funded it, newest top-up first.
// Card processing on each top-up is not returned. Anything Stripe refuses stays in the balance.
export async function withdrawBalance(userId: string) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Payments are not configured yet. Please try again later.");
  const reserved = await serializable(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { fundingBalanceCents: true } });
    const amount = user?.fundingBalanceCents || 0;
    if (amount <= 0) throw new Error("Your balance is empty.");
    await tx.user.update({ where: { id: userId }, data: { fundingBalanceCents: { decrement: amount } } });
    const transaction = await tx.walletTransaction.create({ data: { userId, amountCents: amount, platformFeeCents: 0, type: TransactionType.BALANCE_WITHDRAWAL, status: TransactionStatus.PENDING, description: "Prepaid balance refunded to card" }, select: { id: true } });
    return { amount, transactionId: transaction.id };
  });
  const topUps = await prisma.balanceTopUp.findMany({ where: { userId, status: "SUCCEEDED", stripePaymentIntentId: { not: null } }, orderBy: { createdAt: "desc" } });
  let remaining = reserved.amount;
  for (const topUp of topUps) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, topUp.creditCents - topUp.refundedCents);
    if (amount <= 0) continue;
    try {
      await getStripe().refunds.create({ payment_intent: topUp.stripePaymentIntentId!, amount, metadata: { type: "SEEDENV_BALANCE_WITHDRAWAL", topUpId: topUp.id, transactionId: reserved.transactionId } }, { idempotencyKey: `seedenv-withdraw-${reserved.transactionId}-${topUp.id}` });
    } catch (error) {
      console.error("SeedEnv balance refund failed for a top-up:", error instanceof Error ? error.message : error);
      continue;
    }
    await prisma.balanceTopUp.update({ where: { id: topUp.id }, data: { refundedCents: { increment: amount } } });
    remaining -= amount;
  }
  const refundedCents = reserved.amount - remaining;
  await serializable(async (tx) => {
    if (remaining > 0) await tx.user.update({ where: { id: userId }, data: { fundingBalanceCents: { increment: remaining } } });
    await tx.walletTransaction.update({ where: { id: reserved.transactionId }, data: refundedCents > 0 ? { amountCents: refundedCents, status: TransactionStatus.COMPLETED } : { status: TransactionStatus.FAILED } });
  });
  return { refundedCents, keptCents: remaining };
}

async function resolveStaleTopUp(topUp: { id: string; source: string; stripeCheckoutSessionId: string | null; campaignId: string | null; userId: string; createdAt: Date }, now: Date) {
  const stripe = getStripe();
  const markFailed = async (reason: string) => {
    await prisma.balanceTopUp.updateMany({ where: { id: topUp.id, status: "PENDING" }, data: { status: "FAILED", failureReason: reason } });
    // A launch that was never paid returns to an editable draft.
    if (topUp.campaignId) await prisma.appCampaign.updateMany({ where: { id: topUp.campaignId, developerId: topUp.userId, status: CampaignStatus.ESCROW_PENDING, fundingModel: "PAY_PER_TESTER" }, data: { status: CampaignStatus.DRAFT } });
  };
  if (topUp.source === "CHECKOUT") {
    if (!topUp.stripeCheckoutSessionId) return markFailed("Checkout was never created.");
    const session = await stripe.checkout.sessions.retrieve(topUp.stripeCheckoutSessionId);
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (session.status === "complete" && session.payment_status === "paid" && paymentIntentId) {
      await serializable((tx) => creditTopUp(tx, topUp.id, paymentIntentId));
      return;
    }
    if (session.status === "expired") return markFailed("Checkout expired before payment.");
    if (now.getTime() - topUp.createdAt.getTime() > CHECKOUT_LIFETIME_MS) {
      try { await stripe.checkout.sessions.expire(session.id); } catch { /* already closed */ }
      return markFailed("Checkout was abandoned.");
    }
    return;
  }
  const found = await stripe.paymentIntents.search({ query: `metadata['topUpId']:'${topUp.id.replace(/[^a-zA-Z0-9_-]/g, "")}'`, limit: 1 });
  const intent = found.data[0];
  if (intent?.status === "succeeded") {
    await serializable((tx) => creditTopUp(tx, topUp.id, intent.id));
    return;
  }
  if (intent && !["canceled", "requires_payment_method"].includes(intent.status)) {
    try { await stripe.paymentIntents.cancel(intent.id); } catch { return; }
  }
  await markFailed("Auto-reload did not complete.");
}

// Settles top-ups interrupted between Stripe and the database.
export async function sweepStaleTopUps(now = new Date(), limit = 25) {
  if (!process.env.STRIPE_SECRET_KEY) return 0;
  const stale = await prisma.balanceTopUp.findMany({ where: { status: "PENDING", createdAt: { lte: new Date(now.getTime() - STALE_TOP_UP_MS) } }, orderBy: { createdAt: "asc" }, take: limit });
  for (const topUp of stale) {
    try { await resolveStaleTopUp(topUp, now); } catch (error) { console.warn("SeedEnv stale top-up check failed:", error instanceof Error ? error.message : error); }
  }
  return stale.length;
}
