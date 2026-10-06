"use client";

import { Download, FileText, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { EscrowStatus, InvoiceLedgerRow } from "@/lib/billing";
import { formatCents } from "@/lib/utils";

const statusChip: Record<EscrowStatus, { label: string; className: string }> = {
  ESCROW_ACTIVE: { label: "Escrow Active", className: "border-amber-500/20 bg-amber-500/10 text-amber-400" },
  SETTLED: { label: "Settled", className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" },
  AWAITING_PAYMENT: { label: "Awaiting Payment", className: "border-zinc-700 bg-zinc-800/60 text-zinc-400" },
  FAILED: { label: "Failed", className: "border-red-500/20 bg-red-500/10 text-red-400" },
};

const dateInputClass = "h-8 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 font-mono text-xs text-zinc-300 outline-none transition-colors focus:border-zinc-600 [color-scheme:dark]";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function InvoiceTable({ invoices }: { invoices: InvoiceLedgerRow[] }) {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const day = invoice.date.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!needle) return true;
      return [invoice.cohortTitle, invoice.cohortId || "", invoice.invoiceNumber].some((value) => value.toLowerCase().includes(needle));
    });
  }, [invoices, query, from, to]);
  const filtering = Boolean(query || from || to);

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30">
      <div className="flex flex-col gap-3 border-b border-zinc-800 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Cohort Escrow Invoices</h3>
          <p className="mt-0.5 text-xs text-zinc-500">One receipt per funded cohort. PDF receipts are issued by TERIMUS LLC once Stripe confirms payment.</p>
        </div>
        {invoices.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <span className="sr-only">Search by cohort name or ID</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-600" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cohort or ID" className="h-8 w-48 rounded-lg border border-zinc-800 bg-zinc-950 pl-8 pr-2.5 text-xs text-zinc-200 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-600" />
            </label>
            <label className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-500">From<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className={dateInputClass} /></label>
            <label className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-500">To<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className={dateInputClass} /></label>
            {filtering ? <button type="button" onClick={() => { setQuery(""); setFrom(""); setTo(""); }} className="h-8 px-2 text-xs text-zinc-500 transition-colors hover:text-zinc-200">Clear</button> : null}
          </div>
        ) : null}
      </div>

      {!invoices.length ? (
        <div className="m-5 flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 p-10 text-center">
          <FileText className="mb-3 size-8 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-200">No billing history found</p>
          <p className="mt-1 max-w-md text-sm text-zinc-500">Funding receipts and escrow invoices will appear here once your first validation cohort is deployed.</p>
          <Link href="/console?view=new-drop" className="mt-5 inline-flex h-8 items-center rounded-lg bg-white px-3.5 text-xs font-semibold text-zinc-950 transition-all hover:bg-zinc-200">Deploy First Cohort</Link>
        </div>
      ) : !filtered.length ? (
        <p className="px-5 py-10 text-center text-sm text-zinc-500">No invoices match these filters.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="whitespace-nowrap border-b border-zinc-800 font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                <th className="px-5 py-2.5 font-medium">Invoice</th>
                <th className="px-3 py-2.5 font-medium">Cohort</th>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 text-right font-medium">Tester Pool</th>
                <th className="px-3 py-2.5 text-right font-medium">Fee</th>
                <th className="px-3 py-2.5 text-right font-medium">Total Charged</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 text-right font-medium"><span className="sr-only">Receipt</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {filtered.map((invoice) => {
                const chip = statusChip[invoice.escrowStatus];
                return (
                  <tr key={invoice.id} className="transition-colors hover:bg-zinc-900/60">
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-zinc-300">{invoice.invoiceNumber}</td>
                    <td className="max-w-[260px] px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-zinc-100">{invoice.cohortTitle}</span>
                        {invoice.platform ? <span className="shrink-0 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">{invoice.platform}</span> : null}
                      </div>
                      {invoice.cohortId ? <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-600">{invoice.cohortId}</p> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-zinc-400">{formatDate(invoice.date)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs text-zinc-300">{formatCents(invoice.testerPoolCents)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-xs text-zinc-500">{formatCents(invoice.feeCents)}{invoice.processingFeeCents ? <span className="block text-[10px] text-zinc-600">+{formatCents(invoice.processingFeeCents)} card</span> : null}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono text-sm font-semibold text-zinc-100">{formatCents(invoice.totalCents)}</td>
                    <td className="whitespace-nowrap px-3 py-3"><span className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${chip.className}`}>{chip.label}</span></td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      {invoice.downloadable ? (
                        <a href={`/api/billing/invoices/${invoice.id}`} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-zinc-800 px-2.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100" aria-label={`Download PDF receipt ${invoice.invoiceNumber}`}>
                          PDF <Download className="size-3" />
                        </a>
                      ) : <span className="font-mono text-[11px] text-zinc-600" title={invoice.escrowStatus === "AWAITING_PAYMENT" ? "Receipt available after Stripe confirms payment" : "Receipt unavailable for this record"}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
