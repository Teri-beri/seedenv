"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideRefund, repairPayout } from "@/app/actions/refundActions";
import type { StuckPayout } from "@/lib/payout-repair";
import { refundReasonLabels, refundStatusLabels, type RefundReason } from "@/lib/refund-rules";
import type { RefundQueueRow } from "@/lib/refunds";
import { formatCents } from "@/lib/utils";

const field = "min-h-11 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition-colors focus:border-zinc-600";
const statusTone: Record<string, string> = {
  OPEN: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  PROCESSING: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  APPROVED: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  DENIED: "border-zinc-700 bg-zinc-800/60 text-zinc-400",
  FAILED: "border-red-500/20 bg-red-500/10 text-red-300",
};

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function RefundCard({ request }: { request: RefundQueueRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [resolution, setResolution] = useState<"CARD" | "CREDIT">(request.cardEligible ? "CARD" : "CREDIT");
  const [amount, setAmount] = useState(dollars(request.requestedCents));
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const actionable = request.status === "OPEN" || request.status === "PROCESSING";

  const submit = (decision: "APPROVE" | "DENY") => start(async () => {
    setMessage(null);
    const amountCents = Math.round(Number(amount) * 100);
    const result = await decideRefund(decision === "DENY"
      ? { decision, requestId: request.id, note }
      : { decision, requestId: request.id, resolution, amountCents, note });
    setMessage(result.ok ? { ok: true, text: result.status === "APPROVED" ? "Refund approved and the developer was notified." : "Request updated." } : { ok: false, text: result.message });
    router.refresh();
  });

  return (
    <li className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-100">{formatCents(request.requestedCents)} · {refundReasonLabels[request.reason as RefundReason] ?? request.reason}</p>
          <p className="mt-1 truncate text-xs text-zinc-500">{request.developerEmail} · {new Date(request.createdAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC</p>
        </div>
        <span className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${statusTone[request.status] ?? statusTone.DENIED}`}>{refundStatusLabels[request.status] ?? request.status}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{request.details}</p>
      <dl className="mt-4 grid gap-2 font-mono text-[11px] text-zinc-500 sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="uppercase tracking-wider">Receipt</dt><dd className="text-zinc-300">{request.receiptType === "BALANCE_TOPUP" ? "Balance top-up" : "Cohort payment"} · {formatCents(request.receiptCents)}</dd></div>
        <div><dt className="uppercase tracking-wider">Cohort</dt><dd className="truncate text-zinc-300">{request.campaignTitle ? `${request.campaignTitle} (${request.campaignStatus})` : "—"}</dd></div>
        <div><dt className="uppercase tracking-wider">Auto-refunded</dt><dd className="text-zinc-300">{formatCents(request.campaignAutoRefundedCents)}</dd></div>
        <div><dt className="uppercase tracking-wider">Developer balance</dt><dd className="text-zinc-300">{formatCents(request.developerBalanceCents)}</dd></div>
      </dl>
      {request.status === "APPROVED" && request.approvedCents ? <p className="mt-3 text-xs text-emerald-300">{formatCents(request.approvedCents)} returned {request.resolution === "CARD" ? "to card" : "as balance credit"}.</p> : null}
      {request.adminNote ? <p className="mt-2 text-xs text-zinc-400">Note: {request.adminNote}</p> : null}

      {actionable ? (
        <div className="mt-5 space-y-3 border-t border-zinc-800 pt-4">
          {request.status === "PROCESSING" ? (
            <p className="text-xs text-sky-300">A card refund is processing. Retrying re-checks Stripe and never refunds twice.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-zinc-400">Destination
                <select value={resolution} onChange={(event) => setResolution(event.target.value as "CARD" | "CREDIT")} className={field}>
                  <option value="CARD" disabled={!request.cardEligible}>Original card{request.cardEligible ? "" : " (paid from balance)"}</option>
                  <option value="CREDIT">SeedEnv balance credit</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-400">Amount (USD)
                <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} className={`${field} w-32 font-mono`} />
              </label>
            </div>
          )}
          {request.status === "OPEN" ? (
            <label className="flex flex-col gap-1 text-xs text-zinc-400">Note to developer (required to decline)
              <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={2} className={`${field} py-2`} />
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => submit("APPROVE")} className="min-h-11 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-50">
              {pending ? "Working…" : request.status === "PROCESSING" ? "Retry card refund" : `Approve ${resolution === "CARD" ? "card refund" : "balance credit"}`}
            </button>
            {request.status === "OPEN" ? (
              <button type="button" disabled={pending} onClick={() => submit("DENY")} className="min-h-11 rounded-lg border border-zinc-700 px-4 text-sm text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-50">Decline</button>
            ) : null}
          </div>
        </div>
      ) : null}
      {message ? <p role="status" className={`mt-3 text-sm ${message.ok ? "text-emerald-300" : "text-red-300"}`}>{message.text}</p> : null}
    </li>
  );
}

function PayoutRow({ payout }: { payout: StuckPayout }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const repair = () => start(async () => {
    setMessage(null);
    const result = await repairPayout(payout.id);
    setMessage({ ok: result.ok, text: result.message });
    router.refresh();
  });
  return (
    <li className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-100">{formatCents(payout.amountCents)} to {payout.testerEmail ?? "unknown tester"}</p>
          <p className="mt-1 break-all font-mono text-[11px] text-zinc-500">{payout.id} · {payout.state} · attempt {payout.attempt}</p>
          {payout.error ? <p className="mt-1 text-xs text-zinc-400">{payout.error}</p> : null}
        </div>
        {payout.repairable ? (
          <button type="button" disabled={pending} onClick={repair} className="min-h-11 shrink-0 rounded-lg bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50">{pending ? "Checking Stripe…" : "Repair & retry payout"}</button>
        ) : (
          <span className="max-w-xs text-xs text-zinc-500">{payout.kind === "LEGACY_PAYOUT" ? "Legacy payout — reconcile manually in Stripe." : "Still inside Stripe's safe retry window; the tester can retry it."}</span>
        )}
      </div>
      {message ? <p role="status" className={`mt-3 text-sm ${message.ok ? "text-emerald-300" : "text-red-300"}`}>{message.text}</p> : null}
    </li>
  );
}

export function RefundsAdminPanel({ requests, payouts }: { requests: RefundQueueRow[]; payouts: StuckPayout[] }) {
  return (
    <div className="space-y-10">
      <section aria-labelledby="stuck-payouts-heading">
        <h2 id="stuck-payouts-heading" className="text-lg font-semibold text-zinc-100">Stuck tester payouts</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">Payouts whose Stripe outcome was never confirmed. Repair first searches Stripe for an existing transfer; it only retries when Stripe proves none was sent, so a tester can never be paid twice.</p>
        {payouts.length ? <ul className="mt-4 space-y-3">{payouts.map((payout) => <PayoutRow key={payout.id} payout={payout} />)}</ul>
          : <p className="mt-4 rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">No stuck payouts.</p>}
      </section>
      <section aria-labelledby="refund-queue-heading">
        <h2 id="refund-queue-heading" className="text-lg font-semibold text-zinc-100">Developer refund requests</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">Card refunds for a cohort payment open once the cohort ends and its automatic unused-escrow refund has settled; before then, use balance credit. Support refunds are funded by SeedEnv and do not claw back tester payouts.</p>
        {requests.length ? <ul className="mt-4 space-y-3">{requests.map((request) => <RefundCard key={request.id} request={request} />)}</ul>
          : <p className="mt-4 rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">No refund requests yet.</p>}
      </section>
    </div>
  );
}
