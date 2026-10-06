import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <main id="main-content" className="flex min-h-screen flex-col items-center justify-center bg-[#0A0D12] px-6 py-16 text-center text-white">
      <Link href="/" aria-label="SeedEnv home" className="mb-10 inline-flex items-center gap-2.5 text-sm font-semibold text-zinc-100">
        <Image src="/seedenv-logo-v3.png" alt="" width={28} height={28} className="size-7 rounded-md" />
        SeedEnv
      </Link>
      <span className="font-mono text-xs uppercase tracking-wider text-emerald-400">Error 404</span>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">This page doesn&apos;t exist</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-zinc-400">The link may be outdated, or the cohort or profile may have been removed. Check the address or head somewhere useful below.</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-white">Back to home</Link>
        <Link href="/explore" className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white">Explore cohorts</Link>
        <Link href="/contact" className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white">Contact support</Link>
      </div>
    </main>
  );
}
