import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runOwnerPayout } from "@/lib/owner-earnings";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") || "";
  if (!secret || secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// POST runs this Friday's payout if it is due; add ?dryRun=1 to only see the calculation.
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  try {
    return NextResponse.json(await runOwnerPayout({ dryRun }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Owner payout failed." }, { status: 500 });
  }
}
