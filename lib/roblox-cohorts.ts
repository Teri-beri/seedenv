import type { RobloxAuditFocus } from "@prisma/client";

export type RobloxDeviceConstraints = {
  mobileOnly: boolean;
  allowIpad: boolean;
  allowDesktop: boolean;
};

export type RobloxSubmissionChecklist = {
  interfaceScaled: boolean;
  stableFramerate: boolean;
  consoleCaptured: boolean;
};

export const DEFAULT_ROBLOX_DEVICE_CONSTRAINTS: RobloxDeviceConstraints = {
  mobileOnly: true,
  allowIpad: false,
  allowDesktop: false,
};

export function parseRobloxDeviceConstraints(value: unknown): RobloxDeviceConstraints {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_ROBLOX_DEVICE_CONSTRAINTS;
  const constraints = value as Record<string, unknown>;
  return {
    mobileOnly: typeof constraints.mobileOnly === "boolean" ? constraints.mobileOnly : true,
    allowIpad: typeof constraints.allowIpad === "boolean" ? constraints.allowIpad : false,
    allowDesktop: typeof constraints.allowDesktop === "boolean" ? constraints.allowDesktop : false,
  };
}

export function parseRobloxSubmissionChecklist(value: unknown): RobloxSubmissionChecklist | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const checklist = value as Record<string, unknown>;
  if (typeof checklist.interfaceScaled !== "boolean" || typeof checklist.stableFramerate !== "boolean" || typeof checklist.consoleCaptured !== "boolean") return null;
  return {
    interfaceScaled: checklist.interfaceScaled,
    stableFramerate: checklist.stableFramerate,
    consoleCaptured: checklist.consoleCaptured,
  };
}

export const ROBLOX_AUDIT_FOCUS_LABELS: Record<RobloxAuditFocus, string> = {
  MOBILE_GUI_SCALING: "Mobile Notch & Dynamic Island UI Scaling",
  LOW_END_MEMORY_THROTTLE: "Low-Memory Stress & Crash Profiling (RAM ≤ 4GB)",
  CONCURRENT_SERVER_STRESS: "Multiplayer Server Latency & Physics Replication",
  DATASTORE_EXPLOIT_VERIFICATION: "GamePass & In-Experience Commerce UI Verification",
  CONSOLE_CONTROLLER_MAPPING: "Console controller mapping",
};

export function isRobloxPlaceId(value: string) {
  return /^\d{1,20}$/.test(value.trim());
}

export function extractRobloxPlaceId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isRobloxPlaceId(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/games\/(\d+)(?:\/|$)/);
    if (match) return match[1];
    return url.searchParams.get("placeId") || url.searchParams.get("place_id");
  } catch {
    const fallback = trimmed.match(/(?:placeId|place_id|gameId|universeId)[=/:](\d+)/i);
    return fallback?.[1] ?? null;
  }
}

export function buildRobloxLaunchUrl(value?: string | null, placeId?: string | null) {
  if (!value && !placeId) return null;
  const normalizedValue = value?.trim();
  if (normalizedValue?.startsWith("roblox://")) return normalizedValue;
  if (normalizedValue && /^https?:\/\//i.test(normalizedValue)) return normalizedValue;
  const resolvedPlaceId = normalizedValue && isRobloxPlaceId(normalizedValue) ? normalizedValue : placeId?.trim();
  if (resolvedPlaceId && isRobloxPlaceId(resolvedPlaceId)) return `roblox://placeId=${resolvedPlaceId}`;
  return null;
}

export function isRobloxExperienceUrl(value: string) {
  try {
    const url = new URL(value.trim());
    const isRobloxHost = url.hostname === "roblox.com" || url.hostname.endsWith(".roblox.com");
    if (!isRobloxHost || url.protocol !== "https:") return false;
    if (/^\/games\/\d+(?:\/|$)/.test(url.pathname)) return true;
    if (url.pathname === "/share" && Boolean(url.searchParams.get("code"))) return true;
    const queryPlaceId = url.searchParams.get("placeId") || url.searchParams.get("place_id");
    if (queryPlaceId && isRobloxPlaceId(queryPlaceId)) return true;
    return false;
  } catch {
    return false;
  }
}

export function isRobloxAccessMethod(value: string) {
  return isRobloxExperienceUrl(value) || isRobloxPlaceId(value);
}
