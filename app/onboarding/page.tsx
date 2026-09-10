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

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ role?: string; next?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const params = await searchParams;
  const requestedRole = cleanRequestedRole(params.role);
  const nextPath = cleanNextPath(params.next);
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });

  if (user && requestedRole && user.role !== UserRole.ADMIN && user.role !== requestedRole) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { role: requestedRole },
    });
  }

  if (user?.role === UserRole.ADMIN) redirect("/admin");
  redirect(nextPath);
}
