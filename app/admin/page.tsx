import { UserRole } from "@prisma/client";
import { ArrowLeft, ArrowUpRight, ShieldCheck, UsersRound, WalletCards } from "lucide-react";
import { getServerSession } from "next-auth";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import AuthCheck from "@/components/AuthCheck";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");
  if (session.user.role !== "ADMIN") redirect("/");

  const [users, campaigns, submissions, payouts] = await Promise.all([
    prisma.user.count(),
    prisma.appCampaign.count(),
    prisma.submission.count(),
    prisma.walletTransaction.aggregate({ _sum: { amountCents: true } }),
  ]);

  return (
    <AuthCheck role="ADMIN">
      <main className="terminal-grid min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(109,40,217,0.2),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(245,158,11,0.12),transparent_24%),linear-gradient(180deg,#090A0F_0%,#10131C_50%,#090A0F_100%)] px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative size-12 overflow-hidden rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 shadow-lg shadow-amber-500/10">
                <Image src="/seedenv-logo-v3.png" alt="SeedEnv" fill sizes="48px" className="object-contain" priority />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-500">SeedEnv</p>
                <h1 className="text-xl font-semibold text-neutral-100">Private Admin Control</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 text-sm font-medium text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-800/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">
                <ArrowLeft aria-hidden="true" className="size-4" />
                <span className="hidden sm:inline">Back to SeedEnv</span>
                <span className="sm:hidden">Back</span>
              </Link>
              <span className="rounded-full border border-violet-500/30 bg-violet-950/30 px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-violet-100">
                {UserRole.ADMIN}
              </span>
            </div>
          </header>
          <nav aria-label="Administrator queues" className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { href: "/admin/earnings", label: "Owner earnings & payouts", tone: "emerald" },
              { href: "/admin/proof-reviews", label: "Denied tester work", tone: "amber" },
              { href: "/admin/promos", label: "Cohort promo codes", tone: "emerald" },
              { href: "/admin/referrals", label: "Referral clawback audit", tone: "amber" },
              { href: "/clippers", label: "Clippers creator applications & disputes", tone: "violet" },
              { href: "/admin/growth", label: "Growth engine & social posts", tone: "emerald" },
              { href: "/admin/qa", label: "QA assistant: flagged proofs", tone: "amber" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex min-h-12 items-center justify-between gap-3 rounded-xl border bg-zinc-950/50 px-4 py-3 text-sm transition duration-200 hover:-translate-y-0.5 hover:bg-zinc-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${
                  item.tone === "emerald"
                    ? "border-emerald-500/20 text-emerald-200 hover:border-emerald-400/40"
                    : item.tone === "amber"
                      ? "border-amber-500/20 text-amber-200 hover:border-amber-400/40"
                      : "border-violet-500/20 text-violet-200 hover:border-violet-400/40"
                }`}
              >
                <span>{item.label}</span>
                <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-zinc-500 transition group-hover:text-zinc-200" />
              </Link>
            ))}
          </nav>

          <section className="relative mt-8 overflow-hidden rounded-3xl border border-white/[0.08] bg-[linear-gradient(120deg,rgba(16,185,129,0.07),transparent_48%),linear-gradient(300deg,rgba(245,158,11,0.07),transparent_45%),rgba(9,9,11,0.8)] p-6 shadow-2xl shadow-black/20 sm:p-9">
            <div aria-hidden="true" className="absolute -right-20 -top-24 size-64 rounded-full bg-emerald-500/[0.06] blur-3xl" />
            <div className="relative max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                Internal operations
              </div>
              <h2 className="mt-5 text-4xl font-semibold leading-tight tracking-tight text-zinc-100 sm:text-5xl">
                Private by design.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
                A secure control room for SeedEnv operations. These tools are available only to authenticated administrators and never appear in public navigation.
              </p>
            </div>
          </section>

          <section className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <AdminMetric label="Users" value={users.toLocaleString()} icon={<UsersRound className="size-5" />} />
            <AdminMetric label="Campaigns" value={campaigns.toLocaleString()} icon={<ShieldCheck className="size-5" />} />
            <AdminMetric label="Submissions" value={submissions.toLocaleString()} icon={<ShieldCheck className="size-5" />} />
            <AdminMetric label="Ledger volume" value={`$${((payouts._sum.amountCents || 0) / 100).toFixed(2)}`} icon={<WalletCards className="size-5" />} />
          </section>
        </div>
      </main>
    </AuthCheck>
  );
}

function AdminMetric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="group rounded-2xl border border-white/[0.08] bg-[#111318]/85 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:border-emerald-500/25 hover:bg-[#14171d]">
      <div className="grid size-9 place-items-center rounded-xl border border-amber-500/15 bg-amber-500/[0.07] text-amber-400 transition group-hover:border-amber-400/30 group-hover:bg-amber-500/10">{icon}</div>
      <p className="mt-5 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-zinc-100">{value}</p>
    </div>
  );
}
