"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useState, useTransition } from "react";
import { classifyHardwareSignals, collectHardwareSignals, type HardwareCheckResult } from "@/lib/hardware-integrity";
import { describeDevice } from "@/lib/validator-identity";

export type JoinViewer = {
  isTester: boolean;
  username: string;
  nodeId: string;
  levelLabel: string;
  rankLabel: string;
  xp: number;
  percent: number;
  nextLabel: string;
  remainingXp: number;
} | null;

type DeviceScan = { model: string; os: string; platform: "iOS" | "Android" | "Desktop"; touch: boolean | null; result: HardwareCheckResult };

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const steps = ["Device check", "Sign in", "Clearance"] as const;
const scanLines = ["Reading browser user agent", "Probing WebGL renderer", "Checking touch input", "Comparing emulator signatures"];

export function ValidatorJoinWizard({ viewer, callbackUrl }: { viewer: JoinViewer; callbackUrl: string }) {
  const [step, setStep] = useState(viewer ? 2 : 0);
  const [scan, setScan] = useState<DeviceScan | null>(null);
  const [scanTick, setScanTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    const ticker = window.setInterval(() => setScanTick((tick) => Math.min(scanLines.length, tick + 1)), 420);
    collectHardwareSignals().then(async (signals) => {
      const device = describeDevice(navigator.userAgent);
      const result = classifyHardwareSignals(signals, navigator.userAgent);
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, 1800 - (Date.now() - started))));
      if (!cancelled) setScan({ ...device, touch: signals?.isTouchCapable ?? null, result });
    });
    return () => { cancelled = true; window.clearInterval(ticker); };
  }, []);

  return (
    <div className="mx-auto w-full max-w-xl">
      <ol className="mb-8 grid grid-cols-3 gap-2" aria-label="Join progress">
        {steps.map((label, index) => (
          <li key={label} aria-current={index === step ? "step" : undefined} className="space-y-2">
            <div className={`h-1 rounded-full transition-colors ${index <= step ? "bg-emerald-400" : "bg-zinc-800"}`} />
            <p className={`font-mono text-[11px] uppercase tracking-wider ${index === step ? "text-zinc-200" : "text-zinc-500"}`}>{String(index + 1).padStart(2, "0")} · {label}</p>
          </li>
        ))}
      </ol>

      {step === 0 ? <DeviceStep scan={scan} scanTick={scanTick} onNext={() => setStep(1)} /> : null}
      {step === 1 ? <EmailStep callbackUrl={callbackUrl} onBack={() => setStep(0)} /> : null}
      {step === 2 && viewer ? <ClearanceStep viewer={viewer} scan={scan} /> : null}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 sm:p-8">{children}</section>;
}

