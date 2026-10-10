import { SubmissionStatus, TransactionStatus, TransactionType, UserRole } from "@prisma/client";
import { ArrowLeft, ArrowRight, BriefcaseBusiness, CheckCircle2, ShieldCheck, Sprout, Trophy, WalletCards } from "lucide-react";
import { getServerSession } from "next-auth";
import Image from "next/image";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { NotificationPreferences } from "@/app/actions/accountActions";
import { authOptions } from "@/lib/auth-options";
import AuthCheck from "@/components/AuthCheck";
import { AnalyticsSummary, type AnalyticsExclusionState, type AnalyticsSummaryData } from "@/components/analytics-summary";
import { AccountSettingsForm } from "@/components/account-settings-form";
import { DeveloperReferralSettings } from "@/components/developer-referral-settings";
import { AccountSignOutButton } from "@/components/account-signout-button";
import { NotificationSettingsForm } from "@/components/notification-settings-form";
import { GitHubTokenForm } from "@/components/github-token-form";
import { PasswordSettingsForm } from "@/components/password-settings-form";
import { StripeSettingsCard } from "@/components/stripe-settings-card";
import { WorkspaceAccessSwitcher } from "@/components/workspace-access-switcher";
import { DeveloperBottomNav, TesterBottomNav } from "@/components/navigation";
import { getAnalyticsSummary, parseAnalyticsRange } from "@/lib/analytics";
import { ANALYTICS_OPT_OUT_COOKIE, clientIp, excludedIps } from "@/lib/analytics-context";
import { prisma } from "@/lib/prisma";
import { isPublicHandle, publicProfilePath } from "@/lib/public-profile";
import { rankProgress } from "@/lib/rank";
import { getStripe } from "@/lib/stripe";
import { formatCents } from "@/lib/utils";

export const dynamic = "force-dynamic";

const accountTabs = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "notifications", label: "Notifications" },
  { id: "portfolio", label: "Portfolio / Billing" },
] as const;

type AccountTab = (typeof accountTabs)[number]["id"];
type VisibleAccountTab = AccountTab | "site-performance";

