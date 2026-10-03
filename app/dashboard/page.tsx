import { CampaignStatus, SubmissionStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import AuthCheck from "@/components/AuthCheck";
import { TesterConsole } from "@/components/tester-console";
import { getCurrentUser } from "@/lib/auth";
import { ensurePreviewData } from "@/lib/preview-data";
import { prisma } from "@/lib/prisma";
import { awardDailyCheckIn } from "@/lib/quest-ledger";
import { resolveTesterView } from "@/lib/tester-console";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ view?: string; claim?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");
  if (session.user.role !== "TESTER") redirect(session.user.role === "DEVELOPER" ? "/console" : "/admin");
  const params = await searchParams;
  const activeView = resolveTesterView(params.view, params.claim);

  const security = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true, _count: { select: { accounts: true } } },
  });
  if (security && !security.passwordHash && security._count.accounts === 0) redirect("/onboarding/setup?next=/dashboard");

  await ensurePreviewData();
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
      select: { id: true, status: true, feedbackText: true, proofImageUrl: true, rejectionReason: true, revisionRequestedAt: true, payoutCents: true, expiresAt: true, campaign: { select: { title: true } } },
    }),
    prisma.submission.findMany({
      where: { testerId: session.user.id, status: SubmissionStatus.PENDING },
      orderBy: { claimedAt: "desc" },
      include: { campaign: { include: { instructions: { orderBy: { stepNumber: "asc" } } } } },
    }),
    prisma.submission.findMany({
      where: { testerId: session.user.id, status: SubmissionStatus.APPROVED },
      select: { campaignId: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { userId: session.user.id, type: TransactionType.BOUNTY_PAYOUT, status: TransactionStatus.PENDING },
      _sum: { amountCents: true },
    }),
    prisma.missionApplication.findMany({ where: { testerId: session.user.id }, select: { campaignId: true, status: true, startBy: true } }),
  ]);

  const pendingWithPreviews = pending.map((item) => ({ ...item, proofPreviewUrl: item.revisionRequestedAt && item.proofImageUrl ? `/api/submissions/${item.id}/proof` : null }));
  return (
    <AuthCheck role="TESTER">
      <TesterConsole activeView={activeView} tester={tester} missions={missions} leaderboard={leaderboard} summary={summary} recent={recent} pending={pendingWithPreviews} approvedCampaigns={approvedCampaigns} pendingPayoutCents={payouts._sum.amountCents || 0} now={now} applications={applications.map((item) => ({ ...item, startBy: item.startBy?.toISOString() || null }))} questXp={tester.questXp} discoveryPasses={tester.discoveryPasses} />
    </AuthCheck>
  );
}
