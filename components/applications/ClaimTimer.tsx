"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (!timer) timer = setInterval(() => { for (const listener of listeners) listener(); }, 30_000);
  return () => {
    listeners.delete(onChange);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function remainingLabel(startBy: string, now: number) {
  const left = new Date(startBy).getTime() - now;
  if (!Number.isFinite(left)) return null;
  if (left <= 0) return "Start window expired";
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  return `${hours ? `${hours}h ` : ""}${minutes}m remaining to start`;
}

/** Counts down a tester's claim window. The server snapshot keeps hydration stable. */
export function ClaimTimer({ startBy, renderedAt }: { startBy: string; renderedAt: number }) {
  const now = useSyncExternalStore(subscribe, () => Date.now(), () => renderedAt);
  const label = remainingLabel(startBy, now);
  if (!label) return null;
  const expired = label === "Start window expired";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] ${expired ? "border-zinc-800 bg-zinc-900/60 text-zinc-500" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}>
      {label}
    </span>
  );
}
