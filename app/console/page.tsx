import { SubmissionStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { ArrowRight, CreditCard } from "lucide-react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import AuthCheck from "@/components/AuthCheck";
import { DeveloperStudio } from "@/components/developer-studio";
import { DeveloperHeader } from "@/components/navigation";
import { AnalyticsSummary, type AnalyticsSummaryData } from "@/components/analytics-summary";
import { ensurePreviewData } from "@/lib/preview-data";
import { prisma } from "@/lib/prisma";
import { getProofImageUrl } from "@/lib/storage";
import { formatCents } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ escrow?: string; campaign?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");
  if (session.user.role !== "DEVELOPER") redirect("/");
  const params = await searchParams;

  const security = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true, _count: { select: { accounts: true } } },
  });
  if (security && !security.passwordHash && security._count.accounts === 0) redirect("/onboarding/setup?next=/console");

  await ensurePreviewData();
  const campaignScope = { developerId: session.user.id };
  const analyticsOwnerEmail = process.env.SEEDENV_ANALYTICS_OWNER_EMAIL?.trim().toLowerCase();
  const canViewAnalytics = Boolean(analyticsOwnerEmail && session.user.email?.toLowerCase() === analyticsOwnerEmail);
  const [pendingSubmissions, approvedAssets, campaigns, billingTransactions] = await Promise.all([
    prisma.submission.findMany({
      where: { status: SubmissionStatus.PENDING, proofImageUrl: { not: null }, campaign: campaignScope },
      include: { tester: true, campaign: { include: { instructions: { orderBy: { stepNumber: "asc" } } } } },
      take: 5,
      orderBy: { createdAt: "asc" },
    }),
    prisma.submission.findMany({
      where: { status: SubmissionStatus.APPROVED, campaign: campaignScope },
      include: { tester: true, campaign: true },
      take: 12,
      orderBy: { reviewedAt: "desc" },
    }),
    prisma.appCampaign.findMany({
      where: campaignScope,
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, title: true, totalSlots: true, claimedSlots: true, completedSlots: true, bountyPerTaskUsd: true },
    }),
    prisma.walletTransaction.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, amountCents: true, type: true, status: true, description: true, createdAt: true },
    }),
  ]);
  const completedEscrowCents = billingTransactions
    .filter((transaction) => transaction.type === TransactionType.ESCROW_DEPOSIT && transaction.status === TransactionStatus.COMPLETED)
    .reduce((total, transaction) => total + transaction.amountCents, 0);
  const pendingEscrowCents = billingTransactions
    .filter((transaction) => transaction.type === TransactionType.ESCROW_DEPOSIT && transaction.status === TransactionStatus.PENDING)
    .reduce((total, transaction) => total + transaction.amountCents, 0);
  const [pendingPreviews, approvedPreviews] = await Promise.all([
    Promise.all(pendingSubmissions.map(async (submission) => ({ ...submission, proofImageUrl: await getProofImageUrl(submission.proofImageUrl) }))),
    Promise.all(approvedAssets.map(async (submission) => ({ ...submission, proofImageUrl: await getProofImageUrl(submission.proofImageUrl) }))),
  ]);
  let analytics: AnalyticsSummaryData | null = null;
  if (canViewAnalytics) {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const [pageViews, ctaClicks, signupStarts, uniqueSessions, referrerRows] = await Promise.all([
      prisma.analyticsEvent.count({ where: { eventName: "page_view", createdAt: { gte: since } } }),
      prisma.analyticsEvent.count({ where: { eventName: "cta_click", createdAt: { gte: since } } }),
      prisma.analyticsEvent.count({ where: { eventName: "signup_start", createdAt: { gte: since } } }),
      prisma.analyticsEvent.findMany({ where: { createdAt: { gte: since }, sessionKey: { not: null } }, distinct: ["sessionKey"], select: { sessionKey: true } }),
      prisma.analyticsEvent.findMany({ where: { createdAt: { gte: since }, referrer: { not: null } }, select: { referrer: true } }),
    ]);
    const referrerCounts = new Map<string, number>();
    referrerRows.forEach((row) => { if (row.referrer) referrerCounts.set(row.referrer, (referrerCounts.get(row.referrer) || 0) + 1); });
    analytics = { pageViews, ctaClicks, signupStarts, uniqueSessions: uniqueSessions.length, topReferrers: [...referrerCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([referrer, count]) => ({ referrer, count })) };
  }

  return (
    <AuthCheck role="DEVELOPER">
    <main className="terminal-grid min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(109,40,217,0.2),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(245,158,11,0.12),transparent_24%),linear-gradient(180deg,#090A0F_0%,#10131C_50%,#090A0F_100%)] pb-16 text-white" id="console-top">
      <DeveloperHeader />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="mb-8 grid gap-6 lg:grid-cols-[1fr_420px]">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-500">SeedEnv Console</p>
            <h1 className="mt-3 max-w-4xl bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-5xl font-black leading-[0.98] tracking-tight text-transparent sm:text-6xl">
              Campaign operations without the tester HUD clutter.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-400">
              Launch seed missions, fund escrow, review proof, and export validated assets from one dedicated developer workspace.
            </p>
          </div>
          <div className="luxury-panel rounded-2xl p-5 transition-all hover:border-violet-500/30">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Active Deployments</p>
            <div className="mt-4 space-y-3">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-4 backdrop-blur-md transition-all hover:border-violet-500/30">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold text-white">{campaign.title}</h2>
                    <span className="font-mono text-sm text-amber-500">${campaign.bountyPerTaskUsd.toFixed(2)}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-700 to-amber-500" style={{ width: `${(campaign.claimedSlots / campaign.totalSlots) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">{campaign.completedSlots} complete / {campaign.claimedSlots} claimed / {campaign.totalSlots} total</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        {analytics ? <AnalyticsSummary data={analytics} /> : null}
        <div className="mt-8" />
        <DeveloperStudio submissions={pendingPreviews} assets={approvedPreviews} />

        <section className="mt-12 scroll-mt-28 space-y-5" id="billing">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Billing</p>
              <h2 className="mt-2 text-3xl font-black text-white">Escrow &amp; payment history</h2>
              <p className="mt-2 text-sm text-neutral-400">Review Stripe-funded tester escrow and recent billing activity.</p>
            </div>
            <a className="inline-flex items-center gap-2 rounded-xl border border-[#1F2430] bg-[#0E1017]/80 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-amber-500/40" href="/console#campaign-builder">
              Create a funded drop <ArrowRight className="size-4" />
            </a>
          </div>

          {params.escrow === "success" ? <p className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm text-emerald-200" role="status">Stripe checkout completed. Escrow status will update after payment confirmation.</p> : null}
          {params.escrow === "cancelled" ? <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-200" role="status">Checkout was cancelled. Your campaign remains in billing history with its current payment status.</p> : null}

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
        </section>
      </div>
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
