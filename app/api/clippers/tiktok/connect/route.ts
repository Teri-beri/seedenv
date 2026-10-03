import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { clipMember } from "@/lib/clippers";
import { tikTokConfig } from "@/lib/clipper-tiktok";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const member = await clipMember("TESTER");
    const config = tikTokConfig();
    const state = randomBytes(32).toString("hex");
    await prisma.clipOAuthState.deleteMany({ where: { OR: [{ userId: member.id }, { expiresAt: { lt: new Date() } }] } });
    await prisma.clipOAuthState.create({ data: { id: createHash("sha256").update(state).digest("hex"), userId: member.id, expiresAt: new Date(Date.now() + 600000) } });
    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.search = new URLSearchParams({ client_key: config.key, response_type: "code", scope: "user.info.basic,video.list", redirect_uri: config.redirect, state, disable_auto_auth: "1" }).toString();
    const response = NextResponse.redirect(url);
    response.cookies.set("clip-tiktok-state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/clippers/tiktok", maxAge: 600 });
    return response;
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "TikTok connection failed." }, { status: 400 });
  }
}
