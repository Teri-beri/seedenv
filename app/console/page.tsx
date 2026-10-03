import { CampaignStatus, PlatformType, SubmissionStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { ArrowRight, Circle, CreditCard, Plus } from "lucide-react";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import AuthCheck from "@/components/AuthCheck";
import { DeveloperStudio } from "@/components/developer-studio";
import { DeveloperBottomNav, DeveloperHeader } from "@/components/navigation";
import { ensurePreviewData } from "@/lib/preview-data";
import { prisma } from "@/lib/prisma";
import { getProofImageUrl } from "@/lib/storage";
import { formatCents } from "@/lib/utils";

export const dynamic = "force-dynamic";

const consoleViews = ["overview", "new-drop", "review-deck", "asset-vault", "billing"] as const;
type ConsoleView = (typeof consoleViews)[number];
const reviewPageSize = 20;

export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ view?: string; escrow?: string; campaign?: string; reviewPage?: string; testDraft?: string; draft?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");
  if (session.user.role !== "DEVELOPER") redirect("/");
  const params = await searchParams;
  const activeView: ConsoleView = consoleViews.includes(params.view as ConsoleView) ? params.view as ConsoleView : "overview";

  const security = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true, role: true, username: true, email: true, _count: { select: { accounts: true } } },
  });
  if (security && !security.passwordHash && security._count.accounts === 0) redirect("/onboarding/setup?next=/console");
  const ownerEmail = process.env.SEEDENV_ANALYTICS_OWNER_EMAIL?.trim().toLowerCase();
  const canSaveTestDraft = Boolean(
    security?.role === "DEVELOPER"
    && security.username.trim().toLowerCase() === "teriberi"
    && ownerEmail
    && security.email.trim().toLowerCase() === ownerEmail,
  );

  await ensurePreviewData();
  const campaignScope = { developerId: session.user.id };
  const pendingReviewWhere = {
    status: SubmissionStatus.PENDING,
    campaign: campaignScope,
    OR: [{ proofImageUrl: { not: null } }, { feedbackText: { not: null } }],
  };
  const pendingReviewCount = activeView === "review-deck" ? await prisma.submission.count({ where: pendingReviewWhere }) : 0;
  const reviewTotalPages = Math.max(1, Math.ceil(pendingReviewCount / reviewPageSize));
  const requestedReviewPage = Number.parseInt(params.reviewPage || "1", 10);
  const reviewPage = Number.isFinite(requestedReviewPage) ? Math.min(Math.max(requestedReviewPage, 1), reviewTotalPages) : 1;
  const [pendingSubmissions, approvedAssets, campaigns, billingTransactions, completedEscrow, pendingEscrow, auditReports] = await Promise.all([
    prisma.submission.findMany({
      where: pendingReviewWhere,
      include: { tester: true, campaign: { include: { instructions: { orderBy: { stepNumber: "asc" } } } } },
      skip: (reviewPage - 1) * reviewPageSize,
      take: reviewPageSize,
      orderBy: { createdAt: "asc" },
    }),
    prisma.submission.findMany({
      where: { status: SubmissionStatus.APPROVED, proofImageUrl: { not: null }, campaign: campaignScope },
      include: { tester: true, campaign: true },
      take: 12,
      orderBy: { reviewedAt: "desc" },
    }),
    prisma.appCampaign.findMany({
      where: { ...campaignScope, status: CampaignStatus.ACTIVE },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, title: true, platform: true, totalBudgetUsd: true, totalSlots: true, claimedSlots: true, completedSlots: true, bountyPerTaskUsd: true },
    }),
    prisma.walletTransaction.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, amountCents: true, type: true, status: true, description: true, createdAt: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { userId: session.user.id, type: TransactionType.ESCROW_DEPOSIT, status: TransactionStatus.COMPLETED },
      _sum: { amountCents: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { userId: session.user.id, type: TransactionType.ESCROW_DEPOSIT, status: TransactionStatus.PENDING },
      _sum: { amountCents: true },
    }),
    prisma.submission.findMany({
      where: {
        campaign: campaignScope,
        OR: [{ feedbackText: { not: null } }, { proofImageUrl: { not: null } }],
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        proofImageUrl: true,
        recordingUrl: true,
        feedbackText: true,
        osBuild: true,
        deviceModel: true,
        screenResolution: true,
        appBuildVersion: true,
        networkType: true,
        crashLogs: true,
        networkLogs: true,
        payoutCents: true,
        status: true,
        rejectionReason: true,
        createdAt: true,
        tester: { select: { username: true, avatarUrl: true } },
        campaign: { select: { id: true, title: true } },
      },
    }),
  ]);
  const completedEscrowCents = completedEscrow._sum.amountCents || 0;
  const pendingEscrowCents = pendingEscrow._sum.amountCents || 0;
  const checkoutCampaign = activeView === "billing" && params.campaign
    ? await prisma.appCampaign.findFirst({ where: { id: params.campaign, developerId: session.user.id }, select: { title: true, status: true } })
    : null;
  const testDraftCampaign = activeView === "billing" && params.testDraft
    ? await prisma.appCampaign.findFirst({ where: { id: params.testDraft, developerId: session.user.id, status: CampaignStatus.DRAFT }, select: { title: true } })
    : null;
  const launchDraft = activeView === "new-drop" && params.draft
    ? await prisma.appCampaign.findFirst({
        where: { id: params.draft, developerId: session.user.id, status: CampaignStatus.DRAFT },
        include: { instructions: { orderBy: { stepNumber: "asc" } } },
      })
    : null;
  const [pendingPreviews, approvedPreviews, auditPreviews] = await Promise.all([
    Promise.all(pendingSubmissions.map(async (submission) => ({ ...submission, proofImageUrl: await getProofImageUrl(submission.proofImageUrl) }))),
    Promise.all(approvedAssets.map(async (submission) => ({ ...submission, proofImageUrl: await getProofImageUrl(submission.proofImageUrl) }))),
    Promise.all(auditReports.map(async (submission) => ({ ...submission, proofImageUrl: await getProofImageUrl(submission.proofImageUrl) }))),
  ]);
  return (
    <AuthCheck role="DEVELOPER">
    <main className="mobile-app-shell terminal-grid min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(109,40,217,0.2),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(245,158,11,0.12),transparent_24%),linear-gradient(180deg,#090A0F_0%,#10131C_50%,#090A0F_100%)] pb-16 text-white" id="console-top">
      <DeveloperHeader activeView={activeView} />
      <nav aria-label="Developer community and applications" className="mx-auto flex max-w-7xl flex-wrap gap-3 px-4 pt-5">
        <Link href="/applications" className="rounded-xl border border-stroke px-4 py-3 text-sm text-amber-300">Tester applications & REP requirements</Link>
        <Link href="/community" className="rounded-xl border border-stroke px-4 py-3 text-sm text-violet-200">Launch Circle / Post app updates</Link>
        <Link href="/clippers" className="rounded-xl border border-stroke px-4 py-3 text-sm text-violet-200">Clippers / Creator collaborations</Link>
      </nav>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {activeView === "overview" ? <section className="mb-8 grid items-stretch gap-6 lg:grid-cols-[1fr_420px]">
          <div className="flex h-full flex-col justify-between gap-6">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-500">SeedEnv Console</p>
            <h1 className="max-w-xl bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-2xl font-bold leading-snug tracking-tight text-transparent md:text-3xl">
              Campaign operations without the tester HUD clutter.
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-neutral-400">
              Launch seed missions, fund escrow, review proof, and export validated assets from one dedicated developer workspace.
            </p>
          </div>
          <div className="luxury-panel rounded-2xl p-5 transition-all hover:border-violet-500/30">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Active Deployments</p>
              {campaigns.length ? <span className="rounded-full border border-emerald-500/25 bg-emerald-950/30 px-2.5 py-1 text-xs font-semibold text-emerald-300">Live</span> : null}
            </div>
            {campaigns.length ? (
              <div className="mt-4 space-y-3">
                {campaigns.map((campaign) => {
                  const filledPercent = Math.min(100, Math.round((campaign.claimedSlots / campaign.totalSlots) * 100));
                  const releasedUsd = Math.min(campaign.totalBudgetUsd, campaign.completedSlots * campaign.bountyPerTaskUsd);
                  const lockedUsd = Math.max(0, campaign.totalBudgetUsd - releasedUsd);
                  const platformLabel = campaign.platform === PlatformType.TESTFLIGHT ? "TestFlight" : campaign.platform === PlatformType.WEB_STAGING ? "Web" : "Play Store";
                  return (
                    <Link className="block rounded-xl border border-[#1F2430] bg-[#0E1017]/80 p-4 transition hover:border-amber-500/35 hover:bg-[#11141c]" href="/console?view=review-deck" key={campaign.id}>
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="min-w-0 truncate font-semibold text-white">{campaign.title}</h2>
                        <span className="shrink-0 rounded-full border border-white/10 px-2 py-1 text-[10px] font-semibold text-neutral-300">{platformLabel}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-950/35 px-2.5 py-1 text-xs font-semibold text-emerald-300"><Circle className="size-2 fill-current" /> {campaign.claimedSlots} / {campaign.totalSlots} slots filled</span>
                        <span className="text-xs text-neutral-500">{filledPercent}%</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${filledPercent}%` }} /></div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <p className="text-neutral-500">Escrow locked <span className="ml-1 font-mono text-neutral-200">${lockedUsd.toFixed(2)}</span></p>
                        <p className="text-neutral-500">Released <span className="ml-1 font-mono text-emerald-300">${releasedUsd.toFixed(2)}</span></p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 flex min-h-64 flex-col items-start justify-center rounded-xl border border-dashed border-[#3A3F4C] bg-[#090A0F]/45 p-5">
                <p className="text-lg font-bold text-white">No Active Runs</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-neutral-400">Deploy a seed mission to recruit vetted beta testers and stream live telemetry.</p>
                <Link className="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-neutral-950 transition hover:bg-amber-400" href="/console?view=new-drop"><Plus className="size-4" /> Launch Drop</Link>
              </div>
            )}
          </div>
        </section> : null}
        {activeView !== "overview" && activeView !== "billing" ? (
          <section className="mb-6">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-500">SeedEnv Console</p>
            <h2 className="mt-2 text-3xl font-black text-white">{activeView === "new-drop" ? "New Drop" : activeView === "review-deck" ? "Review Deck" : "Asset Vault"}</h2>
          </section>
        ) : null}
        {activeView !== "billing" ? <DeveloperStudio key={launchDraft?.id || "new-drop"} submissions={pendingPreviews} assets={approvedPreviews} auditReports={auditPreviews} reviewPage={reviewPage} reviewTotalPages={reviewTotalPages} reviewTotalCount={pendingReviewCount} canSaveTestDraft={canSaveTestDraft} initialDraft={launchDraft || undefined} view={activeView} /> : null}

        {activeView === "billing" ? <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Billing</p>
              <h2 className="mt-2 text-3xl font-black text-white">Escrow &amp; payment history</h2>
              <p className="mt-2 text-sm text-neutral-400">Review Stripe-funded tester escrow and recent billing activity.</p>
            </div>
            <a className="inline-flex items-center gap-2 rounded-xl border border-[#1F2430] bg-[#0E1017]/80 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-amber-500/40" href="/console?view=new-drop">
              Create a funded drop <ArrowRight className="size-4" />
            </a>
          </div>

          {params.escrow === "success" ? <p className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm text-emerald-200" role="status">{checkoutCampaign?.status === CampaignStatus.ACTIVE ? `Payment confirmed for ${checkoutCampaign.title}; the drop is active.` : `Checkout returned${checkoutCampaign ? ` for ${checkoutCampaign.title}` : ""}. Escrow remains pending until Stripe confirms the payment.`}</p> : null}
          {params.escrow === "cancelled" ? <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-200" role="status">Checkout was cancelled{checkoutCampaign ? ` for ${checkoutCampaign.title}` : ""}. No payment was confirmed.</p> : null}
          {testDraftCampaign ? <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100" role="status">Test draft saved for {testDraftCampaign.title}. No payment was taken, and it is not available to testers.</p> : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <BillingMetric label="Completed escrow" value={formatCents(completedEscrowCents)} />
            <BillingMetric label="Awaiting payment" value={formatCents(pendingEscrowCents)} />
            <BillingMetric label="Recent transactions" value={billingTransactions.length.toLocaleString()} />
          </div>

          <section className="overflow-hidden rounded-2xl border border-[#1F2430] bg-[#0E1017]/80">
            <div className="flex items-center gap-2 border-b border-[#1F2430] px-5 py-4">
              <CreditCard className="size-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-white">Transaction history</h3>
            </div>
            {billingTransactions.length ? (
              <div className="divide-y divide-[#1F2430]">
                {billingTransactions.map((transaction) => (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" key={transaction.id}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{transaction.description}</p>
                      <p className="mt-1 text-xs text-neutral-500">{transaction.createdAt.toLocaleDateString()} · {transaction.type.replaceAll("_", " ")}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${transaction.status === TransactionStatus.COMPLETED ? "bg-emerald-950/50 text-emerald-300" : transaction.status === TransactionStatus.FAILED ? "bg-red-950/50 text-red-300" : "bg-amber-950/50 text-amber-300"}`}>{transaction.status.toLowerCase()}</span>
                      <span className="font-mono text-sm font-bold text-white">{formatCents(transaction.amountCents)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="p-6 text-sm text-neutral-400">No billing activity yet. Create a drop to configure tester slots and fund its escrow through Stripe Checkout.</p>
            )}
          </section>
        </section> : null}
      </div>
      <DeveloperBottomNav />
    </main>
    </AuthCheck>
  );
}

function BillingMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#1F2430] bg-[#0E1017]/80 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <p className="mt-2 font-mono text-xl font-bold text-white">{value}</p>
    </div>
  );
}
