import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { ensureStripeCustomer } from "@/lib/stripe-customer";
import { isPaidPlanId, planForLookupKey, SWARM_API_PLANS, type PaidSwarmApiPlanId } from "@/lib/swarm-api/plans";
import { getOrCreateSwarmApiAccount, SwarmApiError } from "@/lib/swarm-api/service";

export const SWARM_API_CHECKOUT_TYPE = "SEEDENV_SWARM_API";
const ACTIVE_LIKE = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);
const priceCache = new Map<PaidSwarmApiPlanId, string>();

const stripeId = (value: string | { id: string } | null | undefined) => typeof value === "string" ? value : value?.id ?? null;

// Prices are found by lookup key and created on first use, so no dashboard setup or env price IDs are required.
export async function ensurePlanPrice(plan: PaidSwarmApiPlanId) {
  const cached = priceCache.get(plan);
  if (cached) return cached;
  const config = SWARM_API_PLANS[plan];
  const stripe = getStripe();
  const existing = await stripe.prices.list({ lookup_keys: [config.lookupKey!], active: true, limit: 1 });
  const match = existing.data.find((price) => price.unit_amount === config.priceCents && price.currency === "usd" && price.recurring?.interval === "month");
  const priceId = match?.id ?? (await stripe.prices.create({
    currency: "usd",
    unit_amount: config.priceCents,
    recurring: { interval: "month" },
    lookup_key: config.lookupKey!,
    transfer_lookup_key: true,
    product_data: { name: `SwarmForensics API — ${config.name}`, metadata: { seedenvProduct: "swarm_api", plan } },
    metadata: { seedenvProduct: "swarm_api", plan },
  }, { idempotencyKey: `seedenv-swarm-price-${plan}-${config.priceCents}-v1` })).id;
  priceCache.set(plan, priceId);
  return priceId;
}

type BillingUser = { id: string; email: string; name: string | null; username: string; stripeCustomerId: string | null };

export async function startSubscriptionCheckout(user: BillingUser, plan: PaidSwarmApiPlanId, origin: string) {
  const account = await getOrCreateSwarmApiAccount(user.id);
  if (account.stripeSubscriptionId && account.subscriptionStatus && ACTIVE_LIKE.has(account.subscriptionStatus)) {
    throw new SwarmApiError("You already have a SwarmForensics API subscription. Change plans instead.", 409);
  }
  const customer = await ensureStripeCustomer(user);
  const metadata = { type: SWARM_API_CHECKOUT_TYPE, seedenvUserId: user.id, plan, terimus_llc_business_unit: "seedenv" };
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: await ensurePlanPrice(plan), quantity: 1 }],
    metadata,
    subscription_data: { metadata, description: `SwarmForensics API — ${SWARM_API_PLANS[plan].name}` },
    allow_promotion_codes: false,
    success_url: `${origin}/account?tab=swarm-api&swarmCheckout={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/account?tab=swarm-api&swarmCheckout=cancelled`,
  });
  if (!session.url) throw new SwarmApiError("Stripe did not return a checkout URL.", 502);
  return session.url;
}

function periodEnd(subscription: Stripe.Subscription) {
  const end = subscription.items.data[0]?.current_period_end;
  return typeof end === "number" ? new Date(end * 1000) : null;
}

