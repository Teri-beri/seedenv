import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { saveMemberReferral } from "@/lib/quest-ledger";
import { requireMember } from "@/lib/member";
import { ensureValidatorHandle } from "@/lib/validator-handle";
import { billingTransaction } from "@/lib/billing-transaction";
import { attachDeveloperReferral, DeveloperReferralError } from "@/lib/developer-referrals";

const allowedNextPaths = ["/dashboard", "/console", "/admin", "/account", "/validators/join"];

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

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ role?: string; next?: string; name?: string; username?: string; bio?: string; portfolioUrl?: string; companyName?: string; productUrl?: string; ref?: string; devref?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const params = await searchParams;
  const requestedRole = cleanRequestedRole(params.role);
  let nextPath = cleanNextPath(params.next);
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, testerWorkspaceEnabled: true, developerWorkspaceEnabled: true, passwordHash: true, _count: { select: { accounts: true } } },
  });

  if (user && requestedRole && user.role !== UserRole.ADMIN) {
    const hasRequestedWorkspace = requestedRole === UserRole.TESTER
      ? user.testerWorkspaceEnabled
      : user.developerWorkspaceEnabled;

    if (hasRequestedWorkspace) {
      if (user.role !== requestedRole) {
        await prisma.user.update({ where: { id: session.user.id }, data: { role: requestedRole } });
      }
    } else {
      const hasWorkspace = user.testerWorkspaceEnabled || user.developerWorkspaceEnabled;
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          role: requestedRole,
          testerWorkspaceEnabled: requestedRole === UserRole.TESTER || user.testerWorkspaceEnabled,
          developerWorkspaceEnabled: requestedRole === UserRole.DEVELOPER || user.developerWorkspaceEnabled,
          name: hasWorkspace ? undefined : cleanText(params.name, undefined),
          username: hasWorkspace ? undefined : cleanText(params.username, "SeedEnv Member"),
          bio: hasWorkspace ? undefined : cleanText(params.bio, undefined),
          portfolioUrl: hasWorkspace ? undefined : cleanUrl(params.portfolioUrl),
          companyName: !hasWorkspace && requestedRole === UserRole.DEVELOPER ? cleanText(params.companyName, undefined) : undefined,
          productUrl: !hasWorkspace && requestedRole === UserRole.DEVELOPER ? cleanUrl(params.productUrl) : undefined,
        },
      });
    }
  }

  if (user?.role === UserRole.ADMIN) redirect("/admin");
  if (params.ref) {
    const received = await prisma.referral.findUnique({ where: { friendId: session.user.id } });
    if (!received) {
      try { await saveMemberReferral(await requireMember(), params.ref); }
      catch (error) {
        console.error("SeedEnv signup referral could not be applied:", error);
        nextPath = "/account?referralError=1";
      }
    }
  }
  const finalRole = requestedRole ?? user?.role;
  if (finalRole === UserRole.DEVELOPER && params.devref) {
    const developerReferralCode = params.devref;
    try {
      await billingTransaction(async (tx) => {
        const existing = await tx.developerReferral.findUnique({ where: { developerId: session.user.id }, include: { inviter: { select: { developerReferralCode: true } } } });
        if (existing?.inviter.developerReferralCode === developerReferralCode.trim().toUpperCase()) return;
        await attachDeveloperReferral(tx, session.user.id, developerReferralCode);
      });
    } catch (error) {
      console.error("SeedEnv signup developer referral could not be applied:", error);
      const message = error instanceof DeveloperReferralError ? error.message : "Could not attach your developer referral. Retry from account settings.";
      nextPath = `/account?tab=profile&devref=${encodeURIComponent(params.devref)}&developerReferralError=${encodeURIComponent(message)}`;
    }
  }
  if (finalRole === UserRole.TESTER) {
    await ensureValidatorHandle(session.user.id);
    redirect(nextPath);
  }
  if (user && !user.passwordHash && user._count.accounts === 0) {
    redirect(`/onboarding/setup?next=${encodeURIComponent(nextPath)}`);
  }
  redirect(nextPath);
}