function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  const saved = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    email_tester_feedback: typeof saved.email_tester_feedback === "boolean" ? saved.email_tester_feedback : true,
    email_ledger_updates: typeof saved.email_ledger_updates === "boolean" ? saved.email_ledger_updates : true,
    email_announcements: typeof saved.email_announcements === "boolean" ? saved.email_announcements : false,
  };
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string; draft?: string; stripePayment?: string; stripeConnect?: string; referralError?: string; range?: string; devref?: string; developerReferralError?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/account");
  const params = await searchParams;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      submissions: {
        include: { campaign: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
      campaigns: {
        orderBy: { createdAt: "desc" },
        take: 8,
      },
      transactions: {
        select: { id: true, amountCents: true, type: true, status: true, description: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
      accounts: { select: { provider: true } },
      developerReferralReceived: true,
      developerReferralsSent: { where: { qualifiedAt: { not: null } }, select: { id: true } },
      ownedPromoCodes: { orderBy: { createdAt: "asc" }, include: { redemptions: { select: { consumedAt: true } } } },
    },
  });
  if (!user) redirect("/auth/signin?callbackUrl=/account");

  const approvedSubmissions = user.submissions.filter((submission) => submission.status === SubmissionStatus.APPROVED);
  const pendingSubmissions = user.submissions.filter((submission) => submission.status === SubmissionStatus.PENDING);
  const earnedCents = approvedSubmissions.reduce((sum, submission) => sum + submission.payoutCents, 0);
  const rank = rankProgress(user.rankTier, user.xpPoints);
  const preferences = normalizeNotificationPreferences(user.notificationPreferences);
  const analyticsOwnerEmail = process.env.SEEDENV_ANALYTICS_OWNER_EMAIL?.trim().toLowerCase();
  const canViewSitePerformance = Boolean(
    analyticsOwnerEmail
    && user.email.trim().toLowerCase() === analyticsOwnerEmail
    && user.username.trim().toLowerCase() === "teriberi",
  );
  const visibleTabs = canViewSitePerformance
    ? [...accountTabs, { id: "site-performance" as const, label: "Site Performance" }]
    : accountTabs;
  const activeTab: VisibleAccountTab = visibleTabs.some((tab) => tab.id === params.tab)
    ? params.tab as VisibleAccountTab
    : "profile";

  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
  let paymentMethodSaved = false;
  let connectDetailsSubmitted = false;
  let payoutsEnabled = false;
  let connectCountry: string | null = null;
  let pendingPayoutCount = 0;
  let pendingPayoutAmountCents = 0;
  if (activeTab === "portfolio" && user.role === UserRole.TESTER) {
    const pendingPayouts = await prisma.walletTransaction.aggregate({
      where: { userId: user.id, type: TransactionType.BOUNTY_PAYOUT, status: TransactionStatus.PENDING },
      _count: { _all: true },
      _sum: { amountCents: true },
    });
    pendingPayoutCount = pendingPayouts._count._all;
    pendingPayoutAmountCents = pendingPayouts._sum.amountCents || 0;
  }
  if (stripeConfigured && activeTab === "portfolio") {
    const stripe = getStripe();
    const [customer, connectAccount] = await Promise.all([
      user.stripeCustomerId ? stripe.customers.retrieve(user.stripeCustomerId).catch(() => null) : Promise.resolve(null),
      user.stripeConnectAccountId ? stripe.accounts.retrieve(user.stripeConnectAccountId).catch(() => null) : Promise.resolve(null),
    ]);
    if (customer && !customer.deleted) paymentMethodSaved = Boolean(customer.invoice_settings.default_payment_method);
    if (connectAccount) {
      connectDetailsSubmitted = connectAccount.details_submitted;
      payoutsEnabled = connectAccount.payouts_enabled;
      connectCountry = connectAccount.country || null;
    }
  }
  const stripeDraft = user.role === UserRole.DEVELOPER && params.draft
    ? await prisma.appCampaign.findFirst({ where: { id: params.draft, developerId: user.id, status: "DRAFT" }, select: { id: true } })
    : null;

  let sitePerformance: AnalyticsSummaryData | null = null;
  let analyticsExclusion: AnalyticsExclusionState | null = null;
  if (canViewSitePerformance && activeTab === "site-performance") {
    const [summary, cookieStore, headerStore] = await Promise.all([getAnalyticsSummary(parseAnalyticsRange(params.range)), cookies(), headers()]);
    const ip = clientIp(headerStore);
    sitePerformance = summary;
    analyticsExclusion = {
      browserExcluded: cookieStore.get(ANALYTICS_OPT_OUT_COOKIE)?.value === "1",
      ip,
      ipExcluded: Boolean(ip && excludedIps().has(ip)),
    };
  }

  return (
    <AuthCheck>
      <main id="main-content" className="mobile-app-shell mobile-settings terminal-grid min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(109,40,217,0.2),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(245,158,11,0.12),transparent_24%),linear-gradient(180deg,#090A0F_0%,#10131C_50%,#090A0F_100%)] px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="mobile-settings-header flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <Link className="inline-flex items-center gap-2 rounded-xl border border-[#1F2430] bg-[#0E1017]/80 px-3 py-2 text-sm font-semibold text-neutral-300 transition-all hover:border-amber-500/40 hover:text-white" href={user.role === UserRole.DEVELOPER ? "/console" : user.role === UserRole.ADMIN ? "/admin" : "/dashboard"}>
                <ArrowLeft className="size-4" /> Back
              </Link>
              <Link className="mobile-settings-brand flex items-center gap-3" href="/">
                <span className="relative size-12 overflow-hidden rounded-2xl border border-[#1F2430] bg-[#0E1017]/80">
                  <Image src="/seedenv-logo-v3.png" alt="SeedEnv" fill sizes="48px" className="object-contain" priority />
                </span>
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-[0.32em] text-amber-500">SeedEnv</span>
                  <span className="block text-lg font-semibold text-neutral-100">Account</span>
                </span>
              </Link>
            </div>
            <AccountSignOutButton />
          </header>

          <nav aria-label="Account settings" className="mobile-settings-tabs mt-8 flex max-w-full gap-2 overflow-x-auto border-b border-[#1F2430] pb-2">
            {visibleTabs.map((tab) => (
              <Link
                aria-current={activeTab === tab.id ? "page" : undefined}
                className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${activeTab === tab.id ? "border border-amber-500/30 bg-amber-500/10 text-amber-300" : "border border-transparent text-neutral-400 hover:border-[#2A2F3D] hover:text-white"}`}
                href={`/account?tab=${tab.id}`}
                key={tab.id}
              >
                {tab.label}
              </Link>
            ))}
          </nav>

          <section className="mt-6">
            {params.referralError === "1" ? <p role="alert" className="mb-5 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200">Your sign-in succeeded, but the referral code could not be applied. Open Quest Center in your Tester workspace to enter a valid code. Referrals must be entered within seven days of joining and before your first approved task.</p> : null}
            {activeTab === "profile" && user.role !== UserRole.ADMIN ? (
              <div className="mb-6 max-w-3xl">
                <WorkspaceAccessSwitcher activeRole={user.role} testerEnabled={user.testerWorkspaceEnabled} developerEnabled={user.developerWorkspaceEnabled} />
              </div>
            ) : null}

            {activeTab === "profile" ? (
              <div className="max-w-3xl space-y-4">
                {(user.role !== UserRole.TESTER || user.developerWorkspaceEnabled) && isPublicHandle(user.username) ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
                      <span className="uppercase tracking-wider text-zinc-500">Public profile</span>
                      <span className="truncate text-zinc-200">{publicProfilePath(user.username)}</span>
                      <span className={user.emailVerified ? "text-emerald-400" : "text-zinc-500"}>{user.emailVerified ? "● Email verified" : "○ Email unverified"}</span>
                    </div>
                    <Link className="shrink-0 rounded-md border border-zinc-800 px-2.5 py-1 font-mono text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white" href={publicProfilePath(user.username)}>View ↗</Link>
                  </div>
                ) : null}
                <AccountSettingsForm initial={{ email: user.email, name: user.name, username: user.username, avatarUrl: user.avatarUrl || user.image, bio: user.bio, portfolioUrl: user.portfolioUrl, companyName: user.companyName, productUrl: user.productUrl, githubUsername: user.githubUsername, discordUrl: user.discordUrl, twitterHandle: user.twitterHandle, emailVerified: Boolean(user.emailVerified), githubConnected: user.accounts.some((account) => account.provider === "github"), role: user.role }} />
                {user.role === "DEVELOPER" ? <><p role={params.developerReferralError ? "alert" : undefined} className="text-sm text-amber-200">{params.developerReferralError}</p><DeveloperReferralSettings shareCode={user.developerReferralCode} received={Boolean(user.developerReferralReceived)} qualifiedCount={user.developerReferralsSent.length} initialCode={params.devref} credits={user.ownedPromoCodes.map((credit) => ({ code: credit.code, state: credit.redemptions.some((entry) => entry.consumedAt) ? "Used" : credit.redemptions.length ? "Reserved (unpaid)" : "Available" }))} /></> : null}
              </div>
            ) : null}

            {activeTab === "security" ? (
              <div className="max-w-2xl space-y-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">Security</h1>
                  <p className="mt-1 text-sm text-neutral-400">Manage account access and password verification.</p>
                </div>
                <PasswordSettingsForm email={user.email} hasPassword={Boolean(user.passwordHash)} />
              </div>
            ) : null}

            {activeTab === "notifications" ? (
              <div className="max-w-3xl space-y-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">Notifications</h1>
                  <p className="mt-1 text-sm text-neutral-400">Control email updates and real-time tester alerts.</p>
                </div>
                <NotificationSettingsForm initialPreferences={preferences} initialWebhookUrl={user.discordWebhookUrl || ""} />
                {user.role !== UserRole.TESTER || user.developerWorkspaceEnabled ? <GitHubTokenForm connected={Boolean(user.githubTokenEncrypted)} /> : null}
              </div>
            ) : null}

            {activeTab === "site-performance" && sitePerformance && analyticsExclusion ? (
              <div className="space-y-4">
                <div>
                  <h1 className="text-2xl font-bold text-white">Site Performance</h1>
                  <p className="mt-1 text-sm text-neutral-400">Private, privacy-safe traffic from real visitors only.</p>
                </div>
                <AnalyticsSummary data={sitePerformance} exclusion={analyticsExclusion} />
              </div>
            ) : null}

            {activeTab === "portfolio" ? (
              <div className="space-y-6">
                <section className="luxury-panel rounded-2xl p-6">
                  <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Portfolio / Billing</p>
                  <h1 className="mt-3 text-3xl font-black text-white">
                    {user.role === UserRole.DEVELOPER ? "Developer launch portfolio" : user.role === UserRole.ADMIN ? "Admin operations portfolio" : "Tester validation portfolio"}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-400">
                    {user.role === UserRole.DEVELOPER
                      ? "Track deployments, funded validation work, and proof assets for your app launches."
                      : user.role === UserRole.ADMIN
                        ? "Review SeedEnv platform health, user activity, and operational coverage."
                        : "Showcase completed seed missions, proof history, rewards, and validator progress."}
                  </p>
                </section>

                {user.role === UserRole.DEVELOPER ? (
                  <DeveloperPortfolio campaigns={user.campaigns} />
                ) : user.role === UserRole.ADMIN ? (
                  <AdminPortfolio />
                ) : (
                  <TesterPortfolio approvedCount={approvedSubmissions.length} earnedCents={earnedCents} pendingCount={pendingSubmissions.length} rankLabel={rank.label} submissions={user.submissions} walletCents={user.walletBalanceCents} xp={user.xpPoints} />
                )}

                <section className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-5 backdrop-blur-md">
                  <div className="flex items-center gap-2">
                    <WalletCards className="size-4 text-amber-500" />
                    <h2 className="text-sm font-semibold text-white">Recent ledger</h2>
                  </div>
                  <div className="mt-4 space-y-3">
                    {user.transactions.length ? user.transactions.map((transaction) => (
                      <div className="flex items-center justify-between gap-4 rounded-xl border border-[#1F2430] bg-[#090A0F]/45 p-4" key={transaction.id}>
                        <div>
                          <p className="text-sm font-semibold text-white">{transaction.description}</p>
                          <p className="mt-1 text-xs text-neutral-500">{transaction.type} · {transaction.status}</p>
                        </div>
                        <p className="font-mono text-sm font-bold text-amber-500">{formatCents(transaction.amountCents)}</p>
                      </div>
                    )) : <p className="rounded-lg border border-dashed border-[#2A2F3D] p-4 text-sm text-neutral-400">Ledger activity will appear here after your first completed transaction.</p>}
                  </div>
                </section>

                {user.role !== UserRole.ADMIN ? (
                  <StripeSettingsCard
                    role={user.role}
                    stripeConfigured={stripeConfigured}
                    paymentMethodSaved={paymentMethodSaved}
                    connectAccountId={user.stripeConnectAccountId}
                    connectCountry={connectCountry}
                    connectDetailsSubmitted={connectDetailsSubmitted}
                    payoutsEnabled={payoutsEnabled}
                    pendingPayoutCount={pendingPayoutCount}
                    pendingPayoutAmountCents={pendingPayoutAmountCents}
                    paymentSetupResult={params.stripePayment}
                    connectSetupResult={params.stripeConnect}
                    draftId={stripeDraft?.id}
                  />
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
        <div className="sm:hidden">
          {user.role === UserRole.TESTER ? <TesterBottomNav /> : user.role === UserRole.DEVELOPER ? <DeveloperBottomNav /> : null}
        </div>
      </main>
    </AuthCheck>
  );
}

function TesterPortfolio({ approvedCount, earnedCents, pendingCount, rankLabel, submissions, walletCents, xp }: {
  approvedCount: number;
  earnedCents: number;
  pendingCount: number;
  rankLabel: string;
  submissions: Array<{ id: string; status: SubmissionStatus; payoutCents: number; campaign: { title: string; targetVibe: string } }>;
  walletCents: number;
  xp: number;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<WalletCards className="size-5" />} label="Wallet" value={formatCents(walletCents)} />
        <Metric icon={<Trophy className="size-5" />} label="Reputation (REP)" value={xp.toLocaleString()} />
        <Metric icon={<CheckCircle2 className="size-5" />} label="Approved" value={approvedCount.toLocaleString()} />
        <Metric icon={<Sprout className="size-5" />} label="Rank" value={rankLabel} />
      </div>
      <PortfolioList empty="No tester submissions yet." items={submissions.map((submission) => ({ id: submission.id, title: submission.campaign.title, meta: `${submission.campaign.targetVibe} · ${submission.status}`, value: formatCents(submission.payoutCents) }))} title={`Mission proof history · ${pendingCount} pending · ${formatCents(earnedCents)} earned`} />
    </div>
  );
}

function DeveloperPortfolio({ campaigns }: { campaigns: Array<{ id: string; title: string; targetVibe: string; totalSlots: number; claimedSlots: number; completedSlots: number; bountyPerTaskUsd: number }> }) {
  if (!campaigns.length) {
    return (
      <section className="rounded-2xl border border-amber-500/25 bg-[linear-gradient(115deg,rgba(245,158,11,0.11),rgba(14,16,23,0.94)_52%)] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Deployment portfolio</p>
        <h2 className="mt-3 text-2xl font-bold text-white">Ready to launch your next build?</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">Deploy your app to recruit vetted beta testers and track live feedback.</p>
        <Link className="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-3 text-sm font-bold text-neutral-950 transition hover:bg-amber-400" href="/console?view=new-drop">
          + Deploy New Build <ArrowRight className="size-4" />
        </Link>
      </section>
    );
  }

  return <PortfolioList empty="No developer deployments yet." items={campaigns.map((campaign) => ({ id: campaign.id, title: campaign.title, meta: `${campaign.targetVibe} · ${campaign.completedSlots}/${campaign.claimedSlots} completed`, value: `$${campaign.bountyPerTaskUsd.toFixed(2)}` }))} title="Deployment portfolio" />;
}

async function AdminPortfolio() {
  const [users, campaigns, submissions] = await Promise.all([
    prisma.user.count(),
    prisma.appCampaign.count(),
    prisma.submission.count(),
  ]);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Metric icon={<ShieldCheck className="size-5" />} label="Users" value={users.toLocaleString()} />
      <Metric icon={<BriefcaseBusiness className="size-5" />} label="Campaigns" value={campaigns.toLocaleString()} />
      <Metric icon={<CheckCircle2 className="size-5" />} label="Submissions" value={submissions.toLocaleString()} />
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-5 backdrop-blur-md transition-all hover:border-violet-500/30">
      <div className="text-amber-500">{icon}</div>
      <p className="mt-4 text-xs uppercase tracking-[0.18em] text-neutral-500">{label}</p>
      <p className="mt-2 font-mono text-xl font-black text-white">{value}</p>
    </div>
  );
}

function PortfolioList({ empty, items, title }: { empty: React.ReactNode; items: Array<{ id: string; title: string; meta: string; value: string }>; title: string }) {
  return (
    <section className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-5 backdrop-blur-md">
      <p className="text-xs uppercase tracking-[0.24em] text-amber-500">{title}</p>
      <div className="mt-4 space-y-3">
        {items.length ? items.map((item) => (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#1F2430] bg-[#090A0F]/45 p-4" key={item.id}>
            <div>
              <p className="text-sm font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-xs text-neutral-500">{item.meta}</p>
            </div>
            <p className="font-mono text-sm font-bold text-amber-500">{item.value}</p>
          </div>
        )) : <p className="text-sm text-neutral-500">{empty}</p>}
      </div>
    </section>
  );
}
