import { after } from "next/server";
import { assignedCampaign } from "@/lib/instruction-versions";
import { sweepOverdueSubmissionsLazily } from "@/lib/submission-approval";
import { CampaignStatus, SubmissionStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import AuthCheck from "@/components/AuthCheck";
import { TesterConsole } from "@/components/tester-console";
import { getCurrentUser } from "@/lib/auth";
import { ensurePreviewData } from "@/lib/preview-data";
import { prisma } from "@/lib/prisma";
import { awardDailyCheckIn } from "@/lib/quest-ledger";
import { resolveTesterView } from "@/lib/tester-console";
import { ensureValidatorHandle } from "@/lib/validator-handle";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ view?: string; claim?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");
  if (session.user.role !== "TESTER") redirect(session.user.role === "DEVELOPER" ? "/console" : "/admin");
  const params = await searchParams;
  const activeView = resolveTesterView(params.view, params.claim);

  await ensureValidatorHandle(session.user.id);

  await ensurePreviewData();
  after(sweepOverdueSubmissionsLazily);
  await awardDailyCheckIn(session.user.id);
  const now = new Date();
  const [tester, missions, leaderboard, summary, recent, pending, approvedCampaigns, payouts, applications] = await Promise.all([
    getCurrentUser("TESTER"),
    prisma.appCampaign.findMany({
      where: { status: CampaignStatus.ACTIVE, expiresAt: { gt: now } },
      include: { instructions: { orderBy: { stepNumber: "asc" } } },
      orderBy: [{ bountyPerTaskUsd: "desc" }, { createdAt: "desc" }],
    }),
    prisma.user.findMany({
      where: { testerWorkspaceEnabled: true, xpPoints: { gt: 0 } },
      orderBy: [{ xpPoints: "desc" }, { createdAt: "asc" }],
      take: 5,
      select: { id: true, username: true, xpPoints: true },
    }),
    prisma.submission.groupBy({
      by: ["status"],
      where: { testerId: session.user.id },
      _count: { _all: true },
      _sum: { payoutCents: true },
    }),
    prisma.submission.findMany({
      where: { testerId: session.user.id },
      orderBy: { claimedAt: "desc" },
      take: 6,
      select: { id: true, status: true, feedbackText: true, proofImageUrl: true, rejectionReason: true, denialReviewPending: true, revisionRequestedAt: true, payoutCents: true, expiresAt: true, campaign: { select: { title: true } } },
    }),
    prisma.submission.findMany({
      where: { testerId: session.user.id, status: SubmissionStatus.PENDING },
      orderBy: { claimedAt: "desc" },
      include: { instructionVersion: true, campaign: { include: { instructions: { orderBy: { stepNumber: "asc" } } } } },
    }),
    prisma.submission.findMany({
      where: { testerId: session.user.id, status: SubmissionStatus.APPROVED },
      select: { campaignId: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { userId: session.user.id, type: TransactionType.BOUNTY_PAYOUT, status: TransactionStatus.PENDING },
      _sum: { amountCents: true },
    }),
    prisma.missionApplication.findMany({ where: { testerId: session.user.id }, select: { campaignId: true, status: true, startBy: true, instructionVersion: true } }),
  ]);

  const pendingWithPreviews = pending.map((item) => ({ ...item, campaign: assignedCampaign(item.campaign, item.instructionVersion), proofPreviewUrl: item.revisionRequestedAt && item.proofImageUrl ? `/api/submissions/${item.id}/proof` : null }));
  const testerMissions = missions.map((mission) => {
    const application = applications.find((item) => item.campaignId === mission.id && ["ACCEPTED", "STARTED"].includes(item.status));
    return { ...(application ? assignedCampaign(mission, application.instructionVersion) : mission), ownedByTester: mission.developerId === session.user.id };
  });
  return (
    <AuthCheck role="TESTER">
      <TesterConsole activeView={activeView} tester={tester} missions={testerMissions} leaderboard={leaderboard} summary={summary} recent={recent} pending={pendingWithPreviews} approvedCampaigns={approvedCampaigns} pendingPayoutCents={payouts._sum.amountCents || 0} now={now} applications={applications.map((item) => ({ campaignId: item.campaignId, status: item.status, startBy: item.startBy?.toISOString() || null }))} questXp={tester.questXp} discoveryPasses={tester.discoveryPasses} />
    </AuthCheck>
  );
}
