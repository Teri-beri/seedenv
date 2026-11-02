"use client";

import { ArrowUpRight, CheckCircle2, Smartphone, UploadCloud } from "lucide-react";
import type { MissionDeviceProfile } from "@/lib/mission-device-profile";

export function MobileMissionGuide({
  profile,
  launchUrl,
  platformLabel,
  evidenceReady,
  onEvidenceReady,
}: {
  profile: MissionDeviceProfile;
  launchUrl: string;
  platformLabel: string;
  evidenceReady: boolean;
  onEvidenceReady: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-sky-500/25 bg-gradient-to-b from-sky-500/10 to-zinc-950/80">
      <div className="border-b border-sky-500/15 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-sky-300">Mobile Companion · Connected</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Your computer is showing the mission steps</h3>
          </div>
          <span className="relative flex size-3"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" /><span className="relative inline-flex size-3 rounded-full bg-emerald-400" /></span>
        </div>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Keep those directions visible on the computer. This phone is only for opening the test build and submitting evidence when you finish.</p>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/75 p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-300"><Smartphone className="size-4" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{profile.estimatedModel}</p>
            <p className="mt-1 truncate font-mono text-[10px] text-zinc-500">{profile.osVersion} · {profile.screenWidth} × {profile.screenHeight}</p>
          </div>
          <CheckCircle2 className="ml-auto size-4 shrink-0 text-emerald-400" />
        </div>

        {!evidenceReady ? (
          <>
            <a href={launchUrl} target="_blank" rel="noopener noreferrer" className="min-h-11 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-4 text-sm font-bold text-zinc-950 shadow-lg shadow-emerald-500/10 transition hover:bg-emerald-400">
              Open {platformLabel} <ArrowUpRight className="size-4" />
            </a>
            <button type="button" onClick={onEvidenceReady} className="min-h-11 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-xs font-semibold text-zinc-200 transition hover:border-zinc-600">
              <UploadCloud className="size-4 text-sky-300" /> I finished testing · Add evidence
            </button>
          </>
        ) : (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm leading-6 text-emerald-100">
            Testing complete. Attach only the evidence requested by the mission, add your rating, and submit below.
          </div>
        )}
      </div>
    </section>
  );
}
