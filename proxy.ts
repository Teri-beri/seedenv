import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const roleHome = {
  TESTER: "/dashboard",
  DEVELOPER: "/console",
  ADMIN: "/admin",
} as const;

const protectedRoutes = [
  { prefix: "/dashboard", role: "TESTER" },
  { prefix: "/console", role: "DEVELOPER" },
  { prefix: "/admin", role: "ADMIN" },
] as const;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const route = protectedRoutes.find((item) => pathname.startsWith(item.prefix));
  if (!route) return NextResponse.next();

  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      const signInUrl = new URL("/auth/signin", request.url);
      signInUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(signInUrl);
    }

    if (token.role !== route.role) {
      const fallbackPath = typeof token.role === "string" && token.role in roleHome
        ? roleHome[token.role as keyof typeof roleHome]
        : "/auth/signin";
      return NextResponse.redirect(new URL(fallbackPath, request.url));
    }

    return NextResponse.next();
  } catch (error) {
    console.error("SeedEnv proxy auth check failed:", error);
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/console/:path*", "/admin/:path*"],
};