import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import {
  ANALYTICS_OPT_OUT_COOKIE,
  analyticsOwnerEmail,
  clientIp,
  countryFrom,
  excludedIps,
  isBotUserAgent,
  isLocalHost,
  parseUserAgent,
  sourceFrom,
  visitorIdFor,
} from "@/lib/analytics-context";

const allowedEvents = new Set(["page_view", "cta_click", "mission_open", "signup_start", "engagement"]);
const MAX_ENGAGED_MS = 30 * 60 * 1000;
const optOutMaxAge = 60 * 60 * 24 * 365 * 2;

function skipped(reason: string, optOut = false) {
  const response = NextResponse.json({ ok: true, counted: false, reason });
  if (optOut) {
    response.cookies.set(ANALYTICS_OPT_OUT_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: optOutMaxAge });
  }
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 12_000) return NextResponse.json({ message: "Payload too large" }, { status: 413 });
    const body = await request.json();
    const eventName = typeof body.eventName === "string" ? body.eventName : "";
    const path = typeof body.path === "string" ? body.path.slice(0, 240) : "/";
    if (!allowedEvents.has(eventName)) return NextResponse.json({ message: "Unsupported event" }, { status: 400 });

    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (isLocalHost(host)) return skipped("local");

    const userAgent = request.headers.get("user-agent")?.slice(0, 500) || "";
    if (isBotUserAgent(userAgent)) return skipped("bot");
    if (request.cookies.get(ANALYTICS_OPT_OUT_COOKIE)?.value === "1") return skipped("opted-out");

    const ip = clientIp(request.headers);
    if (ip && excludedIps().has(ip)) return skipped("excluded-ip");

    const secret = process.env.NEXTAUTH_SECRET || "";
    const token = secret ? await getToken({ req: request, secret }).catch(() => null) : null;
    const ownerEmail = analyticsOwnerEmail();
    const tokenEmail = typeof token?.email === "string" ? token.email.trim().toLowerCase() : null;
    if (token && ((ownerEmail && tokenEmail === ownerEmail) || token.role === "ADMIN")) return skipped("owner", true);

    const rawMetadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
    const metadata = Object.fromEntries(Object.entries(rawMetadata).slice(0, 8).map(([key, value]) => [key.slice(0, 40), String(value).slice(0, 160)]));
    const { device, browser, os } = parseUserAgent(userAgent);
    const loadMs = typeof body.loadMs === "number" && Number.isFinite(body.loadMs) && body.loadMs > 0 && body.loadMs < 120_000 ? Math.round(body.loadMs) : null;
    const engagedMs = typeof body.engagedMs === "number" && Number.isFinite(body.engagedMs) && body.engagedMs >= 1000 ? Math.min(Math.round(body.engagedMs), MAX_ENGAGED_MS) : null;
    if (eventName === "engagement" && engagedMs === null) return skipped("too-short");

    await prisma.analyticsEvent.create({
      data: {
        eventName,
        path,
        sessionKey: typeof body.sessionKey === "string" ? body.sessionKey.slice(0, 80) : null,
        referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 500) || null : null,
        userAgent,
        metadata,
        visitorId: visitorIdFor(ip, userAgent, secret),
        source: sourceFrom(body.referrer, body.utmSource, host),
        country: countryFrom(request.headers),
        device,
        browser,
        os,
        loadMs: eventName === "page_view" ? loadMs : null,
        engagedMs: eventName === "engagement" ? engagedMs : null,
      },
    });
    return NextResponse.json({ ok: true, counted: true });
  } catch {
    return NextResponse.json({ message: "Analytics unavailable" }, { status: 202 });
  }
}
