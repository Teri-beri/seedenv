import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const allowedEvents = new Set(["page_view", "cta_click", "mission_open", "signup_start"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const eventName = typeof body.eventName === "string" ? body.eventName : "";
    const path = typeof body.path === "string" ? body.path.slice(0, 240) : "/";
    if (!allowedEvents.has(eventName)) return NextResponse.json({ message: "Unsupported event" }, { status: 400 });

    await prisma.analyticsEvent.create({
      data: {
        eventName,
        path,
        sessionKey: typeof body.sessionKey === "string" ? body.sessionKey.slice(0, 80) : null,
        referrer: request.headers.get("referer")?.slice(0, 500) || null,
        userAgent: request.headers.get("user-agent")?.slice(0, 500) || null,
        metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Analytics unavailable" }, { status: 202 });
  }
}