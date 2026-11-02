import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import AuthCheck from "@/components/AuthCheck";
import { ConsoleHeader } from "@/components/console-header";
import { TelemetryMonitor } from "@/components/console/TelemetryMonitor";
import { DeveloperBottomNav } from "@/components/navigation";
import { authOptions } from "@/lib/auth-options";
import { parseMissionDeviceProfile } from "@/lib/mission-device-profile";
import { prisma } from "@/lib/prisma";
import { isPublicHandle, publicProfilePath } from "@/lib/public-profile";

export const dynamic = "force-dynamic";

export default async function TelemetryMonitorPage({ searchParams }: { searchParams: Promise<{ cohort?: string; incident?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/console/monitor");
  if (session.user.role !== "DEVELOPER" && session.user.role !== "ADMIN") redirect("/");
  const params = await searchParams;
  const developer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      passwordHash: true,
      username: true,
      avatarUrl: true,
      role: true,
      companyName: true,
      billingProfile: { select: { companyName: true } },
      _count: { select: { accounts: true } },
    },
  });
  if (!developer) redirect("/auth/signin?callbackUrl=/console/monitor");
  if (!developer.passwordHash && developer._count.accounts === 0) redirect("/onboarding/setup?next=/console/monitor");

  const cohorts = await prisma.appCampaign.findMany({
    where: { developerId: session.user.id, status: { in: ["ACTIVE", "PAUSED"] }, cancelledAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true },
  });
  const selectedCohort = cohorts.find((cohort) => cohort.id === params.cohort) || cohorts[0] || null;
  const [incidents, mobileSessions] = selectedCohort ? await Promise.all([
    prisma.telemetryIncident.findMany({
      where: { cohortId: selectedCohort.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        severity: true,
        statusCode: true,
        endpoint: true,
        deviceModel: true,
        osVersion: true,
        message: true,
        createdAt: true,
        githubIssueUrl: true,
        validator: { select: { username: true } },
      },
    }),
    prisma.missionPairSession.findMany({
      where: {
        submission: { campaignId: selectedCohort.id },
        connectedAt: { not: null },
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        activeStep: true,
        completedSteps: true,
        deviceProfile: true,
        confirmedDeviceModel: true,
        connectedAt: true,
        recordingConfirmedAt: true,
        lastSeenAt: true,
        updatedAt: true,
        tester: { select: { username: true } },
        submission: { select: { campaign: { select: { _count: { select: { instructions: true } } } } } },
      },
    }),
  ]) : [[], []];
  const accountUsername = developer.username || session.user.name || "account";
  const account = {
    username: accountUsername,
    avatarUrl: developer.avatarUrl,
    organization: developer.companyName?.trim() || developer.billingProfile?.companyName?.trim() || null,
    roleLabel: developer.role === "ADMIN" ? "Admin" : "Developer",
    publicProfileHref: isPublicHandle(accountUsername) ? publicProfilePath(accountUsername) : null,
  };

  return (
    <AuthCheck role={session.user.role}>
      <main className="mobile-app-shell min-h-screen bg-[#0A0D12] pb-20 text-white">
        <ConsoleHeader activeView="monitor" paymentsMode={process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test"} account={account} />
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <TelemetryMonitor
            cohorts={cohorts}
            activeCohort={selectedCohort}
            highlightedIncidentId={params.incident}
            incidents={incidents.map((incident) => ({ ...incident, createdAt: incident.createdAt.toISOString(), validatorHandle: incident.validator?.username || null }))}
            mobileSessions={mobileSessions.map((mobileSession) => ({
              id: mobileSession.id,
              activeStep: mobileSession.activeStep,
              completedSteps: mobileSession.completedSteps.length,
              totalSteps: mobileSession.submission.campaign._count.instructions,
              deviceProfile: parseMissionDeviceProfile(mobileSession.deviceProfile),
              confirmedDeviceModel: mobileSession.confirmedDeviceModel,
              connectedAt: mobileSession.connectedAt?.toISOString() || null,
              recordingConfirmedAt: mobileSession.recordingConfirmedAt?.toISOString() || null,
              lastSeenAt: mobileSession.lastSeenAt?.toISOString() || mobileSession.updatedAt.toISOString(),
              validatorHandle: mobileSession.tester.username,
            }))}
          />
        </div>
        <DeveloperBottomNav />
      </main>
    </AuthCheck>
  );
}
