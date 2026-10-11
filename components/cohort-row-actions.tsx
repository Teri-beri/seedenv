"use client";

import Link from "next/link";
import { EndCohortButton } from "@/components/end-cohort-button";
import { useDismissableMenu } from "@/components/use-dismissable-menu";

const itemClass = "block rounded-lg px-3 py-2 text-left transition-colors";

export function CohortRowActions({ campaignId, title, payPerTester }: { campaignId: string; title: string; payPerTester: boolean }) {
  const { open, setOpen, ref } = useDismissableMenu<HTMLDivElement>();
  return (
    <div className="flex items-center justify-end gap-2">
      <Link href={`/console/cohorts/${campaignId}/directions`} className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-white">
        Manage
      </Link>
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`More actions for ${title}`}
          onClick={() => setOpen(!open)}
          className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-2.5 py-1.5 font-mono text-xs leading-none text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
        >
          •••
        </button>
        {open ? (
          <div role="menu" className="absolute right-0 top-9 z-40 w-72 rounded-xl border border-zinc-800 bg-zinc-900 p-1 font-mono text-xs shadow-2xl shadow-black/50">
            <Link role="menuitem" href={`/console/cohorts/${campaignId}/directions`} onClick={() => setOpen(false)} className={`${itemClass} text-zinc-300 hover:bg-zinc-800/70 hover:text-white`}>Edit directions</Link>
            <Link role="menuitem" href={`/console/cohorts/${campaignId}/directions#history`} onClick={() => setOpen(false)} className={`${itemClass} text-zinc-300 hover:bg-zinc-800/70 hover:text-white`}>Instruction history</Link>
            <div className="my-1 h-px bg-zinc-800" />
            <div className="px-3 py-2">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-rose-400/80">Danger zone</p>
              <EndCohortButton campaignId={campaignId} title={title} payPerTester={payPerTester} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
