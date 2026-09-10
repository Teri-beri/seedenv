import { SubmissionStatus, UserRole } from "@prisma/client";
import { BriefcaseBusiness, CheckCircle2, ShieldCheck, Sprout, Trophy, WalletCards } from "lucide-react";
import { getServerSession } from "next-auth";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import AuthCheck from "@/components/AuthCheck";
import { AccountSettingsForm } from "@/components/account-settings-form";
import { prisma } from "@/lib/prisma";
import { rankProgress } from "@/lib/rank";
import { formatCents } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/account");

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
    },
  });
  if (!user) redirect("/auth/signin?callbackUrl=/account");

  const approvedSubmissions = user.submissions.filter((submission) => submission.status === SubmissionStatus.APPROVED);
  const pendingSubmissions = user.submissions.filter((submission) => submission.status === SubmissionStatus.PENDING);
  const earnedCents = approvedSubmissions.reduce((sum, submission) => sum + submission.payoutCents, 0);
  const rank = rankProgress(user.rankTier, user.xpPoints);

  return (
    <AuthCheck>
      <main className="terminal-grid min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(109,40,217,0.2),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(245,158,11,0.12),transparent_24%),linear-gradient(180deg,#090A0F_0%,#10131C_50%,#090A0F_100%)] px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <Link className="flex items-center gap-3" href="/">
              <span className="relative size-12 overflow-hidden rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 shadow-lg shadow-amber-500/10">
                <Image src="/seedenv-logo.png" alt="SeedEnv" fill sizes="48px" className="scale-125 object-cover" priority />
              </span>
              <span>
                <span className="block text-xs font-semibold uppercase tracking-[0.32em] text-amber-500">SeedEnv</span>
                <span className="block text-lg font-semibold text-neutral-100">Account</span>
              </span>
            </Link>
            <nav className="flex gap-2">
              <Link className="rounded-xl border border-[#1F2430] bg-[#0E1017]/80 px-4 py-2 text-sm font-semibold text-neutral-300 transition-all hover:border-violet-500/30 hover:text-white" href="/dashboard">Dashboard</Link>
              <Link className="rounded-xl border border-[#1F2430] bg-[#0E1017]/80 px-4 py-2 text-sm font-semibold text-neutral-300 transition-all hover:border-violet-500/30 hover:text-white" href="/console">Console</Link>
            </nav>
          </header>

          <section className="mt-10 grid gap-6 lg:grid-cols-[380px_1fr]">
            <AccountSettingsForm initial={{ email: user.email, name: user.name, username: user.username, avatarUrl: user.avatarUrl || user.image, bio: user.bio, portfolioUrl: user.portfolioUrl, companyName: user.companyName, productUrl: user.productUrl, role: user.role }} />

            <div className="space-y-6">
              <section className="luxury-panel rounded-2xl p-6">
                <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Portfolio</p>
                <h1 className="mt-3 bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-4xl font-black tracking-tight text-transparent">
                  {user.role === UserRole.DEVELOPER ? "Developer launch portfolio" : user.role === UserRole.ADMIN ? "Admin operations portfolio" : "Tester validation portfolio"}
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-400">
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
                <p className="text-xs uppercase tracking-[0.24em] text-amber-500">Recent ledger</p>
                <div className="mt-4 space-y-3">
                  {user.transactions.length ? user.transactions.map((transaction) => (
                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#1F2430] bg-[#090A0F]/45 p-4" key={transaction.id}>
                      <div>
                        <p className="text-sm font-semibold text-white">{transaction.description}</p>
                        <p className="mt-1 text-xs text-neutral-500">{transaction.type} · {transaction.status}</p>
                      </div>
                      <p className="font-mono text-sm font-bold text-amber-500">{formatCents(transaction.amountCents)}</p>
                    </div>
                  )) : <p className="text-sm text-neutral-500">No wallet activity yet.</p>}
                </div>
              </section>
            </div>
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

function PortfolioList({ empty, items, title }: { empty: string; items: Array<{ id: string; title: string; meta: string; value: string }>; title: string }) {
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
