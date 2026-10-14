import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import Pusher from "pusher";
import { parseMissionDeviceProfile, type MissionDeviceProfile } from "@/lib/mission-device-profile";

export const MISSION_PAIR_EVENT = "mission-state";
export const MISSION_PAIR_COOKIE = "seedenv_mission_pair";

export type MissionPairState = {
  id: string;
  submissionId: string;
  channelKey: string;
  activeStep: number;
  completedSteps: number[];
  compact: boolean;
  deviceProfile: MissionDeviceProfile | null;
  confirmedDeviceModel: string | null;
  connectedAt: string | null;
  recordingConfirmedAt: string | null;
  proofSubmittedAt: string | null;
  lastSeenAt: string | null;
  expiresAt: string;
  updatedAt: string;
};

export function createMissionPairCredentials() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashMissionPairToken(token),
    channelKey: randomBytes(24).toString("hex"),
  };
}

export function hashMissionPairToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyMissionPairToken(token: string, expectedHash: string) {
  if (!token || !/^[a-zA-Z0-9_-]{32,128}$/.test(token) || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  return timingSafeEqual(Buffer.from(hashMissionPairToken(token), "hex"), Buffer.from(expectedHash, "hex"));
}

export function serializeMissionPairState(session: {
  id: string;
  submissionId: string;
  channelKey: string;
  activeStep: number;
  completedSteps: number[];
  compact: boolean;
  deviceProfile: unknown;
  confirmedDeviceModel: string | null;
  connectedAt: Date | null;
  recordingConfirmedAt: Date | null;
  proofSubmittedAt: Date | null;
  lastSeenAt: Date | null;
  expiresAt: Date;
  updatedAt: Date;
}): MissionPairState {
  return {
    id: session.id,
    submissionId: session.submissionId,
    channelKey: session.channelKey,
    activeStep: session.activeStep,
    completedSteps: session.completedSteps,
    compact: session.compact,
    deviceProfile: parseMissionDeviceProfile(session.deviceProfile),
    confirmedDeviceModel: session.confirmedDeviceModel,
    connectedAt: session.connectedAt?.toISOString() ?? null,
    recordingConfirmedAt: session.recordingConfirmedAt?.toISOString() ?? null,
    proofSubmittedAt: session.proofSubmittedAt?.toISOString() ?? null,
    lastSeenAt: session.lastSeenAt?.toISOString() ?? null,
    expiresAt: session.expiresAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

export function missionPairTokenFromRequest(request: Request, sessionId: string, bodyToken?: string) {
  if (bodyToken) return bodyToken;
  const authorization = request.headers.get("authorization") || "";
  if (authorization.startsWith("Bearer ")) return authorization.slice(7);
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${MISSION_PAIR_COOKIE}=`));
  if (!cookie) return "";
  try {
    const value = decodeURIComponent(cookie.slice(MISSION_PAIR_COOKIE.length + 1));
    const separator = value.indexOf(".");
    return separator > 0 && value.slice(0, separator) === sessionId ? value.slice(separator + 1) : "";
  } catch {
    return "";
  }
}

function pusherClient() {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY || process.env.NEXT_PUBLIC_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER || process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!appId || !key || !secret || !cluster) return null;
  return new Pusher({ appId, key, secret, cluster, useTLS: true });
}

export function missionPairChannel(channelKey: string) {
  return `mission-${channelKey}`;
}

export function missionPairRealtimeConfig() {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  return key && cluster ? { key, cluster } : null;
}

export async function publishMissionPairState(state: MissionPairState) {
  const client = pusherClient();
  if (!client) return false;
  try {
    await client.trigger(missionPairChannel(state.channelKey), MISSION_PAIR_EVENT, state);
    return true;
  } catch (error) {
    console.warn("SeedEnv mission pair realtime dispatch failed:", state.id, error instanceof Error ? error.message : error);
    return false;
  }
}
