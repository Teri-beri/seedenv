import { NextRequest, NextResponse } from "next/server";
import { expireSlots } from "@/app/actions/submissionActions";
import { sweepCampaignFunding } from "@/lib/slot-funding";

async function run() {
  const slots = await expireSlots();
  return { ...slots, funding: await sweepCampaignFunding() };
}

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await run());
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await run());
}
