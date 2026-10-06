"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" className="flex min-h-[70vh] flex-col items-center justify-center bg-[#0A0D12] px-6 py-16 text-center text-white">
      <span className="font-mono text-xs uppercase tracking-wider text-amber-400">Something went wrong</span>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">We couldn&apos;t load this page</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-zinc-400">A temporary error interrupted the request. Your data has not been changed. Try again, or contact support if it keeps happening.</p>
      {error.digest ? <p className="mt-4 font-mono text-[11px] text-zinc-500">Reference: {error.digest}</p> : null}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition-colors hover:bg-white">Try again</button>
        <Link href="/" className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white">Back to home</Link>
        <Link href="/status" className="rounded-lg border border-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white">System status</Link>
      </div>
    </main>
  );
}
