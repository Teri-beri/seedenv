import type { IncidentSeverity } from "@prisma/client";

export const TELEMETRY_THRESHOLDS = {
  criticalFps: 15,
  criticalLatencyMs: 2000,
  criticalMemoryMb: 1800,
} as const;

function numericMetric(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function resolveIncidentSeverity(input: {
  requestedSeverity: "WARN" | "CRITICAL";
  statusCode: string;
  payloadSnapshot?: unknown;
}): IncidentSeverity {
  if (input.requestedSeverity === "CRITICAL") return "CRITICAL";
  const normalizedCode = input.statusCode.trim().toUpperCase();
  if (/^5\d{2}\b/.test(normalizedCode) || normalizedCode === "1006" || /(OOM|CRASH|LUAU|UNHANDLED|FATAL)/.test(normalizedCode)) return "CRITICAL";
  const fps = numericMetric(input.payloadSnapshot, "fps");
  if (fps !== null && fps <= TELEMETRY_THRESHOLDS.criticalFps) return "CRITICAL";
  const latencyMs = numericMetric(input.payloadSnapshot, "latencyMs");
  if (latencyMs !== null && latencyMs >= TELEMETRY_THRESHOLDS.criticalLatencyMs) return "CRITICAL";
  const memoryMb = numericMetric(input.payloadSnapshot, "memoryMb");
  if (memoryMb !== null && memoryMb >= TELEMETRY_THRESHOLDS.criticalMemoryMb) return "CRITICAL";
  return "WARN";
}
