import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

// Returns a live Stripe customer for the member, recreating one if the stored ID was deleted.
export async function ensureStripeCustomer(user: { id: string; email: string; name: string | null; username: string; stripeCustomerId: string | null }) {
  const stripe = getStripe();
  let customerId = user.stripeCustomerId;
  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) customerId = null;
    } catch (error) {
      const stripeCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (stripeCode === "resource_missing") customerId = null;
      else throw error;
    }
  }
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || user.username,
      metadata: { seedenvUserId: user.id },
    }, { idempotencyKey: `seedenv-customer-${user.id}` });
    customerId = customer.id;
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  }
  return customerId;
}

// Prefills Stripe Checkout with the member's saved billing profile so tax validation sees the same jurisdiction.
export async function syncStripeCustomerBillingAddress(userId: string, customerId: string) {
  const profile = await prisma.billingProfile.findUnique({ where: { userId } });
  if (!profile) return;
  await getStripe().customers.update(customerId, {
    name: profile.companyName,
    ...(profile.billingEmail ? { email: profile.billingEmail } : {}),
    address: {
      line1: profile.addressLine1,
      line2: profile.addressLine2 ?? undefined,
      city: profile.city,
      state: profile.region ?? undefined,
      postal_code: profile.postalCode,
      country: profile.country,
    },
  });
}
