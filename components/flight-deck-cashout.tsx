"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { releasePendingTesterPayouts } from "@/app/actions/submissionActions";

export function FlightDeckCashout({ readyCents, stripeConnected }: { readyCents: number; stripeConnected: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const buttonClass = "mt-3 inline-flex w-full items-center justify-center rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500";

  if (!stripeConnected) {
    return <Link className={buttonClass} href="/account?tab=portfolio#stripe-setup">{readyCents > 0 ? "Connect Stripe to cash out" : "Set up Stripe Express"}</Link>;
  }

  return (
    <>
      <button className={buttonClass} disabled={readyCents <= 0 || isPending} type="button" onClick={() => {
        setMessage("");
        startTransition(async () => {
          try {
            const result = await releasePendingTesterPayouts();
            if (!result.ok) {
              setMessage(result.message);
              return;
            }
            const summary = result.releasedCount
              ? `Sent ${result.releasedCount} payout${result.releasedCount === 1 ? "" : "s"} to your Stripe balance. Bank arrival follows your Stripe schedule.`
              : `${result.pendingCount} payout${result.pendingCount === 1 ? "" : "s"} still pending.`;
            setMessage([summary, ...result.failures.map((failure) => `${failure.message} Payout reference: ${failure.payoutId}`)].join(" "));
            router.refresh();
          } catch (error) {
            console.error("SeedEnv cash out request failed:", error);
            setMessage("The payout response could not be confirmed. Refresh your ledger before retrying, or contact SeedEnv support.");
          }
        });
      }}>{isPending ? "Sending…" : "Cash Out via Stripe Express"}</button>
      {message ? <p className="mt-2 text-[11px] leading-4 text-zinc-400" role="status">{message}</p> : null}
    </>
  );
}
