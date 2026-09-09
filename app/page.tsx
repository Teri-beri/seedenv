import { CampaignStatus, SubmissionStatus } from "@prisma/client";
import { ArrowUpRight, Crown, Flame, Radar, Trophy, WalletCards } from "lucide-react";
import Image from "next/image";
import { DeveloperStudio } from "@/components/developer-studio";
import { MissionExperience } from "@/components/mission-experience";
import { DeveloperHeader, RoleSwitcher, TesterBottomNav } from "@/components/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rankProgress } from "@/lib/rank";
import { formatCents } from "@/lib/utils";

export const dynamic = "force-dynamic";

async function ensurePreviewData() {
  const campaignCount = await prisma.appCampaign.count();
  if (campaignCount > 0) return;

  const developer = await prisma.user.upsert({
    where: { email: "preview.developer@seedenv.dev" },
    update: { role: "DEVELOPER" },
    create: { email: "preview.developer@seedenv.dev", username: "PreviewBuilder", role: "DEVELOPER" },
  });
  await prisma.user.upsert({
    where: { email: "preview.tester@seedenv.dev" },
    update: { walletBalanceCents: 1825, xpPoints: 1240, rankTier: "WAVE_CHASER", streakDays: 6 },
    create: { email: "preview.tester@seedenv.dev", username: "PreviewRider", role: "TESTER", walletBalanceCents: 1825, xpPoints: 1240, rankTier: "WAVE_CHASER", streakDays: 6 },
  });

  const campaigns = [
    ["PulseRoom Social Beta", "TESTFLIGHT", "Social & UGC", 3.5, 25, 7, "Seed a private social room with authentic intro posts, reactions, and one crisp friction report.", "https://testflight.apple.com/join/pulseroom-seed", "https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=256&h=256&fit=crop"],
    ["FlexTrail Habit Tracker", "PLAY_STORE", "Fitness & Wellness", 5, 40, 16, "Create a weekly plan, log one workout, and evaluate whether the streak loop motivates another session.", "https://play.google.com/apps/testing/flextrail", "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=256&h=256&fit=crop"],
    ["NestSwap Marketplace Launch", "WEB_STAGING", "Niche Marketplace", 4.25, 30, 12, "Populate a local-goods marketplace with believable listings, saved searches, and checkout trust feedback.", "https://seedenv.com/demo/nestswap", "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=256&h=256&fit=crop"],
  ] as const;

  for (const [title, platform, vibe, bounty, totalSlots, claimedSlots, description, appUrl, iconUrl] of campaigns) {
    await prisma.appCampaign.create({
      data: {
        developerId: developer.id,
        title,
        platform,
        targetVibe: vibe,
        bountyPerTaskUsd: bounty,
        totalBudgetUsd: bounty * totalSlots,
        platformFeeUsd: bounty * totalSlots * 0.2,
        totalSlots,
        claimedSlots,
        completedSlots: Math.floor(claimedSlots / 2),
        description,
        appUrl,
        iconUrl,
        status: CampaignStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        instructions: {
          create: [
            { stepNumber: 1, instructionTitle: "Open the beta", instructionDetail: "Install or open the staging app and complete the first-run experience.", proofType: "SCREENSHOT" },
            { stepNumber: 2, instructionTitle: "Seed authentic data", instructionDetail: "Perform the core action with realistic content that would help a launch community feel alive.", proofType: "ACTION_LINK" },
            { stepNumber: 3, instructionTitle: "Submit usability feedback", instructionDetail: "Write one specific friction point, one trust concern, and one thing that felt ready to ship.", proofType: "TEXT_FEEDBACK" },
          ],
        },
      },
    });
  }
}

