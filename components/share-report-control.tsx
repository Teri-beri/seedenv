"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Globe, LoaderCircle, LockKeyhole } from "lucide-react";
import { shareBugReport } from "@/app/actions/reportActions";
import { CopyTextButton } from "@/components/ui/copy-text-button";
import { StructuredBugFields } from "@/components/structured-bug-fields";
import { publicReportInputSchema, type StructuredBug } from "@/lib/organic-growth";
import { SITE_URL } from "@/lib/seo";

export type ShareReportDraft = {
  id: string;
  isPublic: boolean;
  title: string;
  severity: StructuredBug["severity"];
  summary: string;
  reproSteps: string[];
  includeMedia: boolean;
};

export function ShareReportControl({ submissionId, title, severity, reproSteps = [], summary, existing }: {
  submissionId: string; title?: string | null; severity?: StructuredBug["severity"] | null; reproSteps?: string[];
  summary: string | null; existing?: ShareReportDraft | null;
}) {
  const [report, setReport] = useState(existing ?? null);
  const [bug, setBug] = useState<StructuredBug | null>({ title: existing?.title || title || "", severity: existing?.severity || severity || "MAJOR", reproSteps: existing?.reproSteps || reproSteps });
  const [publicSummary, setPublicSummary] = useState(existing?.summary || summary || "");
  const [includeMedia, setIncludeMedia] = useState(existing?.includeMedia ?? false);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const publicUrl = report?.isPublic ? `${SITE_URL}/report/${report.id}` : null;
  function publish() {
    if (!consent) { setMessage("Review the public content and confirm it contains no confidential or personal data."); return; }
    const input = publicReportInputSchema.safeParse({ ...bug, reproSteps: bug?.reproSteps.filter((step) => step.trim()), summary: publicSummary, includeMedia });
    if (!input.success) { setMessage(input.error.issues[0].message); return; }
    startTransition(async () => {
      const result = await shareBugReport(submissionId, input.data);
      if (!result.ok) { setMessage(result.error); return; }
      setReport({ ...result.report, ...input.data });
      setMessage("Public, read-only report published. You can revoke the link at any time.");
    });
  }
  function revoke() {
    startTransition(async () => {
      const result = await shareBugReport(submissionId, null);
      if (!result.ok) { setMessage(result.error); return; }
      setReport((current) => current ? { ...current, isPublic: false, includeMedia: false } : null);
      setIncludeMedia(false);
      setConsent(false);
      setMessage("Sharing is off. The report and its media endpoints now return unavailable.");
    });
  }
  return <details className="mt-4 rounded-xl border border-white/[0.08] bg-zinc-950/60 p-3">
    <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-emerald-300"><Globe className="size-4" />Share Report<span className="ml-auto font-mono text-[10px] text-zinc-500">{publicUrl ? "PUBLIC" : "PRIVATE"}</span></summary>
    <p className="mb-4 mt-2 text-xs leading-5 text-zinc-400">Only the reviewed summary, reproduction steps, device specs and opted-in evidence become public. Tester identity, project access links, logs and payment data stay private. Published reports can appear in search results.</p>
    <StructuredBugFields value={bug} onChange={setBug} disabled={pending} />
    <label className="mt-3 block text-xs text-zinc-400">Public summary<textarea aria-label="Public bug summary" value={publicSummary} onChange={(event) => setPublicSummary(event.target.value)} maxLength={2000} rows={4} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-300 outline-none focus:border-emerald-400" /></label>
    <label className="mt-3 flex min-h-11 items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={includeMedia} onChange={(event) => setIncludeMedia(event.target.checked)} className="accent-emerald-400" />Include screenshots and recordings (review them for private data)</label>
    <label className="mt-2 flex min-h-11 items-start gap-2 text-xs leading-5 text-zinc-400"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 accent-emerald-400" />I have reviewed this content, have permission to publish it, and removed confidential and personal data.</label>
    <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" disabled={pending} role="switch" aria-checked={Boolean(publicUrl)} onClick={publicUrl ? revoke : publish} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-emerald-500/30 px-3 text-sm text-emerald-200 disabled:opacity-50">{pending ? <LoaderCircle className="size-4 animate-spin" /> : publicUrl ? <LockKeyhole className="size-4" /> : <Globe className="size-4" />}{publicUrl ? "Turn sharing off" : "Publish report"}</button>{publicUrl ? <button type="button" disabled={pending} onClick={publish} className="min-h-11 text-xs text-zinc-400">Update public snapshot</button> : null}</div>
    {publicUrl ? <div className="mt-4 space-y-3"><Link href={publicUrl} target="_blank" rel="noreferrer" className="block min-h-11 break-all font-mono text-xs text-emerald-300 underline">{publicUrl}</Link><CopyTextButton text={publicUrl} label="Copy Share Link" /></div> : null}
    {message ? <p role="status" className="mt-3 text-xs leading-5 text-amber-200">{message}</p> : null}
  </details>;
}
