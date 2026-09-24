import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

const allowedNextPaths = ["/dashboard", "/console", "/admin"];

function cleanNextPath(value: string | undefined) {
  if (!value?.startsWith("/")) return "/dashboard";
  return allowedNextPaths.some((path) => value === path || value.startsWith(`${path}?`)) ? value : "/dashboard";
}

function cleanRequestedRole(value: string | undefined) {
  if (value === UserRole.TESTER || value === UserRole.DEVELOPER) return value;
  return null;
}

function cleanText(value: string | undefined, fallback = "") {
  return (value || fallback).trim();
}

function cleanUrl(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ role?: string; next?: string; name?: string; username?: string; bio?: string; portfolioUrl?: string; companyName?: string; productUrl?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const params = await searchParams;
  const requestedRole = cleanRequestedRole(params.role);
  const nextPath = cleanNextPath(params.next);
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });

  if (user && requestedRole && user.role !== UserRole.ADMIN) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        role: requestedRole,
        name: cleanText(params.name, undefined),
        username: cleanText(params.username, "SeedEnv Member"),
        bio: cleanText(params.bio, undefined),
        portfolioUrl: cleanUrl(params.portfolioUrl),
        companyName: requestedRole === UserRole.DEVELOPER ? cleanText(params.companyName, undefined) : null,
        productUrl: requestedRole === UserRole.DEVELOPER ? cleanUrl(params.productUrl) : null,
      },
    });
  }

  if (user?.role === UserRole.ADMIN) redirect("/admin");
  redirect(nextPath);
}
