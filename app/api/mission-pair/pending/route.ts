import { NextResponse } from "next/server";
import { z } from "zod";
import { MISSION_PAIR_COOKIE, verifyMissionPairToken } from "@/lib/mission-pairing";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "private, no-store" };
const pendingSchema = z.object({
  id: z.string().min(1).max(100),
  token: z.string().min(32).max(128),
}).strict();

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site pairing requests are not allowed." }, { status: 403, headers: responseHeaders });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide a valid pairing link." }, { status: 400, headers: responseHeaders });
  }
  const parsed = pendingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "This pairing link is invalid." }, { status: 400, headers: responseHeaders });
  const pairSession = await prisma.missionPairSession.findUnique({
    where: { id: parsed.data.id },
    select: {
      tokenHash: true,
      expiresAt: true,
      submission: { select: { status: true, expiresAt: true } },
    },
  });
  const now = new Date();
  if (!pairSession || !verifyMissionPairToken(parsed.data.token, pairSession.tokenHash)) {
    return NextResponse.json({ error: "This pairing link is invalid." }, { status: 403, headers: responseHeaders });
  }
  if (pairSession.expiresAt <= now || pairSession.submission.expiresAt <= now || pairSession.submission.status !== "PENDING") {
    return NextResponse.json({ error: "This pairing link has expired." }, { status: 410, headers: responseHeaders });
  }

  const response = NextResponse.json({ success: true }, { headers: responseHeaders });
  response.cookies.set(MISSION_PAIR_COOKIE, `${parsed.data.id}.${parsed.data.token}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, Math.min(86_400, Math.floor((pairSession.expiresAt.getTime() - now.getTime()) / 1000))),
  });
  return response;
}
