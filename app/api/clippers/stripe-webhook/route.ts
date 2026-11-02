import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { notifyClipAgreement, requireClippers } from "@/lib/clippers";
import { handleClipPaymentEvent } from "@/lib/clipper-payments";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.CLIPPERS_STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ message: "Clippers webhook signature or configuration missing." }, { status: 400 });
  let event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ message: "Invalid Stripe signature." }, { status: 400 });
  }
  try {
    requireClippers();
    const funded = await handleClipPaymentEvent(event);
    if (funded) await notifyClipAgreement(funded.agreementId, funded.developerId, "Funding is confirmed. Your creator agreement now says Funded; you may start work. Open it for the draft deadline.");
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Clippers webhook processing failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ message: "Clippers webhook could not be processed. Stripe should retry." }, { status: 500 });
  }
}
