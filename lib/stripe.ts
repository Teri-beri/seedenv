import Stripe from "stripe";

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is required for escrow payments.");
  return new Stripe(key, { apiVersion: "2026-08-26.dahlia" });
}

export const SEEDENV_PLATFORM_FEE_PERCENT = 0.2;