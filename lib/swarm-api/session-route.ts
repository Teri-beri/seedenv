import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { SwarmApiError } from "@/lib/swarm-api/service";

export const noStore = { "Cache-Control": "private, no-store" };

// Dashboard mutations are cookie-authenticated, so they must originate from SeedEnv itself.
type SwarmMember = { id: string; email: string; name: string | null; username: string; stripeCustomerId: string | null };

export async function requireSwarmMember(request: Request): Promise<{ user: SwarmMember } | { response: NextResponse }> {
  const origin = request.headers.get("origin");
  const requestHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(origin && new URL(origin).host === requestHost);
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) return { response: NextResponse.json({ message: "Cross-site requests are not allowed." }, { status: 403, headers: noStore }) };
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { response: NextResponse.json({ message: "Sign in to manage the SwarmForensics API." }, { status: 401, headers: noStore }) };
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, name: true, username: true, stripeCustomerId: true } });
  if (!user) return { response: NextResponse.json({ message: "Account not found." }, { status: 401, headers: noStore }) };
  return { user };
}

export function appOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  return (configured || new URL(request.url).origin).replace(/\/$/, "");
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function swarmErrorResponse(error: unknown, fallback: string) {
  if (error instanceof SwarmApiError) return NextResponse.json({ message: error.message }, { status: error.status, headers: noStore });
  console.error(`SwarmForensics API: ${fallback}`, error);
  return NextResponse.json({ message: fallback }, { status: 500, headers: noStore });
}
