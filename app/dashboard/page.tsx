import { CampaignStatus } from "@prisma/client";
import { ArrowUpRight, Crown, Flame, Radar, Trophy, WalletCards } from "lucide-react";
import Image from "next/image";
import { MissionExperience } from "@/components/mission-experience";
import { RoleSwitcher, TesterBottomNav } from "@/components/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ensurePreviewData } from "@/lib/preview-data";
import { prisma } from "@/lib/prisma";
import { rankProgress } from "@/lib/rank";
import { formatCents } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await ensurePreviewData();
  const [tester, missions, leaderboard] = await Promise.all([
    getCurrentUser("TESTER"),
    prisma.appCampaign.findMany({
      where: { status: CampaignStatus.ACTIVE, expiresAt: { gt: new Date() } },
      include: { instructions: { orderBy: { stepNumber: "asc" } } },
      orderBy: [{ bountyPerTaskUsd: "desc" }, { createdAt: "desc" }],
    }),
    prisma.user.findMany({ where: { role: "TESTER" }, orderBy: { xpPoints: "desc" }, take: 4 }),
  ]);
  const progress = rankProgress(tester.rankTier, tester.xpPoints);

  return (
    <main className="terminal-grid min-h-screen bg-[radial-gradient(circle_at_16%_0%,rgba(109,40,217,0.18),transparent_30%),radial-gradient(circle_at_86%_10%,rgba(245,158,11,0.12),transparent_24%),linear-gradient(180deg,#090A0F_0%,#10131C_48%,#090A0F_100%)] pb-24 text-white lg:pb-12">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="relative size-11 overflow-hidden rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 shadow-[0_18px_40px_rgba(0,0,0,0.32)]">
            <Image src="/seedenv-logo.svg" alt="SeedEnv" fill sizes="44px" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-500">SeedEnv</p>
            <h1 className="text-lg font-semibold text-neutral-100">Tester Dashboard</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <RoleSwitcher />
          <a className="hidden rounded-xl border border-[#1F2430] bg-[#0E1017]/80 px-4 py-2 text-sm font-semibold text-neutral-300 transition-all hover:border-violet-500/30 hover:text-white sm:inline-flex" href="/console">
            Developer Console <ArrowUpRight className="ml-2 size-4" />
          </a>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <section className="grid min-h-[calc(100vh-96px)] items-center gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-14">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-[#0E1017]/80 px-4 py-2 text-sm font-semibold text-amber-100 shadow-lg shadow-amber-500/10 backdrop-blur-md">
              <Radar className="size-4 text-amber-500" /> Seed authentic beta communities. Get paid. Fuel the launch.
            </div>
            <h2 className="hero-title mt-6 max-w-4xl bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-5xl font-black leading-[0.96] tracking-tight text-transparent sm:text-6xl xl:text-7xl">
              Launch data infrastructure for app teams.
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-400">
              Indie app builders fund authentic early missions. Testers claim timed validations, seed real community data, submit proof, and earn cash plus XP when developers approve the work.
            </p>
          </div>

          <section className="luxury-panel rounded-2xl p-5 transition-all hover:border-violet-500/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Tester HUD</p>
                <h3 className="mt-2 text-2xl font-black">{tester.username}</h3>
              </div>
              <div className="relative size-16 overflow-hidden rounded-2xl border border-amber-400/30 bg-violet-950/70">
                {tester.avatarUrl ? <Image src={tester.avatarUrl} alt="" fill sizes="64px" className="object-cover" /> : <Crown className="m-5 size-6 text-amber-500" />}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <HudMetric icon={<WalletCards className="size-5" />} label="Cash" value={formatCents(tester.walletBalanceCents)} gold />
              <HudMetric icon={<Trophy className="size-5" />} label="XP" value={tester.xpPoints.toLocaleString()} />
              <HudMetric icon={<Flame className="size-5" />} label="Streak" value={`${tester.streakDays}d`} />
            </div>
            <div className="mt-5 rounded-2xl border border-[#1F2430] bg-[#090A0F]/45 p-4 backdrop-blur-md">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-semibold text-violet-100">{progress.label}</span>
                <span className="font-mono text-xs text-neutral-500">{progress.remainingXp} XP to {progress.nextLabel}</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-700 to-amber-500 shadow-lg shadow-amber-500/10" style={{ width: `${progress.percent}%` }} />
              </div>
              <p className="mt-3 text-xs text-neutral-500">Daily streak multiplier: {(1 + Math.min(tester.streakDays, 14) * 0.03).toFixed(2)}x XP</p>
            </div>
          </section>
        </section>

        <section className="space-y-5" id="tester-hub">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Tester Hub</p>
              <h2 className="mt-2 text-4xl font-black tracking-tight text-white">Seed Missions</h2>
            </div>
            <div className="hidden gap-3 md:flex">
              {leaderboard.map((user, index) => (
                <div key={user.id} className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md transition-all hover:border-violet-500/30">
                  <p className="font-mono text-xs text-amber-500">#{index + 1}</p>
                  <p className="text-sm font-semibold">{user.username}</p>
                </div>
              ))}
            </div>
          </div>
          <MissionExperience missions={missions} />
        </section>
      </div>
      <TesterBottomNav />
    </main>
  );
}

function HudMetric({ icon, label, value, gold = false }: { icon: React.ReactNode; label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md transition-all hover:border-violet-500/30">
      <div className={gold ? "text-amber-500" : "text-violet-200"}>{icon}</div>
      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-neutral-500">{label}</p>
      <p className={`mt-1 font-mono text-lg font-black ${gold ? "gold-text" : "text-white"}`}>{value}</p>
    </div>
  );
}