// Pulls the authoritative subscription from Stripe and mirrors it onto the owning SeedEnv account.
export async function syncSwarmSubscription(subscriptionId: string, expectedUserId?: string) {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.metadata?.type !== SWARM_API_CHECKOUT_TYPE) return { ignored: true as const };
  const userId = subscription.metadata.seedenvUserId;
  if (!userId || (expectedUserId && userId !== expectedUserId)) throw new Error("SwarmForensics subscription owner does not match.");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });
  if (!user || !user.stripeCustomerId || user.stripeCustomerId !== stripeId(subscription.customer)) throw new Error("SwarmForensics subscription customer does not match the member.");
  const account = await getOrCreateSwarmApiAccount(userId);
  const ended = subscription.status === "canceled" || subscription.status === "incomplete_expired";
  if (account.stripeSubscriptionId && account.stripeSubscriptionId !== subscription.id) {
    // A stale or duplicate subscription must not overwrite the live one.
    if (ended || (account.subscriptionStatus && ACTIVE_LIKE.has(account.subscriptionStatus))) return { ignored: true as const, reason: "superseded" };
  }
  if (ended) {
    await prisma.swarmApiAccount.update({ where: { id: account.id }, data: { plan: "SANDBOX", subscriptionStatus: subscription.status, stripeSubscriptionId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false } });
    return { synced: true as const, plan: "SANDBOX", status: subscription.status };
  }
  const lookupKey = subscription.items.data[0]?.price.lookup_key;
  const plan = planForLookupKey(lookupKey) ?? (isPaidPlanId(subscription.metadata.plan) ? subscription.metadata.plan : null);
  if (!plan) throw new Error("SwarmForensics subscription price does not match a plan.");
  await prisma.swarmApiAccount.update({
    where: { id: account.id },
    data: { plan, subscriptionStatus: subscription.status, stripeSubscriptionId: subscription.id, currentPeriodEnd: periodEnd(subscription), cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end || subscription.cancel_at) },
  });
  return { synced: true as const, plan, status: subscription.status };
}

export async function syncSwarmCheckoutSession(sessionId: string, expectedUserId?: string) {
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.metadata?.type !== SWARM_API_CHECKOUT_TYPE) return { ignored: true as const };
  if (expectedUserId && session.metadata.seedenvUserId !== expectedUserId) throw new SwarmApiError("This checkout belongs to a different account.", 403);
  const subscriptionId = stripeId(session.subscription);
  if (session.status !== "complete" || !subscriptionId) return { awaitingPayment: true as const };
  return syncSwarmSubscription(subscriptionId, session.metadata.seedenvUserId);
}

async function liveSubscription(userId: string) {
  const account = await getOrCreateSwarmApiAccount(userId);
  if (!account.stripeSubscriptionId) throw new SwarmApiError("No active SwarmForensics API subscription.", 404);
  return { account, subscription: await getStripe().subscriptions.retrieve(account.stripeSubscriptionId) };
}

export async function changeSubscriptionPlan(userId: string, plan: PaidSwarmApiPlanId) {
  const { account, subscription } = await liveSubscription(userId);
  if (account.plan === plan) throw new SwarmApiError(`You're already on ${SWARM_API_PLANS[plan].name}.`, 409);
  const item = subscription.items.data[0];
  if (!item) throw new Error("Subscription has no billable item.");
  await getStripe().subscriptions.update(subscription.id, {
    items: [{ id: item.id, price: await ensurePlanPrice(plan) }],
    proration_behavior: "create_prorations",
    cancel_at_period_end: false,
    metadata: { ...subscription.metadata, plan },
  });
  return syncSwarmSubscription(subscription.id, userId);
}

export async function setSubscriptionCancellation(userId: string, cancel: boolean) {
  const { subscription } = await liveSubscription(userId);
  await getStripe().subscriptions.update(subscription.id, { cancel_at_period_end: cancel });
  return syncSwarmSubscription(subscription.id, userId);
}

export async function openBillingPortal(user: BillingUser, origin: string) {
  const customer = await ensureStripeCustomer(user);
  try {
    const session = await getStripe().billingPortal.sessions.create({ customer, return_url: `${origin}/account?tab=swarm-api` });
    return session.url;
  } catch {
    throw new SwarmApiError("The Stripe billing portal isn't available yet. Use the plan controls here, or contact support to update your card.", 503);
  }
}

export function isSwarmSubscriptionEvent(type: string) {
  return type === "customer.subscription.created" || type === "customer.subscription.updated" || type === "customer.subscription.deleted" || type === "customer.subscription.paused" || type === "customer.subscription.resumed";
}
