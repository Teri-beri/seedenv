"use client";

import { useState } from "react";
import { useLiveSystemStatus, type LiveSystemStatus } from "@/lib/live-system-status";

type Tone = { dot: string; text: string; border: string; label: string; pulse: boolean };

function toneFor(status: LiveSystemStatus): Tone {
  if (status.phase === "checking") return { dot: "bg-zinc-500", text: "text-zinc-400", border: "border-zinc-800", label: "CHECKING SYSTEMS", pulse: false };
  if (status.phase === "unreachable") return { dot: "bg-rose-500", text: "text-rose-300", border: "border-rose-500/25", label: "STATUS UNREACHABLE", pulse: false };
  if (status.overall === "degraded") return { dot: "bg-amber-500", text: "text-amber-300", border: "border-amber-500/25", label: "PARTIAL DEGRADATION", pulse: true };
  return { dot: "bg-emerald-500", text: "text-emerald-300", border: "border-emerald-500/20", label: "SYSTEMS OPERATIONAL", pulse: true };
}

export function StatusPill({ className = "" }: { className?: string }) {
  const status = useLiveSystemStatus();
  const [showLatency, setShowLatency] = useState(false);
  const tone = toneFor(status);
  const latency = status.phase === "ready" ? `${status.latencyMs}ms` : null;
  const label = showLatency && latency ? `LATENCY ${latency}` : tone.label;

  // `className` controls the wrapper's display so responsive `hidden lg:inline-flex` utilities aren't overridden.
  return (
    <span className={`shrink-0 ${className || "inline-flex"}`}>
      <button
        type="button"
        onClick={() => setShowLatency((value) => !value)}
        aria-pressed={showLatency}
        aria-label={`${tone.label.toLowerCase()}${latency ? `, ${latency} round trip` : ""}. Toggle latency readout.`}
        title={latency ? `Round trip to SeedEnv: ${latency}` : undefined}
        className={`inline-flex min-h-11 min-w-[11.5rem] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border bg-zinc-950/60 px-3 font-mono text-[10px] tracking-[0.14em] transition-colors hover:bg-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${tone.border} ${tone.text}`}
      >
        <span aria-hidden="true" className="relative flex size-2">
          {tone.pulse ? <span className={`absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping ${tone.dot}`} /> : null}
          <span className={`relative inline-flex size-2 rounded-full ${tone.dot} ${tone.pulse ? "motion-safe:animate-pulse" : ""}`} />
        </span>
        <span className="tabular-nums">{label}</span>
      </button>
    </span>
  );
}
