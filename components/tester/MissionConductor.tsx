"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, CheckCircle2, Circle, MonitorSmartphone, Smartphone, StepForward } from "lucide-react";
import { useMemo } from "react";

export type MissionStep = {
  id: string;
  stepNumber: number;
  instructionTitle: string;
  instructionDetail: string;
  proofType: string;
  minimumRep?: number;
};

type MissionConductorProps = {
  title: string;
  description: string;
  link: string;
  steps: MissionStep[];
  isRobloxMission?: boolean;
  launchOnPhone?: boolean;
  onPairDevice?: () => void;
  compact?: boolean;
  onToggleCompact?: () => void;
  activeStepIndex: number;
  completedSteps: number[];
  onProgressChange: (activeStepIndex: number, completedSteps: number[]) => void;
};

function triggerStepFeedback() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(35);
  if (typeof window === "undefined") return;
  const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return;
  const audio = new AudioCtor();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(520, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(760, audio.currentTime + 0.1);
  gain.gain.setValueAtTime(0.04, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.onended = () => void audio.close().catch(() => undefined);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.12);
}

export function MissionConductor({
  title,
  description,
  link,
  steps,
  isRobloxMission = false,
  launchOnPhone = false,
  onPairDevice,
  compact = false,
  onToggleCompact,
  activeStepIndex,
  completedSteps,
  onProgressChange,
}: MissionConductorProps) {
  const safeStepIndex = Math.min(Math.max(activeStepIndex, 0), Math.max(steps.length - 1, 0));
  const currentStep = steps[safeStepIndex] ?? steps[0];
  const completed = useMemo(() => new Set(completedSteps.filter((index) => index >= 0 && index < steps.length)), [completedSteps, steps.length]);
  const progress = steps.length ? (completed.size / steps.length) * 100 : 0;
  const progressLabel = `${Math.round(progress)}% Complete`;

  const helperText = useMemo(() => {
    if (isRobloxMission) return "Open Roblox chat and type /console to reveal the live frame and memory telemetry while you run the mission.";
    return "Follow the mission brief, trigger the app, record the behavior, and upload the proof before the timer expires.";
  }, [isRobloxMission]);

  const completeStep = (index: number) => {
    const nextCompleted = [...new Set([...completedSteps, index])].sort((left, right) => left - right);
    const nextIndex = Math.min(index + 1, Math.max(steps.length - 1, 0));
    triggerStepFeedback();
    onProgressChange(nextIndex, nextCompleted);
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.28em] text-sky-300">Mission Slide-Deck</p>
          <p className="mt-1 text-xs text-zinc-400">Step {String(steps.length ? safeStepIndex + 1 : 0).padStart(2, "0")} of {String(steps.length).padStart(2, "0")}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-mono text-emerald-300">
          <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          {progressLabel}
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
        <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-sky-400 to-cyan-300" initial={false} animate={{ width: `${progress}%` }} transition={{ duration: 0.25, ease: "easeOut" }} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {onPairDevice ? (
          <button type="button" onClick={onPairDevice} className="min-h-11 inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-[11px] font-mono text-zinc-200 transition hover:border-zinc-600">
            <Smartphone className="size-3.5 text-sky-400" /> Pair mobile session
          </button>
        ) : null}
        {onToggleCompact ? (
          <button type="button" onClick={onToggleCompact} className="min-h-11 inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-[11px] font-mono text-zinc-200 transition hover:border-zinc-600">
            <MonitorSmartphone className="size-3.5 text-emerald-400" />
            {compact ? "Switch to Full Deck" : "Switch to Compact All-in-One View"}
          </button>
        ) : null}
      </div>

      {!compact ? (
        <motion.div key={currentStep?.id ?? safeStepIndex} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="mt-5 rounded-2xl border border-zinc-800 bg-[#0B0F14] p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-sky-300">{isRobloxMission ? "Roblox telemetry" : "Mission brief"}</span>
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">{currentStep?.proofType || "Proof"}</span>
          </div>
          <h3 className="mt-4 text-xl font-semibold tracking-tight text-white">{currentStep?.instructionTitle || title}</h3>
          <p className="mt-3 text-sm leading-6 text-zinc-300">{currentStep?.instructionDetail || description}</p>
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3 text-xs leading-5 text-zinc-300">
            <span className="font-mono uppercase tracking-[0.2em] text-emerald-300">Objective</span>
            <p className="mt-2 text-zinc-300">{description}</p>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            {launchOnPhone ? (
              <div className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-xs font-bold tracking-tight text-sky-200">
                Launch build from paired phone <Smartphone className="size-4" />
              </div>
            ) : (
              <a href={link} target="_blank" rel="noopener noreferrer" className="min-h-11 inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-bold tracking-tight text-zinc-950 transition hover:bg-emerald-400">
                {isRobloxMission ? "Launch Roblox Server" : "Open App / TestFlight"} <ArrowUpRight className="size-4" />
              </a>
            )}
            <button type="button" onClick={() => completeStep(safeStepIndex)} disabled={!currentStep || completed.has(safeStepIndex)} className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-xs font-bold tracking-tight text-white transition hover:border-zinc-600 disabled:cursor-default disabled:text-emerald-300">
              {completed.has(safeStepIndex) ? "Step Complete" : safeStepIndex < steps.length - 1 ? "Mark Step Complete" : "Complete Walkthrough"} {completed.has(safeStepIndex) ? <CheckCircle2 className="size-4" /> : <StepForward className="size-4" />}
            </button>
          </div>
          <div className="mt-4 rounded-xl border border-zinc-800 bg-black/20 p-3 font-mono text-[11px] leading-5 text-zinc-400">{helperText}</div>
        </motion.div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-zinc-800 bg-[#0B0F14] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">Compact all-in-one mission</span>
              <span className="text-[10px] font-mono text-emerald-300">{progressLabel}</span>
            </div>
            <h3 className="mt-3 text-lg font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm text-zinc-300">{description}</p>
          </div>
          {steps.map((step, index) => {
            const isComplete = completed.has(index);
            const isCurrent = index === safeStepIndex;
            return (
              <div key={step.id} className={`rounded-xl border p-4 ${isCurrent ? "border-sky-500/35 bg-sky-500/5" : "border-zinc-800 bg-zinc-900/50"}`}>
                <div className="flex items-start gap-3">
                  {isComplete ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" /> : <Circle className={`mt-0.5 size-4 shrink-0 ${isCurrent ? "text-sky-400" : "text-zinc-600"}`} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">Step {String(index + 1).padStart(2, "0")} · {step.instructionTitle}</p>
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">{step.proofType}</span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-400">{step.instructionDetail}</p>
                    {!isComplete ? (
                      <button type="button" onClick={() => completeStep(index)} className="min-h-11 mt-3 rounded-lg border border-zinc-700 px-3 py-2 text-[11px] font-semibold text-zinc-200 transition hover:border-zinc-500">
                        Mark step complete
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
          <a href={link} target="_blank" rel="noopener noreferrer" className="min-h-11 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-bold tracking-tight text-zinc-950 transition hover:bg-emerald-400">
            {isRobloxMission ? "Launch Roblox Server" : "Open App / TestFlight"} <ArrowUpRight className="size-4" />
          </a>
        </div>
      )}
    </div>
  );
}
