"use client";

import { Check, ChevronDown, Copy, FileText, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Theme = { title: string; count: number; severity: "P0" | "P1" | "P2"; reproRate: number; rootCause?: string; devices?: string[] };

export type ReleaseReportRow = {
  campaignId: string;
  title: string;
  approvedCount: number;
  synthesis: {
    totalSubmissions: number;
    validBugsCount: number;
    p0Count: number;
    p1Count: number;
    p2Count: number;
    executiveSummary: string;
    clusteredThemesJson: unknown;
    githubMarkdownExport: string;
    updatedAt: Date | string;
  } | null;
};

const severityClass = { P0: "border-rose-500/40 bg-rose-500/10 text-rose-200", P1: "border-amber-500/40 bg-amber-500/10 text-amber-200", P2: "border-zinc-700 bg-zinc-900 text-zinc-300" };

function themes(value: unknown): Theme[] {
  return Array.isArray(value) ? value.filter((item): item is Theme => Boolean(item && typeof item === "object" && "title" in item && "severity" in item)) : [];
}

function ReportCard({ row }: { row: ReleaseReportRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const report = row.synthesis;

  async function generate(regenerate: boolean) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/agent/synthesize-campaign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId: row.campaignId, regenerate }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Could not generate the report.");
      setOpen(true);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate the report.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.githubMarkdownExport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Copy failed. Your browser blocked clipboard access.");
    }
  }

  return (
    <li className="rounded-xl border border-zinc-800 bg-zinc-950/40">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-100">{row.title}</p>
          {report ? (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
              {report.validBugsCount} issue{report.validBugsCount === 1 ? "" : "s"} from {report.totalSubmissions} reports
              {(["P0", "P1", "P2"] as const).map((level) => {
                const count = level === "P0" ? report.p0Count : level === "P1" ? report.p1Count : report.p2Count;
                return count ? <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[10px] ${severityClass[level]}`} key={level}>{level} {count}</span> : null;
              })}
            </p>
          ) : <p className="mt-1 text-xs text-zinc-500">{row.approvedCount} approved report{row.approvedCount === 1 ? "" : "s"} · no release report yet</p>}
        </div>
        <div className="flex items-center gap-2">
          {report ? (
            <button aria-expanded={open} className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-zinc-500" onClick={() => setOpen((value) => !value)} type="button">
              <FileText className="size-3.5" /> {open ? "Hide" : "View"} <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          ) : (
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-60" disabled={busy || row.approvedCount === 0} onClick={() => generate(false)} type="button">
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {busy ? "Generating…" : "Generate report"}
            </button>
          )}
        </div>
      </div>
      {message ? <p className="px-4 pb-3 text-xs text-rose-300" role="status">{message}</p> : null}
      {report && open ? (
        <div className="space-y-4 border-t border-zinc-800 p-4">
          <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">{report.executiveSummary}</p>
          {themes(report.clusteredThemesJson).length ? (
            <ol className="space-y-2">
              {themes(report.clusteredThemesJson).map((theme, index) => (
                <li className="rounded-lg border border-zinc-800 bg-black/20 p-3" key={`${theme.title}-${index}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[10px] ${severityClass[theme.severity] ?? severityClass.P2}`}>{theme.severity}</span>
                    <span className="text-sm font-semibold text-zinc-100">{theme.title}</span>
                    <span className="font-mono text-[11px] text-zinc-500">{theme.count} report{theme.count === 1 ? "" : "s"} · {Math.round(theme.reproRate * 100)}%</span>
                  </div>
                  {theme.rootCause ? <p className="mt-1 text-xs leading-5 text-zinc-400">{theme.rootCause}</p> : null}
                  {theme.devices?.length ? <p className="mt-1 text-[11px] text-zinc-500">{theme.devices.join(" · ")}</p> : null}
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-zinc-500">No defects were reported in the approved submissions.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-200" onClick={copy} type="button">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy GitHub markdown"}
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-zinc-500 disabled:opacity-60" disabled={busy} onClick={() => generate(true)} type="button">
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Regenerate
            </button>
            <span className="text-[11px] text-zinc-600">AI-generated from approved reports. Verify before scheduling work.</span>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function ReleaseReports({ rows }: { rows: ReleaseReportRow[] }) {
  if (!rows.length) return null;
  return (
    <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Ended cohorts</p>
      <h2 className="mt-1 text-lg font-semibold text-zinc-100">Release reports</h2>
      <p className="mt-1 text-sm text-zinc-400">Approved tester reports grouped into prioritised issues (P0–P2), ready to paste into GitHub or Linear.</p>
      <ul className="mt-4 space-y-2">{rows.map((row) => <ReportCard key={row.campaignId} row={row} />)}</ul>
    </section>
  );
}
