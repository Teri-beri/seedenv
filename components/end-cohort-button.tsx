"use client";

import { useState, useTransition } from "react";
import { endCohort } from "@/app/actions/campaignActions";

export function EndCohortButton({ campaignId, title, payPerTester }: { campaignId: string; title: string; payPerTester: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  if (message) return <p role="status" className="ml-auto max-w-[16rem] text-left text-[11px] leading-5 text-zinc-400">{message}</p>;
  if (!confirming) {
    return <button type="button" onClick={() => setConfirming(true)} className="rounded-md border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-red-500/40 hover:text-red-300">End cohort</button>;
  }
  return (
    <div className="ml-auto max-w-[16rem] space-y-2 text-left">
      <p className="text-[11px] leading-5 text-zinc-400">
        End <span className="text-zinc-200">{title}</span>? New applications close. {payPerTester ? "Paid places no tester is using go back to your prepaid balance (reward + platform fee)." : "Unused tester stipends are refunded; the platform fee is refunded only if no tester started."} Testers already working are still reviewed and paid.
      </p>
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => startTransition(async () => {
          const result = await endCohort(campaignId);
          setMessage(result.message);
        })} className="rounded-md bg-red-500/90 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50">{pending ? "Ending…" : payPerTester ? "End cohort" : "End & refund"}</button>
        <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="rounded-md border border-zinc-800 px-2.5 py-1 text-[11px] text-zinc-400">Keep running</button>
      </div>
    </div>
  );
}
