"use client";

import { Check, Copy, TicketPercent } from "lucide-react";
import { useState } from "react";

export type LandingPlatformFeeOffer = { code: string; remaining: number; expiresAt: string };

export function LandingPlatformFeeOfferCard({ offer }: { offer: LandingPlatformFeeOffer }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(offer.code);
      setCopied(true);
      setError("");
    } catch {
      setError("Could not copy. Enter the code shown above in Budget.");
    }
  }
  return <aside aria-labelledby="platform-fee-offer-title" className="rounded-xl border border-emerald-400/25 bg-emerald-950/25 px-4 py-3 sm:px-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p id="platform-fee-offer-title" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-200">
        <TicketPercent aria-hidden="true" className="size-4 text-emerald-400" />
        <strong className="font-semibold text-emerald-300">{offer.remaining} redemption{offer.remaining === 1 ? "" : "s"} left:</strong>
        Use code
        <button type="button" onClick={() => { void copyCode(); }} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-emerald-400/30 bg-black/20 px-3 py-1 font-mono text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-950/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400" aria-label={`Copy promo code ${offer.code}`}>
          {offer.code} {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
        </button>
        for 0% SeedEnv platform fees.
      </p>
      <span className="font-mono text-[11px] text-zinc-400">Ends {new Date(offer.expiresAt).toISOString().slice(0, 10)} UTC</span>
    </div>
    {copied || error ? <p role="status" className="mt-2 text-xs text-emerald-200">{error || "Code copied. Apply it in the launch wizard."}</p> : null}
  </aside>;
}
