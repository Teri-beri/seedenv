import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";

function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return getStripe();
}

export async function POST() {
  try {
    const user = await getCurrentUser("TESTER");
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accountId = user.stripeConnectAccountId;
    if (!accountId) {
      return NextResponse.json(
        { error: "No connected Stripe Express account found" },
        { status: 400 },
      );
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe is not configured for this deployment" },
        { status: 503 },
      );
    }

    const loginLink = await stripe.accounts.createLoginLink(accountId);
    return NextResponse.json({ url: loginLink.url });
  } catch (error: unknown) {
    console.error("SeedEnv Stripe Express login link error:", error);
    const message = error instanceof Error ? error.message : "Unable to generate Stripe Express login link";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
