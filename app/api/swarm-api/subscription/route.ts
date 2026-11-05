import { NextResponse } from "next/server";
import { changeSubscriptionPlan, openBillingPortal, setSubscriptionCancellation, startSubscriptionCheckout } from "@/lib/swarm-api/billing";
import { isPaidPlanId } from "@/lib/swarm-api/plans";
import { appOrigin, noStore, readJson, requireSwarmMember, swarmErrorResponse } from "@/lib/swarm-api/session-route";

export async function POST(request: Request) {
  const member = await requireSwarmMember(request);
  if ("response" in member) return member.response;
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ message: "Billing is not configured." }, { status: 503, headers: noStore });
  const body = await readJson(request);
  const action = body.action;
  try {
    if (action === "checkout" || action === "change") {
      if (!isPaidPlanId(body.plan)) return NextResponse.json({ message: "Choose a valid plan." }, { status: 400, headers: noStore });
      if (action === "checkout") return NextResponse.json({ url: await startSubscriptionCheckout(member.user, body.plan, appOrigin(request)) }, { headers: noStore });
      return NextResponse.json(await changeSubscriptionPlan(member.user.id, body.plan), { headers: noStore });
    }
    if (action === "cancel" || action === "resume") return NextResponse.json(await setSubscriptionCancellation(member.user.id, action === "cancel"), { headers: noStore });
    if (action === "portal") return NextResponse.json({ url: await openBillingPortal(member.user, appOrigin(request)) }, { headers: noStore });
    return NextResponse.json({ message: "Unknown action." }, { status: 400, headers: noStore });
  } catch (error) {
    return swarmErrorResponse(error, "Billing request failed. Please try again.");
  }
}
