"use client";

import { bugSeverities, type StructuredBug } from "@/lib/organic-growth";

export function StructuredBugFields({ value, onChange, disabled = false }: { value: StructuredBug | null; onChange: (value: StructuredBug | null) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled} className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
    <legend className="px-1 text-sm font-semibold text-zinc-200">Reproducible bug report</legend>
    <label className="flex min-h-11 items-center gap-3 text-sm text-zinc-300"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked ? { title: "", severity: "MAJOR", reproSteps: [] } : null)} className="size-4 accent-emerald-400" />I found a reproducible bug</label>
    {value ? <div className="mt-3 space-y-3">
      <label className="block text-xs text-zinc-400">Bug title<input aria-label="Bug title" maxLength={160} value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} placeholder="Checkout freezes after confirming payment" className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-200 outline-none focus:border-emerald-400" /></label>
      <label className="block text-xs text-zinc-400">Severity<select aria-label="Bug severity" value={value.severity} onChange={(event) => onChange({ ...value, severity: bugSeverities.find((severity) => severity === event.target.value) ?? "MAJOR" })} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-200">{bugSeverities.map((severity) => <option key={severity} value={severity}>{severity === "CRITICAL" ? "Critical - core flow blocked / data loss" : severity === "MAJOR" ? "Major - important feature broken" : "Minor - cosmetic / non-blocking"}</option>)}</select></label>
      <label className="block text-xs text-zinc-400">Steps to reproduce (one step per line)<textarea aria-label="Steps to reproduce" value={value.reproSteps.join("\n")} onChange={(event) => onChange({ ...value, reproSteps: event.target.value.split("\n") })} placeholder={"Open checkout\nConfirm a sandbox payment\nObserve the frozen loading screen"} maxLength={10000} rows={4} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs leading-6 text-zinc-200 outline-none focus:border-emerald-400" /></label>
      <p className="text-xs leading-5 text-zinc-500">Include expected and actual behavior in your feedback. At least two clear steps are required. Reports stay private unless the developer publishes a reviewed summary.</p>
    </div> : <p className="mt-2 text-xs leading-5 text-zinc-500">Leave this off for general UX feedback or a successful test run.</p>}
  </fieldset>;
}
