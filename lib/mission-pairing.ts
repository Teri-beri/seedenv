import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import Pusher from "pusher";

export const MISSION_PAIR_EVENT = "mission-state";

export type MissionPairState = {
  id: string;
  submissionId: string;
  channelKey: string;
  activeStep: number;
  completedSteps: number[];
  compact: boolean;
  connectedAt: string | null;
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
  connectedAt: Date | null;
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
    connectedAt: session.connectedAt?.toISOString() ?? null,
    expiresAt: session.expiresAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
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
