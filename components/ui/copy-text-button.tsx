"use client";

import { CopyFeedbackIcon } from "@/components/ui/copy-feedback-icon";
import { useCopyFeedback } from "@/lib/use-copy-feedback";

export function CopyTextButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const { copy, isCopied, failedKey } = useCopyFeedback();
  return <span className={`inline-flex flex-col items-start gap-1 ${className}`}>
    <button type="button" onClick={() => void copy(text)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-zinc-900 px-4 py-2 text-sm text-zinc-200 transition hover:border-emerald-500/40 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
      <CopyFeedbackIcon copied={isCopied()} />{isCopied() ? "Copied" : label}
    </button>
    <span role="status" className="text-xs text-amber-300">{failedKey ? "Copy failed. Select the displayed text to copy manually." : ""}</span>
  </span>;
}
