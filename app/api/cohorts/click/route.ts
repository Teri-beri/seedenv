import { createHmac } from "node:crypto";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { ANALYTICS_OPT_OUT_COOKIE, clientIp, excludedIps, isBotUserAgent, isLocalHost, visitorIdFor } from "@/lib/analytics-context";

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || new URL(request.url).host;
    if (!origin || !/^https?:$/.test(new URL(origin).protocol) || new URL(origin).host !== host) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
    if (Number(request.headers.get("content-length") || 0) > 1000) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    const body = await request.text();
    if (body.length > 1000) return NextResponse.json({ error: "Payload too large." }, { status: 413 });
    let input: unknown;
    try { input = JSON.parse(body); }
    catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
    const parsed = z.object({ campaignId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/) }).strict().safeParse(input);
    if (!parsed.success) return NextResponse.json({ error: "Invalid cohort." }, { status: 400 });
    const ua = request.headers.get("user-agent")?.slice(0, 500) || "";
    const ip = clientIp(request.headers);
    const skipped = (reason: string) => NextResponse.json({ counted: false, reason });
    if (isLocalHost(host)) return skipped("local");
    if (isBotUserAgent(ua)) return skipped("bot");
    if (request.cookies.get(ANALYTICS_OPT_OUT_COOKIE)?.value === "1" || ip && excludedIps().has(ip)) return skipped("excluded");
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error("Cohort analytics hashing is not configured.");
    const session = await getServerSession(authOptions);
    const campaign = await prisma.appCampaign.findFirst({ where: { id: parsed.data.campaignId, status: "ACTIVE", cancelledAt: null, expiresAt: { gt: new Date() } }, select: { id: true, developerId: true } });
    if (!campaign) return skipped("unavailable");
    if (session?.user?.id === campaign.developerId) return skipped("own-cohort");
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    if (!session?.user?.id && !ip) return skipped("unidentified");
    const visitorKey = session?.user?.id
      ? createHmac("sha256", secret).update(`${day}|${session.user.id}`).digest("hex").slice(0, 24)
      : visitorIdFor(ip, ua, secret, now);
    const result = await prisma.cohortClick.createMany({ data: [{ campaignId: campaign.id, visitorKey, day }], skipDuplicates: true });
    return NextResponse.json({ counted: result.count > 0 });
  } catch (error) {
    console.error("SeedEnv cohort click tracking failed:", error);
    return NextResponse.json({ error: "Cohort analytics unavailable." }, { status: 503 });
  }
}
