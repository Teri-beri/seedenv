"use client";

import { ChevronDown, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import type { SpecBlueprint } from "@/lib/ai/agents/spec-architect.agent";

const fieldClass = "w-full rounded-xl border border-zinc-800 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-zinc-500";

export function AiSpecDrafter({ platform, onApply }: { platform: "IOS" | "ANDROID" | "WEB"; onApply: (blueprint: SpecBlueprint) => void }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [audience, setAudience] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [devices, setDevices] = useState<string[]>([]);

  async function draft() {
    if (description.trim().length < 20) {
      setMessage({ tone: "error", text: "Describe the app in at least 20 characters." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/agent/generate-spec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawAppDescription: description, testFlightNotes: notes, targetAudience: audience, platform }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.blueprint) throw new Error(result.message || "The AI draft could not be generated right now.");
      const blueprint = result.blueprint as SpecBlueprint;
      onApply(blueprint);
      setDevices(blueprint.devicePills);
      setMessage({ tone: "ok", text: `Filled the title, brief and ${blueprint.taskPresets.length} tasks. Suggested: ${blueprint.recommendedTesters} testers × $${blueprint.recommendedBountyPerTester.toFixed(2)} (≈$${blueprint.recommendedBountyPool.toFixed(2)} reward pool). Review everything before launching.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "The AI draft could not be generated right now." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] md:col-span-2">
      <button aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left" onClick={() => setOpen((value) => !value)} type="button">
        <span className="flex items-center gap-2 text-sm font-semibold text-emerald-200"><Sparkles className="size-4" /> Draft this cohort with AI</span>
        <span className="flex items-center gap-2 text-xs text-zinc-500">Optional <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} /></span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-emerald-500/10 p-4">
          <p className="text-xs leading-5 text-zinc-400">Paste what your app does and what changed in this build. AI fills in the title, tester brief, tasks with acceptance criteria, and a suggested budget. Nothing is saved or charged until you launch.</p>
          <label className="block space-y-1.5 text-xs font-semibold text-zinc-300">
            What does the app do?
            <textarea className={`${fieldClass} min-h-24`} maxLength={4000} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. A meal-planning app that builds a weekly grocery list and orders through Instacart." value={description} />
          </label>
          <label className="block space-y-1.5 text-xs font-semibold text-zinc-300">
            Release notes / what to test <span className="font-normal text-zinc-500">(optional)</span>
            <textarea className={`${fieldClass} min-h-20`} maxLength={6000} onChange={(event) => setNotes(event.target.value)} placeholder="Paste your TestFlight “What to Test” notes or changelog." value={notes} />
          </label>
          <label className="block space-y-1.5 text-xs font-semibold text-zinc-300">
            Who are your users? <span className="font-normal text-zinc-500">(optional)</span>
            <input className={fieldClass} maxLength={300} onChange={(event) => setAudience(event.target.value)} placeholder="e.g. busy parents on iPhone" value={audience} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-60" disabled={busy} onClick={draft} type="button">
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? "Drafting…" : "Draft with AI"}
            </button>
            <span className="text-[11px] text-zinc-500">Overwrites the title, brief and tasks below.</span>
          </div>
          {message ? <p className={`text-xs leading-5 ${message.tone === "ok" ? "text-emerald-300" : "text-rose-300"}`} role="status">{message.text}</p> : null}
          {devices.length ? (
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Suggested test devices</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{devices.map((device) => <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-300" key={device}>{device}</span>)}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