export default async function Home() {
  await ensurePreviewData();
  const [tester, missions, pendingSubmissions, approvedAssets, leaderboard] = await Promise.all([
    getCurrentUser("TESTER"),
    prisma.appCampaign.findMany({
      where: { status: CampaignStatus.ACTIVE, expiresAt: { gt: new Date() } },
      include: { instructions: { orderBy: { stepNumber: "asc" } } },
      orderBy: [{ bountyPerTaskUsd: "desc" }, { createdAt: "desc" }],
    }),
    prisma.submission.findMany({
      where: { status: SubmissionStatus.PENDING, proofImageUrl: { not: null } },
      include: { tester: true, campaign: { include: { instructions: { orderBy: { stepNumber: "asc" } } } } },
      take: 5,
      orderBy: { createdAt: "asc" },
    }),
    prisma.submission.findMany({
      where: { status: SubmissionStatus.APPROVED },
      include: { tester: true, campaign: true },
      take: 12,
      orderBy: { reviewedAt: "desc" },
    }),
    prisma.user.findMany({ where: { role: "TESTER" }, orderBy: { xpPoints: "desc" }, take: 4 }),
  ]);
  const progress = rankProgress(tester.rankTier, tester.xpPoints);

  return (
    <main className="terminal-grid min-h-screen bg-[radial-gradient(circle_at_16%_0%,rgba(109,40,217,0.18),transparent_30%),radial-gradient(circle_at_86%_10%,rgba(245,158,11,0.12),transparent_24%),linear-gradient(180deg,#090A0F_0%,#10131C_48%,#090A0F_100%)] pb-24 text-white lg:pb-0">
      <DeveloperHeader />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid min-h-[calc(100vh-96px)] items-center gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-14">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-aurum/20 bg-aurum/8 px-4 py-2 text-sm font-bold text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <Radar className="size-4 text-aurum" /> Seed authentic beta communities. Get paid. Fuel the launch.
            </div>
            <h1 className="hero-title mt-6 max-w-4xl text-5xl font-black leading-[0.96] tracking-tight text-white sm:text-6xl xl:text-7xl">
              Launch data infrastructure for app teams.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/64">
              Indie app builders fund authentic early missions. Testers claim timed quests, seed real community data, submit proof, and earn cash plus XP when developers approve the work.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <RoleSwitcher />
              <a className="inline-flex items-center gap-2 rounded-full border border-stroke bg-surface/70 px-5 py-3 text-sm font-bold text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:text-white" href="#developer-studio">
                Open Developer Studio <ArrowUpRight className="size-4" />
              </a>
            </div>
          </div>
          <section className="luxury-panel rounded-[2rem] p-5">
            <div className="panel-content flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-aurum">Tester HUD</p>
                <h2 className="mt-2 text-2xl font-black">{tester.username}</h2>
              </div>
              <div className="relative size-16 overflow-hidden rounded-3xl border border-aurum/28 bg-royal/20">
                {tester.avatarUrl ? <Image src={tester.avatarUrl} alt="" fill sizes="64px" className="object-cover" /> : <Crown className="m-5 size-6 text-aurum" />}
              </div>
            </div>
            <div className="panel-content mt-5 grid grid-cols-3 gap-3">
              <HudMetric icon={<WalletCards className="size-5" />} label="Cash" value={formatCents(tester.walletBalanceCents)} gold />
              <HudMetric icon={<Trophy className="size-5" />} label="XP" value={tester.xpPoints.toLocaleString()} />
              <HudMetric icon={<Flame className="size-5" />} label="Streak" value={`${tester.streakDays}d`} />
            </div>
            <div className="panel-content mt-5 rounded-3xl border border-stroke bg-black/24 p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-bold text-violet-100">{progress.label}</span>
                <span className="font-mono text-xs text-white/48">{progress.remainingXp} XP to {progress.nextLabel}</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-gradient-to-r from-royal to-aurum shadow-[0_0_24px_rgba(245,158,11,0.22)]" style={{ width: `${progress.percent}%` }} />
              </div>
              <p className="mt-3 text-xs text-white/46">Daily streak multiplier: {(1 + Math.min(tester.streakDays, 14) * 0.03).toFixed(2)}x XP</p>
            </div>
          </section>
        </section>

        <section className="space-y-5" id="tester-hub">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-aurum">Tester Hub</p>
              <h2 className="mt-2 text-4xl font-black">Wave Drops</h2>
            </div>
            <div className="hidden gap-3 md:flex">
              {leaderboard.map((user, index) => (
                <div key={user.id} className="rounded-2xl border border-stroke bg-surface/70 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <p className="font-mono text-xs text-aurum">#{index + 1}</p>
                  <p className="text-sm font-bold">{user.username}</p>
                </div>
              ))}
            </div>
          </div>
          <MissionExperience missions={missions} />
        </section>

        <section className="mt-12" id="developer-studio">
          <DeveloperStudio submissions={pendingSubmissions} assets={approvedAssets} />
        </section>
      </div>
      <TesterBottomNav />
    </main>
  );
}

function HudMetric({ icon, label, value, gold = false }: { icon: React.ReactNode; label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-3xl border border-stroke bg-surfaceRaised/72 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className={gold ? "text-aurum" : "text-violet-200"}>{icon}</div>
      <p className="mt-3 text-xs uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className={`mt-1 font-mono text-lg font-black ${gold ? "gold-text" : "text-white"}`}>{value}</p>
    </div>
  );
}
