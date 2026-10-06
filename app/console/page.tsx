import { CampaignStatus, SubmissionStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { Plus } from "lucide-react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import AuthCheck from "@/components/AuthCheck";
import { BillingMetrics } from "@/components/billing/billing-metrics";
import { BillingInfoForm, PaymentMethodCard } from "@/components/billing/billing-profile";
import { InvoiceTable } from "@/components/billing/invoice-table";
import { DeveloperStudio } from "@/components/developer-studio";
import { ConsoleHeader } from "@/components/console-header";
import { ActiveCohorts, ConsoleMetricStrip } from "@/components/console-overview";
import { DeveloperBottomNav } from "@/components/navigation";
import { getBillingOverview } from "@/lib/billing-data";
import { ensurePreviewData } from "@/lib/preview-data";
import { prisma } from "@/lib/prisma";
import { isPublicHandle, publicProfilePath } from "@/lib/public-profile";
import { getProofImageUrl } from "@/lib/storage";
import { SEEDENV_PLATFORM_FEE_PERCENT } from "@/lib/pricing";

export const dynamic = "force-dynamic";

const consoleViews = ["overview", "new-drop", "review-deck", "asset-vault", "billing"] as const;
type ConsoleView = (typeof consoleViews)[number];
const reviewPageSize = 20;

export default async function ConsolePage({ searchParams }: { searchParams: Promise<{ view?: string; escrow?: string; campaign?: string; reviewPage?: string; testDraft?: string; draft?: string; stripePayment?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");
  if (session.user.role !== "DEVELOPER") redirect("/");
  const params = await searchParams;
  const activeView: ConsoleView = consoleViews.includes(params.view as ConsoleView) ? params.view as ConsoleView : "overview";

  const security = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true, role: true, username: true, email: true, avatarUrl: true, stripeCustomerId: true, companyName: true, billingProfile: { select: { companyName: true } }, _count: { select: { accounts: true } } },
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
  const overview = activeView === "overview";
  const activeCampaignScope = { ...campaignScope, status: CampaignStatus.ACTIVE };
  const [pendingReviewCount, activeCohortCount, runsInProgress, verifiedValidators] = await Promise.all([
    activeView === "review-deck" || overview ? prisma.submission.count({ where: pendingReviewWhere }) : 0,
    overview ? prisma.appCampaign.count({ where: activeCampaignScope }) : 0,
    overview ? prisma.submission.count({ where: { status: SubmissionStatus.PENDING, campaign: activeCampaignScope, proofImageUrl: null, feedbackText: null } }) : 0,
    overview ? prisma.submission.groupBy({ by: ["testerId"], where: { status: SubmissionStatus.APPROVED, campaign: campaignScope } }).then((rows) => rows.length) : 0,
  ]);
  const reviewTotalPages = Math.max(1, Math.ceil(pendingReviewCount / reviewPageSize));
  const requestedReviewPage = Number.parseInt(params.reviewPage || "1", 10);
  const reviewPage = Number.isFinite(requestedReviewPage) ? Math.min(Math.max(requestedReviewPage, 1), reviewTotalPages) : 1;
  const [pendingSubmissions, approvedAssets, campaigns, completedEscrow, auditReports, billing] = await Promise.all([
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
      where: activeCampaignScope,
      orderBy: { createdAt: "desc" },
      take: overview ? 10 : 0,
      select: { id: true, title: true, platform: true, totalBudgetUsd: true, totalSlots: true, claimedSlots: true, completedSlots: true, bountyPerTaskUsd: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { userId: session.user.id, type: TransactionType.ESCROW_DEPOSIT, status: TransactionStatus.COMPLETED },
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
    activeView === "billing" ? getBillingOverview(session.user.id, security?.stripeCustomerId || null) : null,
  ]);
  const completedEscrowCents = completedEscrow._sum.amountCents || 0;
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
  const accountUsername = security?.username || session.user.name || "account";
  const consoleAccount = {
    username: accountUsername,
    avatarUrl: security?.avatarUrl || null,
    organization: security?.companyName?.trim() || security?.billingProfile?.companyName?.trim() || null,
    roleLabel: security?.role === "ADMIN" || canSaveTestDraft ? "Admin" : "Developer",
    publicProfileHref: isPublicHandle(accountUsername) ? publicProfilePath(accountUsername) : null,
  };
  return (
    <AuthCheck role="DEVELOPER">
    <main className="mobile-app-shell min-h-screen bg-[#0A0D12] pb-16 text-white" id="console-top">
      <ConsoleHeader activeView={activeView} paymentsMode={process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test"} account={consoleAccount} />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {overview ? <>
          <ConsoleMetricStrip metrics={{ activeCohorts: activeCohortCount, runsInProgress, pendingAudits: pendingReviewCount, verifiedValidators, escrowCommittedCents: completedEscrowCents, platformFeePercent: SEEDENV_PLATFORM_FEE_PERCENT }} />
          <ActiveCohorts cohorts={campaigns} total={activeCohortCount} />
        </> : null}
        {activeView !== "overview" && activeView !== "billing" ? (
          <section className="mb-6">
            <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Developer Console</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">{activeView === "new-drop" ? "New Drop" : activeView === "review-deck" ? "Review Deck" : "Asset Vault"}</h2>
          </section>
        ) : null}
        {activeView !== "billing" ? <DeveloperStudio key={launchDraft?.id || "new-drop"} submissions={pendingPreviews} assets={approvedPreviews} auditReports={auditPreviews} reviewPage={reviewPage} reviewTotalPages={reviewTotalPages} reviewTotalCount={pendingReviewCount} canSaveTestDraft={canSaveTestDraft} initialDraft={launchDraft || undefined} view={activeView} /> : null}

        {billing ? <section className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Billing</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">Escrow, payments &amp; invoices</h2>
              <p className="mt-1 text-sm text-zinc-400">Tester escrow funded through Stripe, platform fees, and downloadable cohort receipts.</p>
            </div>
            <a className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-950 transition-all hover:bg-zinc-200" href="/console?view=new-drop">
              <Plus className="size-3.5" /> Fund New Cohort
            </a>
          </div>

          {params.escrow === "success" ? <p className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm text-emerald-200" role="status">{checkoutCampaign?.status === CampaignStatus.ACTIVE ? `Payment confirmed for ${checkoutCampaign.title}; the drop is active.` : `Checkout returned${checkoutCampaign ? ` for ${checkoutCampaign.title}` : ""}. Escrow remains pending until Stripe confirms the payment.`}</p> : null}
          {params.escrow === "cancelled" ? <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-200" role="status">Checkout was cancelled{checkoutCampaign ? ` for ${checkoutCampaign.title}` : ""}. No payment was confirmed.</p> : null}
          {testDraftCampaign ? <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-100" role="status">Test draft saved for {testDraftCampaign.title}. No payment was taken, and it is not available to testers.</p> : null}

          <BillingMetrics metrics={billing.metrics} />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <PaymentMethodCard method={billing.paymentMethod} unavailable={billing.paymentMethodUnavailable} setupResult={params.stripePayment} />
            <BillingInfoForm initial={billing.billingDetails} />
          </div>

          <InvoiceTable invoices={billing.invoices} />
        </section> : null}
      </div>
      <DeveloperBottomNav />
    </main>
    </AuthCheck>
  );
}
