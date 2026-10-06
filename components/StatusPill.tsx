"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PillState = "checking" | "operational" | "degraded";

export function StatusPill() {
  const [state, setState] = useState<PillState>("checking");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/status", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { overall?: string } | null) => setState(data?.overall === "operational" ? "operational" : "degraded"))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setState("degraded");
      });
    return () => controller.abort();
  }, []);

  const operational = state === "operational";
  const label = operational ? "All Systems Operational" : state === "degraded" ? "Degraded Service" : "System Status";
  const tone = operational
    ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-950/70"
    : state === "degraded"
      ? "border-amber-500/30 bg-amber-950/30 text-amber-300 hover:border-amber-500/50 hover:bg-amber-950/60"
      : "border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200";

  return (
    <Link href="/status" className={`inline-flex min-h-11 items-center rounded-md border px-3 font-mono text-xs transition-colors ${tone}`}>
      <span aria-hidden="true" className="mr-1.5">[</span>
      <span aria-hidden="true" className="relative mr-1.5 flex h-2 w-2">
        {operational ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" /> : null}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${operational ? "bg-emerald-500" : state === "degraded" ? "bg-amber-400" : "bg-zinc-500"}`} />
      </span>
      <span>{label}</span>
      <span aria-hidden="true" className="ml-1.5">]</span>
    </Link>
  );
}
