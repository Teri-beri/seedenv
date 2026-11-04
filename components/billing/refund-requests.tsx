"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { requestRefund } from "@/app/actions/refundActions";
import type { InvoiceLedgerRow } from "@/lib/billing";
import type { DeveloperRefundRequest } from "@/lib/billing-data";
import { refundReasonLabels, refundReasons, refundStatusLabels, type RefundReason } from "@/lib/refund-rules";
import { formatCents } from "@/lib/utils";

const field = "min-h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-600";
const statusTone: Record<string, string> = {
  OPEN: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  PROCESSING: "border-sky-500/20 bg-sky-500/10 text-sky-300",
  APPROVED: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  DENIED: "border-zinc-700 bg-zinc-800/60 text-zinc-400",
  FAILED: "border-red-500/20 bg-red-500/10 text-red-300",
};

export function RefundRequestDialog({ invoice, onClose }: { invoice: InvoiceLedgerRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState<RefundReason>("TESTER_QUALITY");
  const [amount, setAmount] = useState((invoice.totalCents / 100).toFixed(2));
  const [details, setDetails] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const firstField = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    start(async () => {
      const response = await requestRefund({ receiptId: invoice.id, reason, details, amountCents: Math.round(Number(amount) * 100) });
      if (response.ok) {
        setResult({ ok: true, text: "Request received. SeedEnv reviews refunds within 2 business days and will email you the decision." });
        router.refresh();
      } else setResult({ ok: false, text: response.message });
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="refund-dialog-title" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:p-8" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#09090b] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">{invoice.invoiceNumber}</p>
            <h2 id="refund-dialog-title" className="mt-1 text-lg font-semibold text-zinc-100">Request a refund</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 place-items-center rounded-lg text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-200"><X className="size-4" /></button>
        </div>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Unused escrow is returned automatically when a cohort ends, and unspent balance can be withdrawn from the balance card. Use this form for problems such as inadequate tester work or a billing error. A SeedEnv admin reviews every request. <Link href="/terms#refund-policy" className="text-emerald-300 underline-offset-2 hover:underline">Refund policy</Link>
        </p>
        {result?.ok ? (
          <p role="status" className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-sm text-emerald-200">{result.text}</p>
        ) : (
          <div className="mt-5 space-y-4">
            <label className="block space-y-1.5 text-xs text-zinc-400">What went wrong?
              <select ref={firstField} value={reason} onChange={(event) => setReason(event.target.value as RefundReason)} className={field}>
                {refundReasons.map((value) => <option key={value} value={value}>{refundReasonLabels[value]}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5 text-xs text-zinc-400">Amount (USD, up to {formatCents(invoice.totalCents)})
              <input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} className={`${field} font-mono`} />
            </label>
            <label className="block space-y-1.5 text-xs text-zinc-400">Details
              <textarea required minLength={30} maxLength={4000} rows={5} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Which testers or submissions, what was wrong, and what you expected. Include submission IDs if you have them." className={`${field} py-2`} />
            </label>
            {result ? <p role="alert" className="text-sm text-red-300">{result.text}</p> : null}
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-zinc-800 px-4 text-sm text-zinc-300 transition hover:border-zinc-600">{result?.ok ? "Done" : "Cancel"}</button>
          {result?.ok ? null : <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50">{pending ? "Submitting…" : "Submit request"}</button>}
        </div>
      </form>
    </div>
  );
}

export function RefundRequestList({ requests }: { requests: DeveloperRefundRequest[] }) {
  if (!requests.length) return null;
  return (
    <section aria-labelledby="refund-requests-heading" className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30">
      <div className="border-b border-zinc-800 px-5 py-4">
        <h3 id="refund-requests-heading" className="text-sm font-semibold text-zinc-100">Refund requests</h3>
        <p className="mt-0.5 text-xs text-zinc-500">Reviewed by SeedEnv within 2 business days. Decisions are also emailed to you. <Link href="/terms#refund-policy" className="text-zinc-300 underline-offset-2 hover:underline">Refund policy</Link></p>
      </div>
      <ul className="divide-y divide-zinc-800/70">
        {requests.map((request) => (
          <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm text-zinc-200">{formatCents(request.requestedCents)} · {refundReasonLabels[request.reason as RefundReason] ?? request.reason}</p>
              <p className="mt-0.5 font-mono text-[11px] text-zinc-600">{new Date(request.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} · {request.id}</p>
              {request.status === "APPROVED" && request.approvedCents ? <p className="mt-1 text-xs text-emerald-300">{formatCents(request.approvedCents)} returned {request.resolution === "CARD" ? "to your card (5–10 business days)" : "to your SeedEnv balance"}.</p> : null}
              {request.adminNote ? <p className="mt-1 text-xs text-zinc-400">{request.adminNote}</p> : null}
            </div>
            <span className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${statusTone[request.status] ?? statusTone.DENIED}`}>{refundStatusLabels[request.status] ?? request.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