function DeviceStep({ scan, scanTick, onNext }: { scan: DeviceScan | null; scanTick: number; onNext: () => void }) {
  const flagged = scan?.result.integrity === "EMULATOR_FLAGGED";
  const unread = scan?.result.integrity === "UNVERIFIED";
  return (
    <Panel>
      <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Step 01</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">Checking this device</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">SeedEnv cohorts pay for testing on real phones. We read a few browser signals to spot emulators. Nothing is installed and nothing leaves this page until you submit proof.</p>

      <div className="mt-6 rounded-xl border border-zinc-800 bg-[#0A0D12] p-4 font-mono text-xs" aria-live="polite">
        {scanLines.map((line, index) => (
          <p key={line} className={`flex items-center gap-2 py-0.5 ${index < scanTick || scan ? "text-zinc-300" : "text-zinc-600"}`}>
            <span className={index < scanTick || scan ? "text-emerald-400" : "text-zinc-700"}>{index < scanTick || scan ? "✓" : "·"}</span>{line}
          </p>
        ))}
        {!scan ? <div className="mt-3 h-0.5 overflow-hidden rounded bg-zinc-800"><div className="h-full animate-pulse bg-emerald-400/70 transition-[width] duration-500" style={{ width: `${Math.max(12, (scanTick / scanLines.length) * 100)}%` }} /></div> : null}
      </div>

      {scan ? (
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Spec label="Device" value={scan.model} />
          <Spec label="System" value={scan.os} />
          <Spec label="Touch input" value={scan.touch === null ? "Not reported" : scan.touch ? "Detected" : "Not detected"} />
          <Spec label="GPU" value={scan.result.gpuRenderer === "UNKNOWN" || scan.result.gpuRenderer === "NOT_REPORTED" ? "Not exposed" : scan.result.gpuRenderer} />
        </dl>
      ) : null}

      {scan ? (
        <p className={`mt-5 rounded-lg border px-3 py-2 font-mono text-xs ${flagged ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : unread ? "border-zinc-700 bg-zinc-800/40 text-zinc-300" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"}`}>
          {flagged ? "[ ! ] Emulator-like signals found. You can still join, but strict cohorts may flag proofs from this browser." : unread ? "[ – ] This browser hides its GPU, so the check is inconclusive. That's fine; you can continue." : "[ ✓ ] Device signals checked · no emulator signals found"}
        </p>
      ) : null}
      {scan?.platform === "Desktop" ? <p className="mt-3 text-xs leading-5 text-zinc-500">Most cohorts test phone builds. Open this page on the iPhone or Android device you&apos;ll test with for the best match.</p> : null}

      <button className="mt-6 w-full rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-wait disabled:opacity-50" disabled={!scan} onClick={onNext} type="button">
        {scan ? "Continue" : "Scanning…"}
      </button>
      <p className="mt-3 text-center text-[11px] leading-5 text-zinc-500">Browser signals are a heuristic, not proof of hardware. Developers review every submission.</p>
    </Panel>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-[#0A0D12] px-3 py-2">
      <dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="mt-0.5 truncate text-zinc-200" title={value}>{value}</dd>
    </div>
  );
}

function EmailStep({ callbackUrl, onBack }: { callbackUrl: string; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await signIn("email", { email, redirect: false, callbackUrl });
      if (result?.error) setError("We couldn't send a sign-in link. Check the address and try again.");
      else setSentTo(email);
    });
  }

  if (sentTo) {
    return (
      <Panel>
        <p className="font-mono text-xs uppercase tracking-wider text-emerald-400">Link sent</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">Check your inbox</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">We sent a one-time sign-in link to <span className="text-zinc-200">{sentTo}</span>. Open it on this device to finish joining. The link expires in 24 hours.</p>
        <button className="mt-6 text-xs font-mono text-zinc-400 underline-offset-4 hover:text-zinc-200 hover:underline" onClick={() => setSentTo(null)} type="button">Use a different email</button>
      </Panel>
    );
  }

  return (
    <Panel>
      <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Step 02</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">Get your sign-in link</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">No password needed. We&apos;ll email you a link, create your validator account, and give you a handle you can change later.</p>
      <form className="mt-6 space-y-3" onSubmit={submit}>
        <label className="block text-sm text-zinc-300" htmlFor="join-email">Email</label>
        <input autoComplete="email" className="w-full rounded-lg border border-zinc-800 bg-[#0A0D12] px-3 py-2.5 text-sm text-zinc-100 outline-none transition focus:border-emerald-500/60" id="join-email" inputMode="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required type="email" value={email} />
        {error ? <p className="text-xs text-rose-300" role="alert">{error}</p> : null}
        <button className="w-full rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-white disabled:opacity-50" disabled={isPending} type="submit">{isPending ? "Sending…" : "Email me a sign-in link"}</button>
      </form>
      <p className="mt-4 text-xs leading-5 text-zinc-500">Payouts go through Stripe Express. You&apos;ll connect it when you first cash out. By continuing you agree to the <Link className="text-zinc-300 underline-offset-4 hover:underline" href="/terms">Terms</Link> and <Link className="text-zinc-300 underline-offset-4 hover:underline" href="/privacy">Privacy Policy</Link>.</p>
      <div className="mt-5 flex items-center justify-between text-xs font-mono">
        <button className="text-zinc-500 hover:text-zinc-300" onClick={onBack} type="button">← Device check</button>
        <Link className="text-zinc-500 hover:text-zinc-300" href={`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Other sign-in options</Link>
      </div>
    </Panel>
  );
}

function ClearanceStep({ viewer, scan }: { viewer: NonNullable<JoinViewer>; scan: DeviceScan | null }) {
  if (!viewer.isTester) {
    return (
      <Panel>
        <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Step 03</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">Add a validator workspace</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">You&apos;re signed in as {viewer.username}. Enable the validator workspace on this account to start claiming missions. Your developer workspace stays as it is.</p>
        <a className="mt-6 block w-full rounded-lg bg-zinc-100 px-4 py-2.5 text-center text-sm font-semibold text-zinc-950 transition hover:bg-white" href="/onboarding?role=TESTER&next=/validators/join">Enable validator workspace</a>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-zinc-900 via-[#0D1017] to-emerald-950/30 p-6 sm:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="relative">
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-wider">
            <span className="text-emerald-400">SeedEnv · Validator Clearance</span>
            <span className="text-zinc-500">{viewer.nodeId}</span>
          </div>
          <h2 className="mt-6 truncate text-2xl font-semibold tracking-tight text-zinc-100">@{viewer.username}</h2>
          <p className="mt-1 font-mono text-xs text-zinc-400">{viewer.levelLabel} · {viewer.rankLabel}</p>
          <div className="mt-5">
            <div className="flex justify-between font-mono text-[11px] text-zinc-500">
              <span>{viewer.xp.toLocaleString("en-US")} REP</span>
              <span>{viewer.remainingXp > 0 ? `${viewer.remainingXp.toLocaleString("en-US")} to ${viewer.nextLabel}` : viewer.nextLabel}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(2, viewer.percent)}%` }} /></div>
          </div>
          {scan ? <p className="mt-5 font-mono text-[11px] text-zinc-500">{scan.model} · {scan.os} · {scan.result.integrity === "EMULATOR_FLAGGED" ? "emulator signals flagged" : scan.result.integrity === "UNVERIFIED" ? "signals inconclusive" : "device signals checked"}</p> : null}
        </div>
      </section>

      <Panel>
        <h3 className="text-sm font-semibold text-zinc-100">How missions work</h3>
        <ol className="mt-3 space-y-2 text-sm leading-6 text-zinc-400">
          <li><span className="font-mono text-xs text-emerald-400">01</span> Claim a slot. It&apos;s reserved for you for 30 minutes.</li>
          <li><span className="font-mono text-xs text-emerald-400">02</span> Install the build, follow the steps, and submit a screenshot plus notes or a recording.</li>
          <li><span className="font-mono text-xs text-emerald-400">03</span> Developers have 48 hours to review. If they don&apos;t, your proof is approved automatically and the reward is released.</li>
        </ol>
        <InstallSheet />
        <Link className="mt-6 block w-full rounded-lg bg-zinc-100 px-4 py-2.5 text-center text-sm font-semibold text-zinc-950 transition hover:bg-white" href="/dashboard">Open Flight Deck →</Link>
      </Panel>
    </div>
  );
}

function InstallSheet() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [mode, setMode] = useState<"unknown" | "installed" | "ios" | "other">("unknown");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const timer = window.setTimeout(() => setMode(standalone ? "installed" : ios ? "ios" : "other"), 0);
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    const installed = () => { setPrompt(null); setMode("installed"); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => { window.clearTimeout(timer); window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", installed); };
  }, []);

  if (mode === "unknown" || mode === "installed") return null;
  return (
    <div className="mt-5 rounded-xl border border-zinc-800 bg-[#0A0D12] p-4">
      <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Add SeedEnv to your home screen</p>
      {prompt ? (
        <button className="mt-3 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-zinc-500" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }} type="button">Install app</button>
      ) : mode === "ios" ? (
        <p className="mt-2 text-sm leading-6 text-zinc-400">In Safari, tap <span className="text-zinc-200">Share</span>, then <span className="text-zinc-200">Add to Home Screen</span>, so new missions are one tap away.</p>
      ) : (
        <p className="mt-2 text-sm leading-6 text-zinc-400">Use your browser menu and choose <span className="text-zinc-200">Install app</span> or <span className="text-zinc-200">Add to Home screen</span>.</p>
      )}
    </div>
  );
}
