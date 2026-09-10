"use client";

import { signIn, useSession } from "next-auth/react";
import { LockKeyhole, Sparkles, Sprout, WalletCards, X, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
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

export function PublicLanding({ missions, viewer }: { missions: Mission[]; viewer: Viewer }) {
  const { status } = useSession();
  const [authIntent, setAuthIntent] = useState<{ title: string; callbackUrl: string } | null>(null);

  const isLoggedIn = status === "authenticated" || Boolean(viewer);
  const dashboardHref = viewer?.role === "DEVELOPER" ? "/console" : viewer?.role === "ADMIN" ? "/admin" : "/dashboard";

  function requestAuth(title: string, callbackUrl: string) {
    if (isLoggedIn) {
      window.location.href = callbackUrl;
      return;
    }
    setAuthIntent({ title, callbackUrl });
  }

  return (
    <main className="terminal-grid min-h-screen bg-[radial-gradient(circle_at_16%_0%,rgba(109,40,217,0.18),transparent_30%),radial-gradient(circle_at_86%_10%,rgba(245,158,11,0.12),transparent_24%),linear-gradient(180deg,#090A0F_0%,#10131C_48%,#090A0F_100%)] pb-16 text-white">
      <header className="sticky top-0 z-40 border-b border-[#1F2430] bg-[#090A0F]/86 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link className="flex items-center gap-3" href="/">
            <span className="relative size-11 overflow-hidden rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 shadow-lg shadow-amber-500/10">
              <Image src="/seedenv-logo.svg" alt="SeedEnv" fill sizes="44px" priority />
            </span>
            <span>
              <span className="block text-xs font-semibold uppercase tracking-[0.32em] text-amber-500">SeedEnv</span>
              <span className="block text-sm font-semibold text-neutral-300">Launch data infrastructure</span>
            </span>
          </Link>

          {isLoggedIn && viewer ? (
            <nav className="flex items-center gap-3">
              <a className="hidden rounded-xl border border-[#1F2430] bg-[#0E1017]/80 px-4 py-2 text-sm font-semibold text-neutral-300 transition-all hover:border-violet-500/30 hover:text-white sm:inline-flex" href={dashboardHref}>
                {viewer.role === "DEVELOPER" ? "Developer Console" : viewer.role === "ADMIN" ? "Admin" : "Tester Dashboard"}
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
              <a className="hidden text-sm font-semibold text-neutral-400 transition-colors hover:text-white md:inline" href="#missions">Explore Missions</a>
              <button className="hidden text-sm font-semibold text-neutral-400 transition-colors hover:text-white md:inline" onClick={() => requestAuth("Create a SeedEnv deployment", "/console?intent=new-drop")} type="button">
                For Developers
              </button>
              <Button onClick={() => requestAuth("Join SeedEnv", "/dashboard")}>
                Sign In / Join
              </Button>
            </nav>
          )}
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-[#0E1017]/80 px-4 py-2 text-sm font-semibold text-amber-100 shadow-lg shadow-amber-500/10 backdrop-blur-md">
            <Sparkles className="size-4 text-amber-500" /> Browse live validation work before joining.
          </div>
          <h1 className="hero-title mt-6 max-w-4xl bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-5xl font-black leading-[0.96] tracking-tight text-transparent sm:text-6xl xl:text-7xl">
            Seed authentic communities before launch day.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-400">
            SeedEnv lets testers preview active missions, compare cash rewards, and authenticate only when they are ready to claim work or submit proof.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={() => requestAuth("Claim your first mission", "/dashboard")}>Claim a Mission</Button>
            <Button variant="ghost" onClick={() => requestAuth("Launch a developer deployment", "/console?intent=new-drop")}>New Drop</Button>
          </div>
        </div>

        <aside className="luxury-panel rounded-2xl p-5">
          <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Reward snapshot</p>
          <div className="mt-5 grid gap-3">
            {missions.slice(0, 3).map((mission) => (
              <div key={mission.id} className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-4 backdrop-blur-md transition-all hover:border-violet-500/30">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{mission.title}</p>
                    <p className="mt-1 text-xs text-neutral-500">{mission.targetVibe}</p>
                  </div>
                  <p className="font-mono text-lg font-black text-amber-500">{formatCents(Math.round(mission.bountyPerTaskUsd * 100))}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" id="missions">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Public Browse</p>
            <h2 className="mt-2 text-4xl font-black tracking-tight text-white">Active Seed Missions</h2>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {missions.map((mission, index) => {
            const spotsLeft = mission.totalSlots - mission.claimedSlots;
            const claimedPercent = (mission.claimedSlots / mission.totalSlots) * 100;
            return (
              <article key={mission.id} className="luxury-panel rounded-2xl bg-[#0E1017]/80 p-5 backdrop-blur-md transition-all hover:border-violet-500/30">
                <div className="flex items-start gap-4">
                  <div className="relative size-16 overflow-hidden rounded-2xl bg-violet-950/60">
                    {mission.iconUrl ? <Image src={mission.iconUrl} alt="" fill sizes="64px" className="object-cover" /> : <Sprout className="m-5 size-6 text-amber-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="rounded-full bg-violet-950/50 px-3 py-1 text-xs font-bold text-violet-200">{mission.targetVibe}</span>
                    <h3 className="mt-3 text-xl font-black text-white">{mission.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-400">{mission.description}</p>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl border border-[#1F2430] bg-[#090A0F]/45 p-4 backdrop-blur-md transition-all hover:border-violet-500/30">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-lg font-black text-amber-500">{formatCents(Math.round(mission.bountyPerTaskUsd * 100))} CASH</span>
                    <span className="font-mono text-violet-200">+ {Math.max(75, Math.round(mission.bountyPerTaskUsd * 32))} XP</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-700 to-amber-500" style={{ width: `${claimedPercent}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">{spotsLeft} / {mission.totalSlots} spots left</p>
                </div>
                <Button className="mt-5 w-full" onClick={() => requestAuth(`Claim ${mission.title}`, `/dashboard?claim=${mission.id}`)} disabled={spotsLeft <= 0}>
                  <Zap className="size-4" /> Claim Mission
                </Button>
                {index === 0 ? (
                  <button className="mt-3 flex w-full items-center justify-center gap-2 text-xs font-semibold text-neutral-500 transition-colors hover:text-neutral-300" onClick={() => requestAuth("Submit mission proof", `/dashboard?claim=${mission.id}`)} type="button">
                    <LockKeyhole className="size-3.5" /> Submit proof after authentication
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      {authIntent ? <AuthIntentModal intent={authIntent} onClose={() => setAuthIntent(null)} /> : null}
    </main>
  );
}

function AuthIntentModal({ intent, onClose }: { intent: { title: string; callbackUrl: string }; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await signIn("email", {
        email,
        redirect: false,
        callbackUrl: intent.callbackUrl,
      });
      if (result?.error) {
        setMessage("Email delivery failed. Check your address and try again.");
        return;
      }
      setMessage("Magic link queued. Check your inbox and spam folder to continue.");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-[#1F2430] bg-[#0E1017] p-6 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-500">Authentication required</p>
            <h2 className="mt-2 text-2xl font-black text-white">{intent.title}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-400">Enter your email and SeedEnv will return you to this action after verification.</p>
          </div>
          <button className="rounded-xl border border-[#1F2430] bg-black/20 p-2 text-neutral-400 hover:text-white" onClick={onClose} type="button">
            <X className="size-4" />
          </button>
        </div>
        {message ? <p className={`mt-5 rounded-lg p-3 text-sm ${message.startsWith("Magic") ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300"}`}>{message}</p> : null}
        <form className="mt-5 space-y-4" onSubmit={submit}>
          <label className="block space-y-2 text-sm font-semibold text-neutral-300">
            Email
            <input className="w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-white outline-none transition-all placeholder:text-neutral-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20" onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required type="email" value={email} />
          </label>
          <Button className="w-full" disabled={isPending || !email} type="submit">
            {isPending ? "Sending link..." : "Send Magic Link"}
          </Button>
        </form>
      </div>
    </div>
  );
}
