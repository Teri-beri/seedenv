"use client";

import { useSyncExternalStore } from "react";

export type LiveServiceState = "operational" | "degraded";

export type LiveSystemStatus =
  | { phase: "checking" }
  | { phase: "unreachable"; checkedAt: number }
  | {
      phase: "ready";
      overall: LiveServiceState;
      latencyMs: number;
      checkedAt: number;
      services: ReadonlyArray<{ id: string; name: string; state: LiveServiceState }>;
    };

type StatusPayload = {
  overall?: unknown;
  services?: unknown;
};

const POLL_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 8_000;
const CHECKING: LiveSystemStatus = { phase: "checking" };

let snapshot: LiveSystemStatus = CHECKING;
let timer: number | undefined;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: LiveSystemStatus) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function isState(value: unknown): value is LiveServiceState {
  return value === "operational" || value === "degraded";
}

function parseServices(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { id, name, state } = item as Record<string, unknown>;
    return typeof id === "string" && typeof name === "string" && isState(state) ? [{ id, name, state }] : [];
  });
}

export function refreshSystemStatus(): Promise<void> {
  if (inFlight) return inFlight;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = performance.now();
  inFlight = fetch("/api/status", { cache: "no-store", signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Status endpoint returned ${response.status}`);
      const payload = (await response.json()) as StatusPayload;
      const latencyMs = Math.max(1, Math.round(performance.now() - startedAt));
      publish({
        phase: "ready",
        overall: isState(payload.overall) ? payload.overall : "degraded",
        latencyMs,
        checkedAt: Date.now(),
        services: parseServices(payload.services),
      });
    })
    .catch(() => publish({ phase: "unreachable", checkedAt: Date.now() }))
    .finally(() => {
      window.clearTimeout(timeout);
      inFlight = null;
    });
  return inFlight;
}

function onVisibilityChange() {
  if (document.visibilityState === "visible") void refreshSystemStatus();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refreshSystemStatus();
    timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshSystemStatus();
    }, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearInterval(timer);
      timer = undefined;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

/** Server render and first client render both see "checking", so the pill never causes a hydration mismatch. */
export function useLiveSystemStatus(): LiveSystemStatus {
  return useSyncExternalStore(subscribe, () => snapshot, () => CHECKING);
}
