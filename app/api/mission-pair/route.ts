import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth-options";
import { createMissionPairCredentials, missionPairRealtimeConfig, serializeMissionPairState } from "@/lib/mission-pairing";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "private, no-store" };
const createSchema = z.object({
  submissionId: z.string().min(1).max(100),
  activeStep: z.number().int().min(0).max(99).default(0),
  completedSteps: z.array(z.number().int().min(0).max(99)).max(100).default([]),
  compact: z.boolean().default(false),
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
  const authSession = await getServerSession(authOptions);
  if (!authSession?.user?.id || authSession.user.role !== "TESTER") {
    return NextResponse.json({ error: "Sign in as the assigned tester to pair a device." }, { status: 401, headers: responseHeaders });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide a valid pairing request." }, { status: 400, headers: responseHeaders });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A valid submission is required." }, { status: 400, headers: responseHeaders });

  const now = new Date();
  const submission = await prisma.submission.findFirst({
    where: { id: parsed.data.submissionId, testerId: authSession.user.id, status: "PENDING", expiresAt: { gt: now } },
    select: { id: true, campaignId: true, expiresAt: true },
  });
  if (!submission) return NextResponse.json({ error: "This mission is not available for device pairing." }, { status: 404, headers: responseHeaders });

  const credentials = createMissionPairCredentials();
  const completedSteps = [...new Set(parsed.data.completedSteps)].sort((left, right) => left - right);
  const pairSession = await prisma.$transaction(async (tx) => {
    await tx.missionPairSession.deleteMany({
      where: { submissionId: submission.id, OR: [{ expiresAt: { lte: now } }, { connectedAt: null }] },
    });
    return tx.missionPairSession.create({
      data: {
        submissionId: submission.id,
        testerId: authSession.user.id,
        tokenHash: credentials.tokenHash,
        channelKey: credentials.channelKey,
        activeStep: parsed.data.activeStep,
        completedSteps,
        compact: parsed.data.compact,
        expiresAt: submission.expiresAt,
      },
    });
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || new URL(request.url).origin;
  const pairUrl = new URL(`/dashboard?view=missions&claim=${encodeURIComponent(submission.campaignId)}`, origin);
  pairUrl.hash = new URLSearchParams({ pair: pairSession.id, token: credentials.token }).toString();

  return NextResponse.json({
    state: serializeMissionPairState(pairSession),
    pairUrl: pairUrl.toString(),
    code: credentials.channelKey.slice(0, 6).toUpperCase(),
    token: credentials.token,
    realtime: missionPairRealtimeConfig(),
  }, { status: 201, headers: responseHeaders });
}
