"use client";

import { ArrowRight, Check, Copy, TicketPercent } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { trackAnalytics } from "@/components/analytics-tracker";

export type LandingPlatformFeeOffer = { code: string; remaining: number; expiresAt: string };

export function LandingPlatformFeeOfferCard({ offer, href }: { offer: LandingPlatformFeeOffer; href: string }) {
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
  return <aside aria-labelledby="platform-fee-offer-title" className="relative overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-950/60 via-[#101A1B] to-[#10141C] p-5 sm:p-7">
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-2xl">
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-emerald-300"><TicketPercent aria-hidden="true" className="size-4" /> Developer launch offer</p>
        <h2 id="platform-fee-offer-title" className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Your next cohort. Zero platform fees.</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-300">Get <strong className="text-emerald-300">100% off SeedEnv platform fees</strong> with <span className="font-mono text-white">{offer.code}</span>. Put your budget toward tester rewards, not our fee.</p>
        <p className="mt-2 text-xs leading-5 text-zinc-400">{offer.remaining} redemption{offer.remaining === 1 ? "" : "s"} available when this page loaded. Ends {new Date(offer.expiresAt).toISOString().slice(0, 10)} (UTC), or when fully reserved.</p>
      </div>
      <div className="flex shrink-0 flex-col gap-3 sm:min-w-52">
        <button type="button" onClick={() => { void copyCode(); }} className="inline-flex min-h-11 items-center justify-center gap-3 rounded-lg border border-emerald-400/30 bg-black/20 px-4 py-3 font-mono text-sm text-emerald-200 hover:bg-emerald-950/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400" aria-label={`Copy promo code ${offer.code}`}>
          {offer.code} {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
        </button>
        <Link href={href} onClick={() => trackAnalytics("cta_click", { action: "Landing platform fee offer", code: offer.code, callbackUrl: "/console?view=new-drop" })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950">Launch with zero fees <ArrowRight aria-hidden="true" className="size-4" /></Link>
        {copied || error ? <p role="status" className="text-xs text-emerald-200">{error || "Code copied. Apply it in Budget."}</p> : null}
      </div>
    </div>
    <p className="mt-5 border-t border-emerald-400/10 pt-4 text-xs leading-5 text-zinc-400">Enter the code in the launch wizard&apos;s Budget step before launching. One paid cohort per developer with this code. Tester rewards must still be funded in full. Not valid for Clippers or combinable with other discounts. Availability is confirmed at launch.</p>
  </aside>;
}
