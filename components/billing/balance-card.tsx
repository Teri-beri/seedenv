"use client";

import { Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { refundBalanceToCard, replaceReversedCampaignFunding, setAutoReload, startBalanceTopUp } from "@/app/actions/balanceActions";
import { AUTO_RELOAD_OPTIONS_CENTS, MAX_TOP_UP_CENTS, MIN_TOP_UP_CENTS, quoteTopUp } from "@/lib/pricing";
import { formatCents } from "@/lib/utils";

const PRESETS_CENTS = [2500, 5000, 10000, 25000];

type Withdrawal = { id: string; amountCents: number; status: string; createdAt: string };

export function BalanceCard({ balanceCents, autoReloadCents, pendingTopUps, withdrawals, heldCampaigns = [], hasCard, topUpResult, floridaTaxPolicyOnly = false }: { balanceCents: number; autoReloadCents: number; pendingTopUps: number; withdrawals: Withdrawal[]; heldCampaigns?: Array<{ id: string; title: string; billingHoldCents: number }>; hasCard: boolean; topUpResult?: string; floridaTaxPolicyOnly?: boolean }) {
  const router = useRouter();
  const [amountUsd, setAmountUsd] = useState("50");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [pending, startTransition] = useTransition();
  const creditCents = Math.round(Number(amountUsd) * 100);
  const validAmount = Number.isSafeInteger(creditCents) && creditCents >= MIN_TOP_UP_CENTS && creditCents <= MAX_TOP_UP_CENTS;
  const quote = validAmount ? quoteTopUp(creditCents) : null;

  function run(work: () => Promise<{ ok: boolean; message?: string; url?: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await work();
      if (result.ok && result.url) return window.location.assign(result.url);
      setMessage({ tone: result.ok ? "ok" : "error", text: result.message || (result.ok ? "Saved." : "Something went wrong.") });
      setConfirmRefund(false);
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100"><Wallet className="size-4 text-emerald-400" />Prepaid balance</h3>
          <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-zinc-50">{formatCents(balanceCents)}</p>
          <p className="mt-1 max-w-md text-xs text-zinc-500">Each accepted tester draws their reward plus the platform fee from this balance. No card charge per tester. Unused places come back here when a cohort ends, and you can refund the balance to your card any time.</p>
          {floridaTaxPolicyOnly ? <p className="mt-3 max-w-md text-xs leading-5 text-amber-300" role="note">Top-ups purchase stored-value credit with $0 tax. Testing purchases currently require a Florida billing address and an approved service-tax policy. If your billing address is elsewhere, contact support before adding funds; redemption is unavailable until that jurisdiction is configured.</p> : null}
        </div>
        <div className="w-full max-w-sm space-y-3">
          <fieldset>
            <legend className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Add funds</legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PRESETS_CENTS.map((cents) => (
                <button key={cents} type="button" onClick={() => setAmountUsd(String(cents / 100))} className={`h-8 rounded-lg border px-3 font-mono text-xs transition-colors ${creditCents === cents ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 text-zinc-300 hover:border-zinc-600"}`}>{formatCents(cents).replace(".00", "")}</button>
              ))}
              <label className="relative">
                <span className="sr-only">Custom amount in US dollars</span>
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-zinc-500">$</span>
                <input inputMode="decimal" value={amountUsd} onChange={(event) => setAmountUsd(event.target.value.replace(/[^0-9.]/g, ""))} className="h-8 w-24 rounded-lg border border-zinc-800 bg-zinc-950 pl-6 pr-2 font-mono text-xs text-zinc-100 outline-none focus:border-zinc-600" />
              </label>
            </div>
            {quote ? (
              <p className="mt-2 font-mono text-[11px] text-zinc-500">Card charged <span className="text-zinc-200">{formatCents(quote.totalCents)}</span>, all added to your balance. No processing or top-up fees.</p>
            ) : <p className="mt-2 font-mono text-[11px] text-amber-400">Enter {formatCents(MIN_TOP_UP_CENTS)}–{formatCents(MAX_TOP_UP_CENTS)}.</p>}
            <button type="button" disabled={pending || !quote} onClick={() => run(() => startBalanceTopUp(creditCents))} className="mt-2 inline-flex h-8 items-center rounded-lg bg-white px-3.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-zinc-200 disabled:opacity-50">{pending ? "Working…" : quote ? `Add ${formatCents(quote.creditCents)}` : "Add funds"}</button>
          </fieldset>
          <label className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Auto-reload</span>
            <select value={autoReloadCents} disabled={pending || (!hasCard && autoReloadCents === 0)} onChange={(event) => run(() => setAutoReload(Number(event.target.value)))} className="h-8 rounded-lg border border-zinc-800 bg-zinc-950 px-2 font-mono text-xs text-zinc-200 outline-none focus:border-zinc-600 disabled:opacity-50">
              <option value={0}>Off</option>
              {AUTO_RELOAD_OPTIONS_CENTS.map((cents) => <option key={cents} value={cents}>Add {formatCents(cents).replace(".00", "")} when short</option>)}
            </select>
            {!hasCard && autoReloadCents === 0 ? <span className="text-[11px] text-zinc-600">Available after your first top-up saves a card.</span> : null}
          </label>
        </div>
      </div>

      {topUpResult === "success" ? <p className="mt-4 text-xs text-emerald-400" role="status">Payment received. Your balance updates as soon as Stripe confirms it, usually within a few seconds; refresh if it hasn&apos;t changed yet.</p> : null}
      {topUpResult === "cancelled" ? <p className="mt-4 text-xs text-zinc-400" role="status">Top-up cancelled. Nothing was charged. A cohort waiting on this top-up returns to your drafts within about an hour.</p> : null}
      {pendingTopUps ? <p className="mt-2 font-mono text-[11px] text-zinc-500">{pendingTopUps} checkout{pendingTopUps === 1 ? "" : "s"} awaiting payment.</p> : null}
      {balanceCents < 0 ? <p className="mt-3 text-xs text-amber-300" role="alert">Funding debt: {formatCents(-balanceCents)}. A refund or chargeback removed backing already used for tester places. New funds first repay this debt; pay-per-tester payouts resume when it is covered.</p> : null}
      {heldCampaigns.length ? <div className="mt-3 space-y-2">
        {heldCampaigns.map((campaign) => <div key={campaign.id} className="flex flex-wrap items-center gap-2 text-xs text-amber-300">
          <span>{campaign.title}: {formatCents(campaign.billingHoldCents)} of escrow reversed or disputed. Payouts are held until replaced.</span>
          <button type="button" disabled={pending || balanceCents < campaign.billingHoldCents} onClick={() => run(() => replaceReversedCampaignFunding(campaign.id))} className="rounded-lg border border-amber-500/40 px-3 py-1.5 disabled:opacity-40">Replace from balance</button>
        </div>)}
      </div> : null}
      {message ? <p className={`mt-3 text-xs ${message.tone === "ok" ? "text-emerald-400" : "text-red-300"}`} role={message.tone === "ok" ? "status" : "alert"}>{message.text}</p> : null}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-4">
        {confirmRefund ? (
          <>
            <span className="text-xs text-zinc-300">Refund {formatCents(balanceCents)} to your card? It goes back to the cards you topped up with, newest first.</span>
            <button type="button" disabled={pending} onClick={() => run(refundBalanceToCard)} className="h-8 rounded-lg border border-red-500/40 px-3 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50">{pending ? "Refunding…" : "Confirm refund"}</button>
            <button type="button" disabled={pending} onClick={() => setConfirmRefund(false)} className="h-8 px-2 text-xs text-zinc-500 hover:text-zinc-200">Cancel</button>
          </>
        ) : (
          <button type="button" disabled={pending || (balanceCents <= 0 && !withdrawals.some((row) => row.status === "PENDING"))} onClick={() => withdrawals.some((row) => row.status === "PENDING") ? run(refundBalanceToCard) : setConfirmRefund(true)} className="h-8 rounded-lg border border-zinc-700 px-3 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800/60 disabled:opacity-40">{withdrawals.some((row) => row.status === "PENDING") ? "Reconcile pending refund" : "Refund balance to card"}</button>
        )}
        {withdrawals.length ? (
          <ul className="ml-auto space-y-0.5 text-right font-mono text-[11px] text-zinc-500">
            {withdrawals.slice(0, 3).map((row) => (
              <li key={row.id}>{new Date(row.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })} · {row.status === "PENDING" ? "reserved refund" : "refunded"} {formatCents(row.amountCents)}{row.status === "PENDING" ? " (processing/reconciliation)" : row.status === "FAILED" ? " (failed, kept in balance)" : ""}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
