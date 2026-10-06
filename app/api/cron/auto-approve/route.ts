import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { autoApproveOverdueSubmissions } from "@/lib/submission-approval";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") || "";
  if (!secret || secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const approved = await autoApproveOverdueSubmissions();
  return NextResponse.json({ approved });
}
