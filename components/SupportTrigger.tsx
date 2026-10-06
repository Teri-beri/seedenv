"use client";

import { MessageSquarePlus } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

export const SupportTrigger = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<"button">>(function SupportTrigger({ className = "", ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label="Support & Feedback (press ? to open)"
      title="Support & Feedback (?)"
      className={`support-trigger group fixed bottom-5 right-5 z-40 inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-zinc-800/80 bg-zinc-900/75 p-2 text-zinc-400 shadow-lg shadow-black/30 backdrop-blur-md transition-all duration-250 ease-out hover:border-zinc-700 hover:px-3 hover:text-emerald-400 focus-visible:border-zinc-700 focus-visible:px-3 focus-visible:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 data-[state=open]:text-emerald-400 ${className}`}
      {...props}
    >
      <MessageSquarePlus aria-hidden className="size-4 shrink-0" />
      <span aria-hidden className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-medium opacity-0 transition-all duration-250 ease-out group-hover:ml-1.5 group-hover:max-w-xs group-hover:opacity-100 group-focus-visible:ml-1.5 group-focus-visible:max-w-xs group-focus-visible:opacity-100">
        Feedback
      </span>
    </button>
  );
});
