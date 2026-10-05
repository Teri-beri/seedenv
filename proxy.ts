import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const roleHome = {
  TESTER: "/dashboard",
  DEVELOPER: "/console",
  ADMIN: "/admin",
} as const;

const protectedRoutes = [
  { prefix: "/clippers", role: null, strictRole: false },
  { prefix: "/quests", role: "TESTER", strictRole: false },
  { prefix: "/applications", role: null, strictRole: false },
  { prefix: "/community", role: null, strictRole: false },
  { prefix: "/account", role: null, strictRole: false },
  { prefix: "/dashboard", role: "TESTER", strictRole: false },
  { prefix: "/console", role: "DEVELOPER", strictRole: false },
  { prefix: "/admin", role: "ADMIN", strictRole: true },
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
      const roleHint = pathname.startsWith("/dashboard/developer/") ? "DEVELOPER" : route.role;
      if (roleHint === "DEVELOPER" || roleHint === "TESTER") signInUrl.searchParams.set("role", roleHint);
      return NextResponse.redirect(signInUrl);
    }

    if (route.strictRole && token.role !== route.role) {
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
  matcher: ["/clippers/:path*", "/quests/:path*", "/applications/:path*", "/community/:path*", "/account/:path*", "/dashboard/:path*", "/console/:path*", "/admin/:path*"],
};