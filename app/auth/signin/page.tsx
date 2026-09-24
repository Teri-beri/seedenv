import { Suspense } from "react";
import Image from "next/image";
import { AnimatedGridBackground } from "@/components/animated-grid-background";
import { CompactSignupForm } from "@/components/compact-signup-form";

export default function SignInPage() {
  return (
    <main className="seedenv-ambient-grid relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_16%_0%,rgba(109,40,217,0.2),transparent_30%),radial-gradient(circle_at_86%_10%,rgba(245,158,11,0.12),transparent_24%),radial-gradient(circle_at_50%_52%,rgba(16,185,129,0.055),transparent_32%),linear-gradient(180deg,#090A0F_0%,#10131C_48%,#090A0F_100%)] px-4 py-10 text-white sm:py-12">
      <AnimatedGridBackground />
      <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/[0.07] blur-3xl" aria-hidden="true" />
      <div className="absolute left-1/2 top-[18%] h-64 w-96 -translate-x-1/2 rounded-full bg-violet-500/[0.04] blur-3xl" aria-hidden="true" />
      <div className="relative z-10 flex w-full max-w-lg flex-col items-center">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative size-16 overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-2xl shadow-black/50">
            <Image src="/seedenv-logo-v2.png" alt="SeedEnv" fill sizes="64px" className="scale-125 object-cover" priority />
          </div>
          <p className="mt-4 text-xl font-semibold tracking-tight text-white">SeedEnv</p>
          <p className="mt-1 text-xs text-zinc-500">Seed real beta communities.</p>
        </div>
        <Suspense fallback={<SignInFallback />}>
          <CompactSignupForm />
        </Suspense>
        <footer className="mt-6 flex items-center gap-4 text-xs text-zinc-500">
          <a className="transition-colors hover:text-zinc-300" href="/terms">Terms of Service</a>
          <span className="h-1 w-1 rounded-full bg-zinc-700" aria-hidden="true" />
          <a className="transition-colors hover:text-zinc-300" href="/privacy">Privacy Policy</a>
        </footer>
      </div>
    </main>
  );
}

function SignInFallback() {
  return (
    <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-950/80 p-10 text-center shadow-2xl shadow-black/80">
      <svg className="mx-auto mb-6 size-10 animate-spin text-amber-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z" />
      </svg>
      <p className="text-sm text-neutral-400">Loading SeedEnv access paths...</p>
    </div>
  );
}
