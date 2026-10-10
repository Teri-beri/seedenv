import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deliverFollowerEmails } from "@/lib/follower-emails";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const result = await deliverFollowerEmails();
    return NextResponse.json(result, { status: result.failed ? 503 : 200 });
  } catch (error) {
    console.error("SeedEnv follower email worker failed:", error);
    return NextResponse.json({ error: "Follower email delivery failed; queued updates remain pending." }, { status: 503 });
  }
}
