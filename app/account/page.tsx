import { SubmissionStatus, UserRole } from "@prisma/client";
import { ArrowLeft, ArrowRight, BadgeCheck, BriefcaseBusiness, CheckCircle2, CreditCard, ShieldCheck, Sprout, Trophy, WalletCards } from "lucide-react";
import { getServerSession } from "next-auth";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { NotificationPreferences } from "@/app/actions/accountActions";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import AuthCheck from "@/components/AuthCheck";
import { AccountSettingsForm } from "@/components/account-settings-form";
import { NotificationSettingsForm } from "@/components/notification-settings-form";
import { PasswordSettingsForm } from "@/components/password-settings-form";
import { prisma } from "@/lib/prisma";
import { rankProgress } from "@/lib/rank";
import { formatCents } from "@/lib/utils";

export const dynamic = "force-dynamic";

const accountTabs = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "notifications", label: "Notifications" },
  { id: "portfolio", label: "Portfolio / Billing" },
] as const;

type AccountTab = (typeof accountTabs)[number]["id"];

function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  const saved = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    email_tester_feedback: typeof saved.email_tester_feedback === "boolean" ? saved.email_tester_feedback : true,
    email_ledger_updates: typeof saved.email_ledger_updates === "boolean" ? saved.email_ledger_updates : true,
    email_announcements: typeof saved.email_announcements === "boolean" ? saved.email_announcements : false,
  };
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/account");
  const params = await searchParams;
  const activeTab: AccountTab = accountTabs.some((tab) => tab.id === params.tab) ? params.tab as AccountTab : "profile";

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
        orderBy: { createdAt: "desc" },
        take: 8,
      },
      accounts: { select: { provider: true } },
    },
  });
  if (!user) redirect("/auth/signin?callbackUrl=/account");

  const approvedSubmissions = user.submissions.filter((submission) => submission.status === SubmissionStatus.APPROVED);
  const pendingSubmissions = user.submissions.filter((submission) => submission.status === SubmissionStatus.PENDING);
  const earnedCents = approvedSubmissions.reduce((sum, submission) => sum + submission.payoutCents, 0);
  const rank = rankProgress(user.rankTier, user.xpPoints);
  const preferences = normalizeNotificationPreferences(user.notificationPreferences);

  return (
    <AuthCheck>
      <main className="terminal-grid min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(109,40,217,0.2),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(245,158,11,0.12),transparent_24%),linear-gradient(180deg,#090A0F_0%,#10131C_50%,#090A0F_100%)] px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <Link className="inline-flex items-center gap-2 rounded-xl border border-[#1F2430] bg-[#0E1017]/80 px-3 py-2 text-sm font-semibold text-neutral-300 transition-all hover:border-amber-500/40 hover:text-white" href={user.role === UserRole.DEVELOPER ? "/console" : user.role === UserRole.ADMIN ? "/admin" : "/dashboard"}>
                <ArrowLeft className="size-4" /> Back
              </Link>
              <Link className="flex items-center gap-3" href="/">
                <span className="relative size-12 overflow-hidden rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 shadow-lg shadow-amber-500/10">
                  <Image src="/seedenv-logo-v2.png" alt="SeedEnv" fill sizes="48px" className="scale-125 object-cover" priority />
                </span>
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-[0.32em] text-amber-500">SeedEnv</span>
                  <span className="block text-lg font-semibold text-neutral-100">Account</span>
                </span>
              </Link>
            </div>
            <nav className="flex gap-2">
              <Link className="rounded-xl border border-[#1F2430] bg-[#0E1017]/80 px-4 py-2 text-sm font-semibold text-neutral-300 transition-all hover:border-violet-500/30 hover:text-white" href="/dashboard">Dashboard</Link>
              <Link className="rounded-xl border border-[#1F2430] bg-[#0E1017]/80 px-4 py-2 text-sm font-semibold text-neutral-300 transition-all hover:border-violet-500/30 hover:text-white" href="/console">Console</Link>
            </nav>
          </header>

          <nav aria-label="Account settings" className="mt-8 flex max-w-full gap-2 overflow-x-auto border-b border-[#1F2430] pb-2">
            {accountTabs.map((tab) => (
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
            {activeTab === "profile" ? (
              <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
                <AccountSettingsForm initial={{ email: user.email, name: user.name, username: user.username, avatarUrl: user.avatarUrl || user.image, bio: user.bio, portfolioUrl: user.portfolioUrl, companyName: user.companyName, productUrl: user.productUrl, githubUsername: user.githubUsername, discordUrl: user.discordUrl, twitterHandle: user.twitterHandle, emailVerified: Boolean(user.emailVerified), githubConnected: user.accounts.some((account) => account.provider === "github"), role: user.role }} />
                <section className="luxury-panel h-fit rounded-2xl p-6">
                  <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Developer profile</p>
                  <h1 className="mt-3 text-3xl font-black text-white">Build trust before launch.</h1>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-400">A clear studio identity, concise product brief, and connected social accounts help testers understand who is behind each build.</p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <Metric icon={<BadgeCheck className="size-5" />} label="Email verification" value={user.emailVerified ? "Verified" : "Not verified"} />
                    <Metric icon={<BriefcaseBusiness className="size-5" />} label="Studio" value={user.companyName || "Add studio name"} />
                  </div>
                  <p className="mt-4 text-xs leading-5 text-neutral-500">Social and product links are displayed as provided. Only email and connected GitHub sign-in are marked verified.</p>
                </section>
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

                <PayoutSetupCard stripeConnectAccountId={user.stripeConnectAccountId} />
              </div>
            ) : null}
          </section>
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
        <Metric icon={<Trophy className="size-5" />} label="XP" value={xp.toLocaleString()} />
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
        <Link className="mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-3 text-sm font-bold text-neutral-950 transition hover:bg-amber-400" href="/console#campaign-builder">
          + Deploy New Build <ArrowRight className="size-4" />
        </Link>
      </section>
    );
  }

  return <PortfolioList empty="No developer deployments yet." items={campaigns.map((campaign) => ({ id: campaign.id, title: campaign.title, meta: `${campaign.targetVibe} · ${campaign.completedSlots}/${campaign.claimedSlots} completed`, value: `$${campaign.bountyPerTaskUsd.toFixed(2)}` }))} title="Deployment portfolio" />;
}

function PayoutSetupCard({ stripeConnectAccountId }: { stripeConnectAccountId: string | null }) {
  const isConnected = Boolean(stripeConnectAccountId);
  return (
    <section className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-5 backdrop-blur-md sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-1 size-5 text-amber-500" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-500">Payout setup</p>
            <h2 className="mt-1 text-lg font-bold text-white">Connect payout method</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-400">
              {isConnected ? "A Stripe Connect account is linked to your SeedEnv profile." : "Stripe Connect onboarding is not enabled on this workspace yet. Your balance and transaction history remain available in the ledger."}
            </p>
          </div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${isConnected ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-300" : "border-[#2A2F3D] bg-[#090A0F] text-neutral-400"}`}>
          {isConnected ? "Connected" : "Not connected"}
        </span>
      </div>
    </section>
  );
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
