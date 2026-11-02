"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Copy, type LucideIcon } from "lucide-react";

const spring = { type: "spring", stiffness: 520, damping: 18, mass: 0.6 } as const;

/** Swaps the idle icon for a verified check with a tactile spring pop. */
export function CopyFeedbackIcon({ copied, icon: Icon = Copy, className = "size-3.5", checkClassName = "text-emerald-400" }: { copied: boolean; icon?: LucideIcon; className?: string; checkClassName?: string }) {
  const reduceMotion = useReducedMotion();
  const enter = reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.3, rotate: -45 };
  const exit = reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.5 };
  return (
    <span aria-hidden="true" className={`relative inline-grid shrink-0 place-items-center ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={copied ? "check" : "idle"}
          initial={enter}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={exit}
          transition={reduceMotion ? { duration: 0.12 } : spring}
          className={`col-start-1 row-start-1 inline-grid place-items-center ${copied ? checkClassName : ""}`}
        >
          {copied ? <Check strokeWidth={2.75} className={className} /> : <Icon className={className} />}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
