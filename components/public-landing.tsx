"use client";

import { useSession } from "next-auth/react";
import { ArrowRight, Check, CircleHelp, Coins, Download, Gem, LockKeyhole, MoreVertical, Plus, Radio, Share, ShieldCheck, Smartphone, Sparkles, Sprout, Swords, WalletCards, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CSSProperties, useState } from "react";
import { Button } from "@/components/ui/button";
import { AnalyticsTracker, trackAnalytics } from "@/components/analytics-tracker";
import { AnimatedGridBackground } from "@/components/animated-grid-background";
import { formatCents } from "@/lib/utils";

type Mission = {
  id: string;
  title: string;
  appUrl: string;
  iconUrl: string | null;
  targetVibe: string;
  description: string;
  bountyPerTaskUsd: number;
  totalSlots: number;
  claimedSlots: number;
  completedSlots: number;
};

type Viewer = {
  username: string;
  role: "TESTER" | "DEVELOPER" | "ADMIN";
  walletBalanceCents: number;
  avatarUrl: string | null;
  image: string | null;
} | null;

type MissionTier = {
  label: string;
  className: string;
};

type JourneyTier = {
  id: string;
  label: string;
  requirement: string;
  perks: string[];
  reward: string;
  status: string;
  className: string;
};

const journeyTiers: JourneyTier[] = [
  { id: "scout", label: "Scout", requirement: "Unlocked by default", perks: ["3–5 min micro-tasks", "$3–$7 payouts", "Friction notes and single-flow checks"], reward: "+40–160 REP", status: "Ready to claim", className: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100" },
  { id: "validator", label: "Verified Validator", requirement: "3 validated Scout submissions and a 95%+ pass rate", perks: ["Multi-step scenario testing", "Crash and network log collection", "$15–$35 bounties"], reward: "+160–420 REP", status: "0 / 3 Scout missions completed", className: "border-violet-400/40 bg-violet-500/10 text-violet-100" },
  { id: "launch", label: "Launch Squad", requirement: "Top 10% Validator REP", perks: ["App Store readiness audits", "Curated marketplace seeding", "$50–$150+ packages"], reward: "Verified specialist", status: "Locked · earn your place", className: "border-amber-400/40 bg-amber-500/10 text-amber-100" },
];

function missionTier(mission: Mission): MissionTier {
  if (mission.bountyPerTaskUsd >= 5) {
    return {
      label: "Priority Cohort",
      className: "border-amber-400/30 bg-amber-500/10 text-amber-200 shadow-[0_0_28px_rgba(245,158,11,0.12)]",
    };
  }
  if (mission.totalSlots - mission.claimedSlots <= 12) {
    return {
      label: "Tier 2: Pioneer",
      className: "border-violet-400/30 bg-violet-500/10 text-violet-200 shadow-[0_0_28px_rgba(139,92,246,0.12)]",
    };
  }
  return {
    label: "Tier 1: Scout",
    className: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200 shadow-[0_0_28px_rgba(16,185,129,0.1)]",
  };
}

export function PublicLanding({ missions, viewer }: { missions: Mission[]; viewer: Viewer }) {
  const { status } = useSession();
  const router = useRouter();
  const [guestNotice, setGuestNotice] = useState("");
  const [installPlatform, setInstallPlatform] = useState<"ios" | "android">("ios");
  const [audience, setAudience] = useState<"validator" | "developer">("validator");

  const isLoggedIn = status === "authenticated" || Boolean(viewer);
  const dashboardHref = viewer?.role === "DEVELOPER" ? "/console" : viewer?.role === "ADMIN" ? "/admin" : "/dashboard";
  const topBounty = Math.max(...missions.map((mission) => mission.bountyPerTaskUsd), 0);
  const openSlots = missions.reduce((sum, mission) => sum + Math.max(0, mission.totalSlots - mission.claimedSlots), 0);

  function goToSignIn(callbackUrl: string) {
    trackAnalytics("signup_start", { callbackUrl });
    router.push(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  function goToProtectedAction(callbackUrl: string, actionLabel: string) {
    trackAnalytics("cta_click", { action: actionLabel, callbackUrl });
    if (isLoggedIn) {
      router.push(callbackUrl);
      return;
    }
    setGuestNotice(`${actionLabel} is available after sign-in. You can keep browsing and press Sign In / Join when you are ready.`);
  }

  return (
    <main className="seedenv-ambient-grid mobile-app-shell flex min-h-screen flex-col bg-[radial-gradient(circle_at_16%_0%,rgba(109,40,217,0.2),transparent_30%),radial-gradient(circle_at_86%_10%,rgba(245,158,11,0.12),transparent_24%),radial-gradient(circle_at_50%_52%,rgba(16,185,129,0.055),transparent_32%),linear-gradient(180deg,#090A0F_0%,#10131C_48%,#090A0F_100%)] pb-16 text-white sm:pb-16">
      <AnalyticsTracker />
      <AnimatedGridBackground />
      <header className="mobile-app-header sticky top-0 z-40 border-b border-[#1F2430] bg-[#090A0F]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4 lg:px-8">
          <Link className="flex items-center gap-3" href="/">
            <span className="relative size-10 overflow-hidden rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 shadow-lg shadow-amber-500/10 sm:size-11">
              <Image src="/seedenv-logo.png" alt="SeedEnv" fill sizes="44px" className="scale-125 object-cover" priority />
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-500 sm:text-xs sm:tracking-[0.32em]">SeedEnv</span>
              <span className="block max-w-[130px] truncate text-xs font-semibold text-neutral-300 sm:max-w-none sm:text-sm">Launch data infrastructure</span>
            </span>
          </Link>

          {isLoggedIn && viewer ? (
            <nav className="flex items-center gap-3">
              <a className="hidden rounded-xl border border-[#1F2430] bg-[#0E1017]/80 px-4 py-2 text-sm font-semibold text-neutral-300 transition-all hover:border-violet-500/30 hover:text-white sm:inline-flex" href={dashboardHref}>
                {viewer.role === "DEVELOPER" ? "Developer Console" : viewer.role === "ADMIN" ? "Admin" : "Tester Dashboard"}
              </a>
              <a className="hidden rounded-xl border border-[#1F2430] bg-[#0E1017]/80 px-4 py-2 text-sm font-semibold text-neutral-300 transition-all hover:border-violet-500/30 hover:text-white sm:inline-flex" href="/account">
                Account
              </a>
              <div className="hidden items-center gap-2 rounded-xl border border-[#1F2430] bg-[#0E1017]/80 px-3 py-2 text-sm font-semibold text-amber-500 sm:flex">
                <WalletCards className="size-4" /> {formatCents(viewer.walletBalanceCents)}
              </div>
              <div className="relative size-10 overflow-hidden rounded-xl border border-[#1F2430] bg-violet-950/60">
                {viewer.avatarUrl || viewer.image ? <Image src={viewer.avatarUrl || viewer.image || ""} alt="" fill sizes="40px" className="object-cover" /> : <Sprout className="m-2.5 size-5 text-amber-500" />}
              </div>
            </nav>
          ) : (
            <nav className="flex items-center gap-2 sm:gap-3">
              <a className="hidden text-sm font-semibold text-neutral-400 transition-colors hover:text-white md:inline" href="#missions">Quest Board</a>
              <a className="hidden text-sm font-semibold text-neutral-400 transition-colors hover:text-white md:inline" href="#developers">
                For Developers
              </a>
              <Button className="h-10 rounded-xl px-3 text-xs sm:h-11 sm:px-5 sm:text-sm" onClick={() => goToSignIn("/dashboard")}>
                Sign In / Join
              </Button>
            </nav>
          )}
        </div>
      </header>

      <section className="order-1 mx-auto grid max-w-7xl items-center gap-8 px-4 py-6 sm:gap-10 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
        <div>
          <div className="mb-6 inline-flex rounded-full border border-white/10 bg-[#0E1017]/80 p-1 shadow-lg shadow-black/20" role="tablist" aria-label="Choose your SeedEnv path">
            <button aria-selected={audience === "validator"} className={`rounded-full px-4 py-2 text-xs font-bold transition sm:text-sm ${audience === "validator" ? "bg-amber-500 text-[#090A0F]" : "text-zinc-500 hover:text-white"}`} onClick={() => setAudience("validator")} role="tab" type="button">For Validators / Testers</button>
            <button aria-selected={audience === "developer"} className={`rounded-full px-4 py-2 text-xs font-bold transition sm:text-sm ${audience === "developer" ? "bg-amber-500 text-[#090A0F]" : "text-zinc-500 hover:text-white"}`} onClick={() => setAudience("developer")} role="tab" type="button">For Developers</button>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-[#0E1017]/80 px-3 py-2 text-xs font-semibold text-amber-100 shadow-lg shadow-amber-500/10 backdrop-blur-md sm:px-4 sm:text-sm">
            <Sparkles className="size-4 text-amber-500" /> ⚡ Real software testing. Real payouts. Powered by vetted human feedback.
          </div>
          <h1 className="hero-title mt-5 max-w-4xl bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-[2.35rem] font-black leading-[0.94] tracking-tight text-transparent sm:mt-6 sm:text-6xl xl:text-7xl">
            {audience === "validator" ? "Build reputation through real product validation." : "Launch with evidence your users can trust."}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-400 sm:mt-6 sm:text-lg sm:leading-8">
            {audience === "validator" ? "Complete focused missions, earn transparent payouts, and unlock higher-tier validation work with every verified submission." : "Deploy guaranteed testing cohorts, collect fraud-resistant telemetry, and turn human feedback into a launch-ready product signal."}
          </p>
          <div className="mt-6 hidden flex-wrap gap-3 sm:flex">
            <Button className={audience === "validator" ? "order-first" : "border border-white/15 bg-transparent text-white hover:border-amber-400/50 hover:bg-transparent"} onClick={() => audience === "validator" ? goToProtectedAction("/dashboard", "Starting as a Scout") : goToProtectedAction("/console?intent=new-campaign", "Deploying a cohort")}>{audience === "validator" ? "Start as a Scout ($0 Entry)" : "Deploy a Cohort"} <ArrowRight className="size-4" /></Button>
            <a className={`inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition-colors ${audience === "validator" ? "border border-white/15 text-neutral-200 hover:border-amber-400/50 hover:text-white" : "border border-amber-400/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"}`} href={audience === "validator" ? "#missions" : "#developers"}>{audience === "validator" ? "See Live Missions" : "View Developer Pricing"}</a>
          </div>
          {guestNotice ? <p className="mt-4 max-w-xl rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-4 text-sm leading-6 text-neutral-300">{guestNotice}</p> : null}
          <div className="mt-6 grid grid-cols-3 gap-2 sm:hidden">
            <MobileStat label="Drops" value={missions.length.toString()} />
            <MobileStat label="Open" value={openSlots.toString()} />
            <MobileStat label="Top" value={`$${topBounty.toFixed(2)}`} />
          </div>
        </div>

        <aside className="luxury-panel hidden rounded-2xl border-white/10 bg-zinc-900/80 p-4 backdrop-blur-md sm:block sm:p-5">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-500">{audience === "validator" ? "Active rewards" : "Developer signal"}</p>
          {audience === "developer" ? <div className="mt-5 space-y-3"><MetricLine label="Verified human validators" value={`${openSlots} open slots`} /><MetricLine label="Platform fee" value="8% of total budget" /><MetricLine label="Evidence layer" value="Proof + telemetry" /></div> : null}
          <div className="mt-5 grid gap-3">
            {missions.slice(0, 3).map((mission) => (
              <div key={mission.id} className="rounded-2xl border border-white/10 bg-zinc-950/45 p-4 backdrop-blur-md transition-all hover:border-amber-500/50">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{mission.title}</p>
                    <p className="mt-1 text-xs text-zinc-400">{mission.targetVibe}</p>
                  </div>
                  <p className="font-mono text-lg font-black text-amber-500">{formatCents(Math.round(mission.bountyPerTaskUsd * 100))}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <div className="order-2"><ValidatorJourney /></div>

      <section className="order-3 border-y border-white/5 bg-[#0E1017]/30 px-4 py-12 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:py-16" id="missions">
        <div className="mx-auto max-w-7xl px-0 sm:px-2 lg:px-4">
        <div className="mb-4 flex items-end justify-between gap-4 sm:mb-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Quest Board</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3">
              <h2 className="text-2xl font-black tracking-tight text-white sm:text-4xl">Active Seed Missions</h2>
              <span className="relative flex size-3">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex size-3 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.75)]" />
              </span>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">Live board</span>
            </div>
          </div>
        </div>
        <div className="mobile-card-stack grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
          {missions.map((mission, index) => (
            <QuestMissionCard
              index={index}
              key={mission.id}
              mission={mission}
              onProtectedAction={goToProtectedAction}
            />
          ))}
        </div>
        </div>
      </section>

      <section className="order-5 mx-auto mt-12 max-w-7xl px-4 sm:mt-16 sm:px-6 lg:px-8" id="install">
        <div className="luxury-panel rounded-2xl p-5 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-amber-500"><Download className="size-3.5" /> Install SeedEnv</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Keep the quest board one tap away.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">Add SeedEnv to your home screen for a focused, full-screen workspace.</p>
            </div>
            <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-zinc-950/60 p-1" role="tablist" aria-label="Installation instructions">
              <button
                aria-selected={installPlatform === "ios"}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors sm:px-4 sm:text-sm ${installPlatform === "ios" ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}
                onClick={() => setInstallPlatform("ios")}
                role="tab"
                type="button"
              >
                iOS Safari
              </button>
              <button
                aria-selected={installPlatform === "android"}
                className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition-colors sm:px-4 sm:text-sm ${installPlatform === "android" ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}
                onClick={() => setInstallPlatform("android")}
                role="tab"
                type="button"
              >
                Android Chrome
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="tabpanel">
            {(installPlatform === "ios" ? [
              { icon: Share, label: "Tap Share", text: "Tap the square Share button with the upward arrow in Safari's bottom bar." },
              { icon: Plus, label: "Add to Home Screen", text: "Scroll down the action sheet and tap Add to Home Screen." },
              { icon: Plus, label: "Confirm Add", text: "Review the SeedEnv title, then tap Add in the top-right corner." },
              { icon: Smartphone, label: "Launch SeedEnv", text: "Open SeedEnv from your Home Screen in full-screen standalone mode." },
            ] : [
              { icon: MoreVertical, label: "Open the menu", text: "Tap the three-dot menu in Chrome's top-right corner, or use the install prompt when it appears." },
              { icon: Download, label: "Install app", text: "Select Install app or Add to Home screen." },
              { icon: Download, label: "Confirm Install", text: "Confirm the dialog by tapping Install." },
              { icon: Smartphone, label: "Open SeedEnv", text: "Launch SeedEnv from your app drawer or home screen without the URL bar." },
            ]).map((step, index) => {
              const StepIcon = step.icon;
              return (
                <div className="rounded-2xl border border-white/10 bg-zinc-950/45 p-4" key={step.label}>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-500/10 text-amber-400"><StepIcon className="size-4" /></span>
                    <span className="font-mono text-xs font-bold text-zinc-500">0{index + 1}</span>
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-white">{step.label}</h3>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">{step.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="order-4 mt-12 w-full border-y border-amber-400/10 bg-[#0E1017]/55 py-12 sm:mt-16 sm:py-16" id="developers">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <DeveloperPricing onDeploy={() => goToProtectedAction("/console?intent=new-campaign", "Deploying a cohort")} />
        </div>
      </section>
      <footer className="order-6 mx-auto mt-12 w-full max-w-7xl border-t border-white/10 px-4 py-8 text-sm text-zinc-500 sm:mt-16 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} SeedEnv. Operated by <Link className="font-semibold text-amber-400 hover:underline" href="/terimus">TERIMUS LLC</Link>.</p>
          <p className="font-mono text-xs">Human validation infrastructure</p>
        </div>
      </footer>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#090A0F]/92 px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
          <Button className="h-12 rounded-2xl" onClick={() => goToProtectedAction("/dashboard", "Starting as a Scout")}>Start as a Scout</Button>
          <Button className="h-12 rounded-2xl" onClick={() => goToSignIn("/dashboard")}>Sign In</Button>
        </div>
      </div>
    </main>
  );
}

function ValidatorJourney() {
  const [selectedId, setSelectedId] = useState("scout");
  const selectedTier = journeyTiers.find((tier) => tier.id === selectedId) || journeyTiers[0];

  return (
    <section className="mx-auto mt-12 max-w-7xl px-4 sm:mt-16 sm:px-6 lg:px-8" aria-labelledby="validator-journey-title">
      <div className="rounded-2xl border-y border-white/10 bg-[#0E1017]/45 px-1 py-5 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Progression path</p>
            <h2 id="validator-journey-title" className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">The Validator Journey</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">Start with a focused check, earn verified reputation, and graduate into launch-critical validation work.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-200"><ShieldCheck className="size-4" /> Human-verified progression</span>
        </div>

        <div className="relative mt-8 grid gap-4 md:grid-cols-3 md:gap-5">
          <div className="pointer-events-none absolute left-[16%] right-[16%] top-7 hidden border-t border-dashed border-white/20 md:block" aria-hidden="true" />
          {journeyTiers.map((tier, index) => {
            const isSelected = selectedId === tier.id;
            return (
              <div className="relative z-10 flex flex-col md:px-3" key={tier.id}>
                <button
                  aria-describedby={`journey-detail-${tier.id}`}
                  aria-label={`${tier.label}: ${tier.requirement}`}
                  aria-pressed={isSelected}
                  className={`group flex items-center gap-3 rounded-2xl border p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-400/50 ${isSelected ? "border-amber-400/60 bg-amber-500/10 shadow-[0_0_30px_rgba(245,158,11,0.12)]" : "border-white/10 bg-zinc-950/55"}`}
                  onClick={() => setSelectedId(tier.id)}
                  type="button"
                >
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-full border ${tier.className} ${tier.id === "scout" ? "animate-pulse" : ""}`}>
                    {tier.id === "launch" ? <ShieldCheck className="size-4" /> : <span className="font-mono text-xs font-black">{index + 1}</span>}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-white">Tier {index + 1}: {tier.label}</span>
                    <span className="mt-1 block text-xs text-zinc-500">{tier.status}</span>
                  </span>
                </button>
                <div className="mt-3 rounded-2xl border border-white/10 bg-zinc-950/45 p-4" id={`journey-detail-${tier.id}`}>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-500">{tier.reward}</p>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">{tier.requirement}</p>
                  <ul className="mt-3 space-y-2 text-xs leading-5 text-zinc-300">
                    {tier.perks.map((perk) => <li className="flex gap-2" key={perk}><Check className="mt-0.5 size-3.5 shrink-0 text-emerald-400" /> {perk}</li>)}
                  </ul>
                  {tier.id === "validator" ? <div className="mt-4"><div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500"><span>Scout submissions</span><span>0 / 3</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-0 rounded-full bg-violet-400" /></div></div> : null}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-5 rounded-xl border border-amber-400/15 bg-amber-500/5 px-4 py-3 text-xs leading-5 text-amber-100/80" role="status">Selected path: <strong className="text-amber-300">{selectedTier.label}</strong>. Tap any milestone to inspect its requirements and perks.</p>
      </div>
    </section>
  );
}

function DeveloperPricing({ onDeploy }: { onDeploy: () => void }) {
  const [budget, setBudget] = useState(300);
  const testerCount = Math.max(1, Math.round(budget / 10));
  const payoutLow = Math.round(budget * 0.9);
  const payoutHigh = Math.round(budget * 0.95);
  const feeLow = Math.round(budget * 0.05);
  const feeHigh = Math.round(budget * 0.1);

  return (
    <div className="luxury-panel rounded-2xl p-5 md:p-8">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-start">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-amber-500">For Developers · Transparent pricing</p>
          <h2 className="mt-3 max-w-2xl bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl">Launch validation without mystery fees.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-400">SeedEnv takes only a 5%–10% platform fee on your total campaign budget. 90%+ goes directly to incentivizing vetted, enthusiastic beta users.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["Proof hosting", "Automated validation", "Fraud protection"].map((item) => <div className="rounded-xl border border-white/10 bg-zinc-950/45 p-3 text-xs font-semibold text-zinc-300" key={item}><Check className="mb-2 size-4 text-emerald-400" />{item}</div>)}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-zinc-950/55 p-5">
          <div className="flex items-center justify-between gap-3"><label className="text-sm font-bold text-white" htmlFor="campaign-budget">Campaign budget</label><div className="flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-amber-200"><span>$</span><input aria-label="Campaign budget in dollars" className="w-20 bg-transparent text-right font-mono font-black outline-none" id="campaign-budget" max="5000" min="100" onChange={(event) => setBudget(Number(event.target.value) || 100)} type="number" value={budget} /></div></div>
          <input aria-label="Campaign budget slider" className="mt-5 w-full accent-amber-500" max="5000" min="100" onChange={(event) => setBudget(Number(event.target.value))} step="25" type="range" value={budget} />
          <div className="mt-5 space-y-3 text-sm"><div className="flex justify-between gap-4 text-zinc-300"><span>Tester payout pool (90–95%)</span><strong className="font-mono text-emerald-300">${payoutLow}–${payoutHigh}</strong></div><div className="flex justify-between gap-4 text-zinc-300"><span>Platform & telemetry fee (5–10%)</span><strong className="font-mono text-amber-300">${feeLow}–${feeHigh}</strong></div><div className="flex justify-between gap-4 border-t border-white/10 pt-3 text-zinc-300"><span>Guaranteed deliverables</span><strong className="font-mono text-white">{testerCount} audits</strong></div></div>
          <p className="mt-4 text-xs leading-5 text-zinc-500">Distributed across {testerCount} testers with device logs and verified tester reviews included.</p>
          <Button className="mt-5 w-full" onClick={onDeploy}>Launch This Cohort <ArrowRight className="size-4" /></Button>
        </div>
      </div>
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-zinc-950/55 px-4 py-3"><span className="text-xs text-zinc-500">{label}</span><span className="font-mono text-xs font-bold text-amber-300">{value}</span></div>;
}

function MobileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
      <p className="font-mono text-lg font-black text-white">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
    </div>
  );
}

function QuestMissionCard({ index, mission, onProtectedAction }: {
  index: number;
  mission: Mission;
  onProtectedAction: (callbackUrl: string, actionLabel: string) => void;
}) {
  const [spotlight, setSpotlight] = useState({ x: 50, y: 50 });
  const spotsLeft = mission.totalSlots - mission.claimedSlots;
  const claimedPercent = Math.min(100, Math.max(0, (mission.claimedSlots / mission.totalSlots) * 100));
  const repReward = Math.max(75, Math.round(mission.bountyPerTaskUsd * 32));
  const tier = missionTier(mission);
  const segmentCount = 12;
  const filledSegments = Math.round((claimedPercent / 100) * segmentCount);

  function moveSpotlight(event: React.MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setSpotlight({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  }

  return (
    <article
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/80 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-amber-500/50 hover:shadow-[0_24px_90px_rgba(245,158,11,0.13)] sm:p-5"
      onMouseMove={moveSpotlight}
      style={{ "--spotlight-x": `${spotlight.x}%`, "--spotlight-y": `${spotlight.y}%` } as CSSProperties}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: "radial-gradient(420px circle at var(--spotlight-x) var(--spotlight-y), rgba(245,158,11,0.16), transparent 42%)" }} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.055),transparent_34%,rgba(109,40,217,0.08))]" />
      <div className="relative z-10">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="relative size-14 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/70 shadow-inner sm:size-16">
            {mission.iconUrl ? <Image src={mission.iconUrl} alt="" fill sizes="64px" className="object-cover transition-transform duration-300 group-hover:scale-105" /> : <Sprout className="m-5 size-6 text-amber-500" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${tier.className}`}>{tier.label}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold text-zinc-400">{mission.targetVibe}</span>
            </div>
            <h3 className="mt-3 text-lg font-black tracking-tight text-white sm:text-xl">{mission.title}</h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400">{mission.description}</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-zinc-950/55 p-3 backdrop-blur-md sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">
              <Swords className="size-3.5 text-amber-500" /> Mission Bounties
            </p>
          </div>
          <div className="grid gap-3">
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-200"><Coins className="size-4" /> Cash</div>
              <p className="mt-1 font-mono text-2xl font-black text-amber-400">{formatCents(Math.round(mission.bountyPerTaskUsd * 100))}<span className="ml-2 text-xs font-semibold text-amber-200/70">per validated mission</span></p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2.5"><span className="flex items-center gap-2 text-xs font-semibold text-violet-200"><Gem className="size-4" /> REP Gain <strong className="font-mono">+{repReward}</strong></span><span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200">Unlocks {Math.min(99, 33 + index * 12)}% of Tier 2</span></div>
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-zinc-400"><CircleHelp className="mt-0.5 size-3.5 shrink-0 text-amber-500" /> Requires: 1 screen recording + 2-sentence friction log</p>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-zinc-950/45 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400"><Radio className="size-3.5 text-emerald-400" /> Spots Claimed</p>
            <p className="font-mono text-xs font-bold text-zinc-300">{mission.claimedSlots}/{mission.totalSlots} · {Math.round(claimedPercent)}%</p>
          </div>
          <div className="grid grid-cols-12 gap-1.5">
            {Array.from({ length: segmentCount }).map((_, segment) => (
              <span key={segment} className={`h-2 rounded-full ${segment < filledSegments ? "bg-gradient-to-r from-violet-600 to-amber-500 shadow-[0_0_14px_rgba(245,158,11,0.18)]" : "bg-white/10"}`} />
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500">{spotsLeft} open validator slots remaining</p>
        </div>

        <Button className="mt-5 w-full border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_18px_38px_rgba(245,158,11,0.12)] active:scale-[0.98]" onClick={() => onProtectedAction(`/dashboard?claim=${mission.id}`, `Claiming ${mission.title}`)} disabled={spotsLeft <= 0}>
          <Zap className="size-4" /> Claim Mission
        </Button>
        {index === 0 ? (
          <button className="mt-3 flex w-full items-center justify-center gap-2 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-300" onClick={() => onProtectedAction(`/dashboard?claim=${mission.id}`, "Submitting proof")} type="button">
            <LockKeyhole className="size-3.5" /> Submit proof after sign-in
          </button>
        ) : null}
      </div>
    </article>
  );
}
