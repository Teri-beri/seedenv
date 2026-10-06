import { NextResponse } from "next/server";
import { ANALYTICS_OPT_OUT_COOKIE } from "@/lib/analytics-context";

export async function POST() {
  const response = NextResponse.json({ excluded: true });
  response.cookies.set(ANALYTICS_OPT_OUT_COOKIE, "1", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 * 2 });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ excluded: false });
  response.cookies.delete(ANALYTICS_OPT_OUT_COOKIE);
  return response;
}
