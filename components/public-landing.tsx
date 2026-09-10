"use client";

import { useSession } from "next-auth/react";
import { Coins, Download, Gem, LockKeyhole, MoreVertical, Plus, Radio, Share, Smartphone, Sparkles, Sprout, Swords, WalletCards, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CSSProperties, useState } from "react";
import { Button } from "@/components/ui/button";
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

function missionTier(mission: Mission): MissionTier {
  if (mission.bountyPerTaskUsd >= 5) {
    return {
      label: "Elite Bounty",
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

  const isLoggedIn = status === "authenticated" || Boolean(viewer);
  const dashboardHref = viewer?.role === "DEVELOPER" ? "/console" : viewer?.role === "ADMIN" ? "/admin" : "/dashboard";
  const topBounty = Math.max(...missions.map((mission) => mission.bountyPerTaskUsd), 0);
  const openSlots = missions.reduce((sum, mission) => sum + Math.max(0, mission.totalSlots - mission.claimedSlots), 0);

  function goToSignIn(callbackUrl: string) {
    router.push(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  function goToProtectedAction(callbackUrl: string, actionLabel: string) {
    if (isLoggedIn) {
      router.push(callbackUrl);
      return;
    }
    setGuestNotice(`${actionLabel} is available after sign-in. You can keep browsing and press Sign In / Join when you are ready.`);
  }

  return (
    <main className="seedenv-ambient-grid mobile-app-shell min-h-screen bg-[radial-gradient(circle_at_16%_0%,rgba(109,40,217,0.2),transparent_30%),radial-gradient(circle_at_86%_10%,rgba(245,158,11,0.12),transparent_24%),radial-gradient(circle_at_50%_52%,rgba(16,185,129,0.055),transparent_32%),linear-gradient(180deg,#090A0F_0%,#10131C_48%,#090A0F_100%)] pb-16 text-white sm:pb-16">
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
              <a className="hidden text-sm font-semibold text-neutral-400 transition-colors hover:text-white md:inline" href="#missions">New Drops</a>
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

      <section className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-6 sm:gap-10 sm:px-6 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-[#0E1017]/80 px-3 py-2 text-xs font-semibold text-amber-100 shadow-lg shadow-amber-500/10 backdrop-blur-md sm:px-4 sm:text-sm">
            <Sparkles className="size-4 text-amber-500" /> Browse live validation work before joining.
          </div>
          <h1 className="hero-title mt-5 max-w-4xl bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-[2.35rem] font-black leading-[0.94] tracking-tight text-transparent sm:mt-6 sm:text-6xl xl:text-7xl">
            Seed authentic communities before launch day.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-400 sm:mt-6 sm:text-lg sm:leading-8">
            SeedEnv lets testers preview active missions, compare loot rewards, and authenticate only when they are ready to join the board.
          </p>
          <div className="mt-6 hidden flex-wrap gap-3 sm:flex">
            <Button onClick={() => goToProtectedAction("/dashboard", "Claiming seed missions")}>Claim Seed</Button>
            <Button variant="ghost" onClick={() => goToProtectedAction("/console?intent=new-drop", "Creating deployments")}>New Drop</Button>
          </div>
          {guestNotice ? <p className="mt-4 max-w-xl rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-4 text-sm leading-6 text-neutral-300">{guestNotice}</p> : null}
          <div className="mt-6 grid grid-cols-3 gap-2 sm:hidden">
            <MobileStat label="Drops" value={missions.length.toString()} />
            <MobileStat label="Open" value={openSlots.toString()} />
            <MobileStat label="Top" value={`$${topBounty.toFixed(2)}`} />
          </div>
        </div>

        <aside className="luxury-panel hidden rounded-2xl border-white/10 bg-zinc-900/80 p-4 backdrop-blur-md sm:block sm:p-5">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Loot snapshot</p>
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

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" id="missions">
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
      </section>

      <section className="mx-auto mt-12 max-w-7xl px-4 sm:mt-16 sm:px-6 lg:px-8" id="install">
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

      <section className="mx-auto mt-12 max-w-7xl px-4 sm:mt-16 sm:px-6 lg:px-8" id="developers">
        <div className="luxury-panel rounded-2xl p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-500">For Developers</p>
          <div className="mt-4 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <h2 className="max-w-3xl bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl">Preview the validation marketplace before creating a deployment.</h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-neutral-400">Browse live seed missions, reward levels, and tester-facing proof expectations. When you are ready to create a deployment, press Sign In / Join.</p>
            </div>
            <Button onClick={() => goToSignIn("/console?intent=new-drop")}>Sign In / Join</Button>
          </div>
        </div>
      </section>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#090A0F]/92 px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
          <Button className="h-12 rounded-2xl" onClick={() => goToProtectedAction("/dashboard", "Claiming seed missions")}>Claim Seed</Button>
          <Button className="h-12 rounded-2xl" onClick={() => goToSignIn("/dashboard")}>Sign In</Button>
        </div>
      </div>
    </main>
  );
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
  const xpReward = Math.max(75, Math.round(mission.bountyPerTaskUsd * 32));
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
              <Swords className="size-3.5 text-amber-500" /> Loot Drops
            </p>
            <span className="font-mono text-xs text-zinc-500">Board #{index + 1}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-200"><Coins className="size-4" /> Cash</div>
              <p className="mt-2 font-mono text-lg font-black text-amber-500">{formatCents(Math.round(mission.bountyPerTaskUsd * 100))}</p>
            </div>
            <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-center gap-2 text-xs font-semibold text-violet-200"><Gem className="size-4" /> XP</div>
              <p className="mt-2 font-mono text-lg font-black text-violet-200">+{xpReward}</p>
            </div>
          </div>
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
          <Zap className="size-4" /> Claim Seed
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
