import { NextRequest, NextResponse } from "next/server";
import { handleStripeWebhook } from "@/app/actions/campaignActions";
import { getStripe } from "@/lib/stripe";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (process.env.STRIPE_SECRET_KEY && webhookSecret && signature) {
    try {
      const event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
      const result = await handleStripeWebhook({
        type: event.type,
        data: { object: event.data.object as { id?: string; payment_intent?: string; metadata?: Record<string, string> } },
      });
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json({ message: error instanceof Error ? error.message : "Invalid webhook" }, { status: 400 });
    }
  }

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Stripe webhook signing is not configured." }, { status: 500 });
  }

  const parsed = JSON.parse(rawBody) as { type: string; data: { object: { id?: string; payment_intent?: string; metadata?: Record<string, string> } } };
  return NextResponse.json(await handleStripeWebhook(parsed));
}
