"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { sprintHandoffPath } from "@/lib/organic-growth";

export function ToolHandoff({ url, lead = "Your results are ready." }: { url?: string | null; lead?: string }) {
  const inlineRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const href = sprintHandoffPath(url);
  useEffect(() => {
    if (!inlineRef.current || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) => setPinned(!entry.isIntersecting), { threshold: 0.15 });
    observer.observe(inlineRef.current);
    return () => observer.disconnect();
  }, []);
  const cta = "Launch 1-Click Test Sprint";
  return <>
    <div ref={inlineRef} className="mt-4 rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.08] via-zinc-900/80 to-amber-500/[0.06] p-5 backdrop-blur-xl">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-emerald-300"><ShieldCheck className="size-4" /> From automation to real hardware</div>
      <p className="mt-3 text-sm leading-6 text-zinc-300">{lead} Want 5 verified human testers to test edge cases, real hardware bugs, and payment flows on actual iOS &amp; Android devices?</p>
      <Link href={href} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">{cta}<ArrowRight className="size-4" /></Link>
      <p className="mt-3 text-xs leading-5 text-zinc-500">Opens a pre-filled sprint. Review the scope and funding before launch. No account is needed for this free tool.</p>
    </div>
    {pinned && !dismissed ? <aside aria-label="Launch a human testing sprint" className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-4xl items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-zinc-950/95 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl sm:inset-x-6 sm:bottom-4 sm:px-5">
      <p className="hidden text-sm text-zinc-300 sm:block">Ready for real-device QA? <span className="text-zinc-500">Bring in 5 human testers.</span></p>
      <Link href={href} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 sm:flex-none">Launch test sprint<ArrowRight className="size-4" /></Link>
      <button type="button" aria-label="Dismiss sprint reminder" onClick={() => setDismissed(true)} className="grid size-11 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-zinc-200"><X className="size-4" /></button>
    </aside> : null}
  </>;
}
