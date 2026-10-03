import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { clipMember } from "@/lib/clippers";
import { connectTikTok } from "@/lib/clipper-tiktok";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const redirect = new URL("/clippers", request.url);
  try {
    const member = await clipMember("TESTER");
    const state = request.nextUrl.searchParams.get("state") || "";
    const cookie = request.cookies.get("clip-tiktok-state")?.value || "";
    if (!state || state.length !== cookie.length || !timingSafeEqual(Buffer.from(state), Buffer.from(cookie))) throw new Error("TikTok security state did not match. Start the connection again.");
    const consumed = await prisma.clipOAuthState.deleteMany({ where: { id: createHash("sha256").update(state).digest("hex"), userId: member.id, expiresAt: { gt: new Date() } } });
    if (!consumed.count) throw new Error("TikTok authorization expired or was already used.");
    const code = request.nextUrl.searchParams.get("code");
    if (!code || request.nextUrl.searchParams.has("error")) throw new Error("TikTok authorization was cancelled or denied.");
    await connectTikTok(member.id, code);
    redirect.searchParams.set("social", "connected");
  } catch (error) {
    console.warn("Clippers TikTok callback failed:", error instanceof Error ? error.message : "Unknown error");
    redirect.searchParams.set("social", "failed");
  }
  const response = NextResponse.redirect(redirect);
  response.cookies.delete({ name: "clip-tiktok-state", path: "/api/clippers/tiktok" });
  return response;
}
