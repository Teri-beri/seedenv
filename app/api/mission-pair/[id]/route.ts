import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth-options";
import { missionDeviceProfileSchema } from "@/lib/mission-device-profile";
import { missionPairRealtimeConfig, missionPairTokenFromRequest, publishMissionPairState, serializeMissionPairState, verifyMissionPairToken } from "@/lib/mission-pairing";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "private, no-store" };
const updateSchema = z.object({
  token: z.string().min(32).max(128).optional(),
  activeStep: z.number().int().min(0).max(99).optional(),
  completedSteps: z.array(z.number().int().min(0).max(99)).max(100).optional(),
  compact: z.boolean().optional(),
  deviceProfile: missionDeviceProfileSchema.optional(),
  confirmedDeviceModel: z.string().trim().min(2).max(120).optional(),
  recordingConfirmed: z.literal(true).optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "token"), "Provide a mission state update.");

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

async function authorizePairSession(id: string, token: string) {
  const authSession = await getServerSession(authOptions);
  if (!authSession?.user?.id) return { error: "Sign in as the assigned tester to use this pairing session.", status: 401 } as const;
  const pairSession = await prisma.missionPairSession.findUnique({
    where: { id },
    include: { submission: { select: { testerId: true, status: true, expiresAt: true, campaignId: true } } },
  });
  if (!pairSession || pairSession.testerId !== authSession.user.id || pairSession.submission.testerId !== authSession.user.id) {
    return { error: "Pairing session not found.", status: 404 } as const;
  }
  if (!verifyMissionPairToken(token, pairSession.tokenHash)) return { error: "Pairing token is invalid.", status: 403 } as const;
  const now = new Date();
  if (pairSession.expiresAt <= now || pairSession.submission.expiresAt <= now || pairSession.submission.status !== "PENDING") {
    return { error: "This pairing session has expired.", status: 410 } as const;
  }
  return { pairSession } as const;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const token = missionPairTokenFromRequest(request, id);
  const authorized = await authorizePairSession(id, token);
  if ("error" in authorized) return NextResponse.json({ error: authorized.error }, { status: authorized.status, headers: responseHeaders });

  const shouldRefreshPresence = url.searchParams.get("connect") === "1" || url.searchParams.get("heartbeat") === "1";
  const pairSession = shouldRefreshPresence
    ? await prisma.missionPairSession.update({
      where: { id },
      data: {
        connectedAt: url.searchParams.get("connect") === "1" ? authorized.pairSession.connectedAt || new Date() : undefined,
        lastSeenAt: new Date(),
      },
    })
    : authorized.pairSession;
  return NextResponse.json({
    state: serializeMissionPairState(pairSession),
    campaignId: authorized.pairSession.submission.campaignId,
    realtime: missionPairRealtimeConfig(),
  }, { headers: responseHeaders });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Cross-site pairing updates are not allowed." }, { status: 403, headers: responseHeaders });
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Provide a valid mission state." }, { status: 400, headers: responseHeaders });
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Mission state is invalid." }, { status: 400, headers: responseHeaders });

  const authorized = await authorizePairSession(id, missionPairTokenFromRequest(request, id, parsed.data.token));
  if ("error" in authorized) return NextResponse.json({ error: authorized.error }, { status: authorized.status, headers: responseHeaders });
  const completedSteps = parsed.data.completedSteps
    ? [...new Set(parsed.data.completedSteps)].sort((left, right) => left - right)
    : undefined;
  const pairSession = await prisma.missionPairSession.update({
    where: { id },
    data: {
      activeStep: parsed.data.activeStep,
      completedSteps,
      compact: parsed.data.compact,
      deviceProfile: parsed.data.deviceProfile as Prisma.InputJsonValue | undefined,
      confirmedDeviceModel: parsed.data.confirmedDeviceModel,
      recordingConfirmedAt: parsed.data.recordingConfirmed ? new Date() : undefined,
      lastSeenAt: new Date(),
    },
  });
  const state = serializeMissionPairState(pairSession);
  const realtimeDelivered = await publishMissionPairState(state);
  return NextResponse.json({ state, realtimeDelivered }, { headers: responseHeaders });
}
