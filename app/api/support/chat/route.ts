import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { runSupportAgent, supportAiEnabled } from "@/lib/support-agent";
import { allowSupportChat } from "@/lib/support-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(2000) })).min(1).max(20),
  route: z.string().max(300).default("/"),
});

export async function POST(request: Request) {
  if (!supportAiEnabled()) return NextResponse.json({ error: "The AI assistant is not available right now. Contact a human from the tab above." }, { status: 503 });
  // JSON-only forces a CORS preflight, so other sites cannot drive this endpoint with a member's cookies.
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "Unsupported request." }, { status: 415 });
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Messages must be 1–2000 characters." }, { status: 400 });
  }
  if (body.messages.at(-1)?.role !== "user") return NextResponse.json({ error: "Send a question first." }, { status: 400 });

  const session = await getServerSession(authOptions);
  const member = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true, username: true } }) : null;
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (!allowSupportChat(member ? `m:${member.id}` : `ip:${ip}`, Boolean(member))) {
    return NextResponse.json({ error: "You've reached the assistant limit for now. Try again shortly, or contact a human from the tab above." }, { status: 429 });
  }

  try {
    const result = await runSupportAgent({ messages: body.messages, member, route: body.route.startsWith("/") ? body.route : "/" });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("SeedEnv support assistant failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "The assistant couldn't answer just now. Try again, or contact a human from the tab above." }, { status: 502 });
  }
}
