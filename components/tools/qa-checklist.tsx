"use client";

import { useState } from "react";
import { ListChecks } from "lucide-react";
import { CopyTextButton } from "@/components/ui/copy-text-button";
import { ToolHandoff } from "@/components/tools/tool-handoff";
import { checklistMarkdown, qaChecklistGroups, toolUrlSchema, type ChecklistGroup } from "@/lib/organic-growth";

export function QaChecklist() {
  const [input, setInput] = useState("");
  const [groups, setGroups] = useState<ChecklistGroup[]>(["core", "auth", "mobile"]);
  const [result, setResult] = useState<{ url: string | null; groups: ChecklistGroup[] } | null>(null);
  const [error, setError] = useState("");
  function generate(value: string, selected: ChecklistGroup[]) {
    if (!selected.length) { setError("Select at least one testing area."); return; }
    const parsed = value.trim() ? toolUrlSchema.safeParse(value) : null;
    if (parsed && !parsed.success) { setError(parsed.error.issues[0].message); return; }
    setError("");
    setResult({ url: parsed?.success ? parsed.data : null, groups: selected });
  }
  return <>
    <form onSubmit={(event) => { event.preventDefault(); generate(input, groups); }} className="rounded-2xl border border-white/[0.08] bg-[#171923]/70 p-5">
      <label htmlFor="checklist-url" className="text-sm font-medium">App URL <span className="font-normal text-zinc-500">(optional)</span></label>
      <input id="checklist-url" value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} placeholder="https://your-app.com" inputMode="url" className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 font-mono text-sm outline-none focus:border-emerald-400" />
      <fieldset className="mt-4"><legend className="text-sm text-zinc-400">Choose your testing areas</legend><div className="mt-2 flex flex-wrap gap-2">{(Object.keys(qaChecklistGroups) as ChecklistGroup[]).map((key) => <label key={key} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${groups.includes(key) ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-white/[0.08] text-zinc-400"}`}><input type="checkbox" checked={groups.includes(key)} onChange={() => setGroups((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])} className="accent-emerald-400" />{qaChecklistGroups[key].label}</label>)}</div></fieldset>
      {error ? <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p> : null}
      <div className="mt-5 flex flex-wrap items-center gap-4"><button className="min-h-11 rounded-lg bg-emerald-400 px-5 text-sm font-semibold text-zinc-950 hover:bg-emerald-300">Generate checklist</button><button type="button" className="min-h-11 text-xs text-emerald-300" onClick={() => { setInput("https://example.com"); setGroups(["core", "auth", "commerce", "mobile"]); generate("https://example.com", ["core", "auth", "commerce", "mobile"]); }}>Load sample demo</button><span className="text-xs text-zinc-500">Instant output. Nothing leaves your browser.</span></div>
    </form>
    {result ? <>
      <section className="mt-6 rounded-2xl border border-emerald-500/20 bg-zinc-950 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-semibold"><ListChecks className="size-5 text-emerald-400" /> Your release checklist</h2><CopyTextButton text={checklistMarkdown(result.url, result.groups)} label="Copy Markdown" /></div>
        <p className="mt-2 text-xs text-zinc-500">A testing plan, not a completed audit. Run every check before signing off.</p>
        <pre className="mt-4 whitespace-pre-wrap break-words rounded-xl border border-white/[0.08] bg-[#171923]/40 p-4 font-mono text-xs leading-7 text-zinc-300">{checklistMarkdown(result.url, result.groups)}</pre>
      </section>
      <ToolHandoff key={`${result.url}:${result.groups.join(",")}`} url={result.url} lead="Your QA plan is ready." />
    </> : <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-8 text-center"><ListChecks className="mx-auto size-8 text-zinc-600" /><p className="mt-3 text-sm text-zinc-400">Choose your release surface. Get a copy-ready checklist for your repo.</p></div>}
  </>;
}
