"use client";

import { CheckCircle2, ChevronDown, CircleDot, MonitorUp, Radio, Smartphone, Video } from "lucide-react";
import { useMemo, useState } from "react";
import type { MissionDeviceProfile } from "@/lib/mission-device-profile";

function RecordingIllustration({ platform }: { platform: MissionDeviceProfile["platform"] }) {
  const isApple = platform === "IOS" || platform === "IPADOS";
  return (
    <div className="relative mx-auto h-44 w-28 rounded-[1.7rem] border-2 border-zinc-700 bg-zinc-950 p-2 shadow-xl shadow-black/30">
      <div className="mx-auto h-1.5 w-10 rounded-full bg-zinc-700" />
      <div className="mt-2 space-y-2 rounded-2xl bg-gradient-to-b from-sky-950/80 to-zinc-900 p-2">
        <div className="flex items-center justify-between text-[7px] text-zinc-400"><span>{isApple ? "Control Center" : "Quick Settings"}</span><ChevronDown className="size-2.5" /></div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="grid h-10 place-items-center rounded-lg bg-sky-500/20"><Radio className="size-4 text-sky-300" /></div>
          <div className="grid h-10 place-items-center rounded-lg bg-zinc-800"><MonitorUp className="size-4 text-zinc-400" /></div>
          <div className="grid h-10 place-items-center rounded-lg bg-zinc-800"><Smartphone className="size-4 text-zinc-400" /></div>
          <div className="grid h-10 place-items-center rounded-lg border border-red-500/40 bg-red-500/15"><CircleDot className="size-4 text-red-300" /></div>
        </div>
      </div>
      <div className="absolute -right-8 top-14 flex items-center">
        <span className="h-px w-7 bg-red-400" />
        <span className="grid size-6 place-items-center rounded-full bg-red-500 text-[9px] font-bold text-white">1</span>
      </div>
    </div>
  );
}

export function MobileMissionGuide({
  profile,
  confirmedDeviceModel,
  recordingConfirmedAt,
  launchUrl,
  platformLabel,
  onConfirmModel,
  onConfirmRecording,
}: {
  profile: MissionDeviceProfile;
  confirmedDeviceModel: string | null;
  recordingConfirmedAt: string | null;
  launchUrl: string;
  platformLabel: string;
  onConfirmModel: (model: string) => void;
  onConfirmRecording: () => void;
}) {
  const [customModel, setCustomModel] = useState("");
  const [showCustomModel, setShowCustomModel] = useState(false);
  const candidates = useMemo(() => profile.modelCandidates.length ? profile.modelCandidates : [profile.estimatedModel], [profile]);
  const isApple = profile.platform === "IOS" || profile.platform === "IPADOS";

  return (
    <section className="overflow-hidden rounded-2xl border border-sky-500/25 bg-gradient-to-b from-sky-500/10 to-zinc-950/80">
      <div className="border-b border-sky-500/15 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-sky-300">Mobile Companion · Connected</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Prepare this phone for the mission</h3>
          </div>
          <span className="relative flex size-3"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" /><span className="relative inline-flex size-3 rounded-full bg-emerald-400" /></span>
        </div>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Your laptop will update as you confirm the device, start recording, and complete each mission step.</p>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/75 p-4">
          <div className="flex items-start gap-3">
            <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${confirmedDeviceModel ? "bg-emerald-500 text-zinc-950" : "bg-sky-500 text-zinc-950"}`}>{confirmedDeviceModel ? <CheckCircle2 className="size-4" /> : "1"}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white">Confirm your physical device</p>
              <p className="mt-1 font-mono text-xs text-zinc-500">{profile.osVersion} · {profile.screenWidth} × {profile.screenHeight} @ {profile.devicePixelRatio}x</p>
              {confirmedDeviceModel ? <p className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">{confirmedDeviceModel}</p> : (
                <div className="mt-3 grid gap-2">
                  {candidates.map((model) => <button key={model} type="button" onClick={() => onConfirmModel(model)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-left text-sm text-zinc-200 transition hover:border-sky-500/50 hover:text-white">{model}</button>)}
                  <button type="button" onClick={() => setShowCustomModel((current) => !current)} className="text-left text-xs text-sky-300 hover:text-sky-200">My exact model is not listed</button>
                  {showCustomModel ? <div className="flex gap-2"><input value={customModel} onChange={(event) => setCustomModel(event.target.value)} maxLength={120} placeholder={isApple ? "e.g. iPhone 15 Pro" : "e.g. Pixel 8"} className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-500/50" /><button type="button" disabled={customModel.trim().length < 2} onClick={() => onConfirmModel(customModel.trim())} className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-bold text-zinc-950 disabled:opacity-40">Confirm</button></div> : null}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/75 p-4">
          <div className="flex items-start gap-3">
            <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${recordingConfirmedAt ? "bg-emerald-500 text-zinc-950" : "bg-sky-500 text-zinc-950"}`}>{recordingConfirmedAt ? <CheckCircle2 className="size-4" /> : "2"}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white">Start native screen recording</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Browsers cannot silently record another app. Your phone will always require this explicit recording action.</p>
              {!recordingConfirmedAt ? (
                <>
                  <div className="mt-4 grid gap-5 sm:grid-cols-[8rem_1fr] sm:items-center">
                    <RecordingIllustration platform={profile.platform} />
                    <ol className="space-y-3 text-xs leading-5 text-zinc-300">
                      {isApple ? (
                        <>
                          <li><strong className="text-white">1.</strong> Swipe down from the top-right corner to open Control Center.</li>
                          <li><strong className="text-white">2.</strong> Tap the circular Screen Recording control.</li>
                          <li><strong className="text-white">3.</strong> Wait for the three-second countdown, then return here.</li>
                        </>
                      ) : (
                        <>
                          <li><strong className="text-white">1.</strong> Swipe down twice to open Quick Settings.</li>
                          <li><strong className="text-white">2.</strong> Tap Screen record and choose device audio if requested.</li>
                          <li><strong className="text-white">3.</strong> Tap Start, then return to SeedEnv.</li>
                        </>
                      )}
                    </ol>
                  </div>
                  <button type="button" disabled={!confirmedDeviceModel} onClick={() => { if ("vibrate" in navigator) navigator.vibrate([35, 40, 80]); onConfirmRecording(); }} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-3 text-xs font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40">
                    <Video className="size-4" /> I started screen recording
                  </button>
                </>
              ) : <p className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-200">Recording confirmed. Keep it running while you complete the steps below.</p>}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950/75 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sky-500 text-xs font-bold text-zinc-950">3</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white">Launch {platformLabel}</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">SeedEnv stays paired in the background. Return after each objective to check it off and continue.</p>
              <a href={launchUrl} target="_blank" rel="noopener noreferrer" aria-disabled={!recordingConfirmedAt} className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition ${recordingConfirmedAt ? "bg-emerald-500 text-zinc-950 hover:bg-emerald-400" : "pointer-events-none bg-zinc-800 text-zinc-500"}`}>
                Open {platformLabel} ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
