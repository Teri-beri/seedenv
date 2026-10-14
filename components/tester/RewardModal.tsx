"use client";

import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useSpring } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const DIGIT_HEIGHT = 36;

function OdometerDigit({ digit }: { digit: number }) {
  return (
    <span className="relative block h-9 w-6 overflow-hidden rounded-md border border-zinc-700 bg-zinc-950">
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col items-center font-mono text-lg font-bold text-emerald-300"
        animate={{ y: -digit * DIGIT_HEIGHT }}
        transition={{ type: "spring", stiffness: 180, damping: 20, mass: 0.65 }}
      >
        {Array.from({ length: 10 }, (_, value) => <span key={value} className="flex h-9 w-full shrink-0 items-center justify-center">{value}</span>)}
      </motion.span>
    </span>
  );
}

type RewardModalProps = {
  open: boolean;
  initialRep: number;
  addedRep: number;
  onClose: () => void;
  triggerHaptic?: () => void;
  triggerTone?: () => void;
};

export function RewardModal({ open, initialRep, addedRep, onClose, triggerHaptic, triggerTone }: RewardModalProps) {
  const projectedTotal = Math.max(0, initialRep + addedRep);
  const tally = useMotionValue(initialRep);
  const springTally = useSpring(tally, { stiffness: 90, damping: 18, mass: 0.8 });
  const [displayTotal, setDisplayTotal] = useState(initialRep);
  const feedbackPlayed = useRef(false);

  useMotionValueEvent(springTally, "change", (latest) => setDisplayTotal(Math.max(0, Math.round(latest))));

  useEffect(() => {
    if (!open) {
      feedbackPlayed.current = false;
      tally.jump(initialRep);
      springTally.jump(initialRep);
      return;
    }
    if (!feedbackPlayed.current) {
      feedbackPlayed.current = true;
      triggerHaptic?.();
      triggerTone?.();
    }
    tally.jump(initialRep);
    const frame = window.requestAnimationFrame(() => tally.set(projectedTotal));
    return () => window.cancelAnimationFrame(frame);
  }, [open, initialRep, projectedTotal, springTally, tally, triggerHaptic, triggerTone]);

  const digitCount = Math.max(3, String(projectedTotal).length);
  const visibleDigits = String(displayTotal).padStart(digitCount, "0").slice(-digitCount).split("").map(Number);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.96, opacity: 0, y: 18 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 18 }} transition={{ duration: 0.22, ease: "easeOut" }} className="relative w-full max-w-md overflow-hidden rounded-2xl border border-emerald-500/25 bg-[#0A0D12] p-5 shadow-2xl shadow-emerald-500/10">
            <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-lg border border-zinc-800 p-2 text-zinc-400 transition hover:text-white" aria-label="Close reward summary">
              <X className="size-4" />
            </button>

            <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-emerald-300">Mission Proof Transmitted</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Audit queued for review</h3>
              </div>
              <motion.div animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }} transition={{ duration: 0.6 }} className="rounded-full border border-emerald-500/25 bg-emerald-500/10 p-2 text-emerald-400">
                <Sparkles className="size-5" />
              </motion.div>
            </div>

            <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4">
              <p className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">Projected REP balance</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="flex gap-1" aria-label={`${displayTotal} projected reputation`}>
                  {visibleDigits.map((digit, index) => <OdometerDigit key={index} digit={digit} />)}
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-zinc-500">On approval</p>
                  <p className="mt-1 text-lg font-semibold text-white">+{addedRep} REP</p>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-amber-300">Settlement pending</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">The developer will review your evidence. REP and the escrowed bounty settle only after approval.</p>
            </div>

            <button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-xs font-bold tracking-tight text-zinc-950 transition hover:bg-emerald-400">
              Continue →
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
