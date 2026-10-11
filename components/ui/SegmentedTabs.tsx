"use client";

import { motion, useReducedMotion } from "framer-motion";

export interface SegmentedTab<T extends string = string> {
  id: T;
  label: string;
  badge?: number | string;
}

export interface SegmentedTabsProps<T extends string = string> {
  /** Unique per rendered tab group. Shared ids would make the pill glide between unrelated groups. */
  groupId: string;
  tabs: ReadonlyArray<SegmentedTab<T>>;
  activeId: T;
  onChange: (id: T) => void;
  label: string;
  /** "tab" emits tablist/tab roles, "pressed" emits a group with aria-pressed buttons. */
  semantics?: "tab" | "pressed";
  fullWidth?: boolean;
  className?: string;
}

export function SegmentedTabs<T extends string = string>({
  groupId,
  tabs,
  activeId,
  onChange,
  label,
  semantics = "tab",
  fullWidth = false,
  className = "",
}: SegmentedTabsProps<T>) {
  const reduceMotion = useReducedMotion();
  const isTablist = semantics === "tab";

  return (
    <div
      role={isTablist ? "tablist" : "group"}
      aria-label={label}
      className={`${fullWidth ? "flex w-full" : "inline-flex"} items-center gap-1 overflow-x-auto rounded-lg border border-zinc-800/90 bg-[#0c0e12] p-1 ${className}`}
    >
      {tabs.map((tab) => {
        const isActive = activeId === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role={isTablist ? "tab" : undefined}
            aria-selected={isTablist ? isActive : undefined}
            aria-pressed={isTablist ? undefined : isActive}
            onClick={() => onChange(tab.id)}
            className={`relative shrink-0 select-none rounded-md px-3 py-2 font-mono text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${fullWidth ? "flex-1" : ""} ${isActive ? "font-medium text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {isActive ? (
              <motion.span
                aria-hidden="true"
                layoutId={`segmented-tabs-${groupId}`}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 450, damping: 35 }}
                className="absolute inset-0 rounded-md border border-zinc-700/50 bg-zinc-800 shadow-sm"
              />
            ) : null}
            <span className="relative z-10 flex items-center justify-center gap-1.5 whitespace-nowrap">
              {tab.label}
              {tab.badge === undefined ? null : (
                <span
                  className={`rounded px-1.5 font-mono text-[10px] leading-5 ${isActive ? "border border-emerald-800/50 bg-emerald-950/80 text-emerald-300" : "bg-zinc-900 text-zinc-500"}`}
                >
                  {tab.badge}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
