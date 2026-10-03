import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { handleStripeWebhook } from "@/lib/campaign-payments";
import { getStripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!process.env.STRIPE_SECRET_KEY || !webhookSecret) {
    console.error("SeedEnv campaign webhook signing is not configured.");
    return NextResponse.json({ message: "Stripe webhook signing is not configured." }, { status: 503 });
  }
  if (!signature) return NextResponse.json({ message: "Stripe signature required." }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ message: "Invalid Stripe signature." }, { status: 400 });
  }
  try {
    return NextResponse.json(await handleStripeWebhook({ type: event.type, data: { object: { id: "id" in event.data.object ? event.data.object.id : undefined } } }));
  } catch (error) {
    console.error("SeedEnv campaign webhook processing failed:", event.id, error);
    return NextResponse.json({ message: "Payment processing failed; Stripe may retry." }, { status: 500 });
  }
}
