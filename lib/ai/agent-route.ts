import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { ZodType } from "zod";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const noStore = { "Cache-Control": "private, no-store" };

export type AgentCaller = { kind: "cron" } | { kind: "member"; id: string; role: string; admin: boolean };

export function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status, headers: noStore });
}

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Browser callers must be same-origin members; server-to-server callers may use the cron secret when allowed.
export async function resolveAgentCaller(request: Request, { allowCron }: { allowCron: boolean }): Promise<AgentCaller | NextResponse> {
  if (allowCron && cronAuthorized(request)) return { kind: "cron" };
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  if (origin) {
    try {
      if (new URL(origin).host !== host) return jsonError("Cross-site requests are not allowed.", 403);
    } catch {
      return jsonError("Cross-site requests are not allowed.", 403);
    }
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return jsonError("Sign in to continue.", 401);
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true } });
  if (!user) return jsonError("Sign in to continue.", 401);
  return { kind: "member", id: user.id, role: user.role, admin: user.role === "ADMIN" };
}

export async function parseJsonBody<T>(request: Request, schema: ZodType<T>, maxBytes = 32_000): Promise<T | NextResponse> {
  const text = await request.text().catch(() => "");
  if (text.length > maxBytes) return jsonError("Request body is too large.", 413);
  let raw: unknown;
  try {
    raw = JSON.parse(text || "{}");
  } catch {
    return jsonError("Request body must be JSON.", 400);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return jsonError(parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ").slice(0, 400), 400);
  return parsed.data;
}

const windows = new Map<string, number[]>();
let day = "";
let dayCount = 0;

// In-process limiter: a per-key burst window plus a daily ceiling that caps model spend.
export function allowAgentCall(key: string, perHour: number, dailyLimit: number, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (dayCount >= dailyLimit) return false;
  const recent = (windows.get(key) ?? []).filter((time) => now - time < 3_600_000);
  if (recent.length >= perHour) {
    windows.set(key, recent);
    return false;
  }
  recent.push(now);
  windows.set(key, recent);
  dayCount += 1;
  if (windows.size > 5000) for (const [entry, times] of windows) if (!times.some((time) => now - time < 3_600_000)) windows.delete(entry);
  return true;
}

export function resetAgentLimits() {
  windows.clear();
  day = "";
  dayCount = 0;
}
