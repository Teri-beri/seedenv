"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCohortDirections } from "@/app/actions/instructionActions";

export function CohortDirectionsEditor({ campaignId, revision, directions }: {
  campaignId: string;
  revision: number;
  directions: Array<{ id: string; stepNumber: number; instructionTitle: string; instructionDetail: string }>;
}) {
  const router = useRouter();
  const [steps, setSteps] = useState(directions);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return <form onSubmit={(event) => {
    event.preventDefault();
    startTransition(async () => {
      try {
        const result = await saveCohortDirections({ campaignId, expectedRevision: revision, directions: steps.map(({ id, instructionTitle, instructionDetail }) => ({ id, instructionTitle, instructionDetail })) });
        setMessage(result.ok ? { ok: true, text: `Version ${result.revision} saved. Existing assignments keep their accepted directions.` } : { ok: false, text: result.error });
        if (result.ok) router.refresh();
      } catch {
        setMessage({ ok: false, text: "Directions could not be saved. Please reload and try again." });
      }
    });
  }} className="space-y-5">
    <p className="rounded-lg border border-emerald-500/30 p-4 text-sm text-emerald-200">Updated directions apply to new assignments. Existing testers remain covered by their accepted instruction version. Rewards, proof types, step order and funding terms cannot be changed here.</p>
    {steps.map((step) => <fieldset key={step.id} disabled={pending} className="space-y-3 rounded-lg border border-zinc-800 p-4">
      <legend className="px-2 text-sm">Step {step.stepNumber}</legend>
      <label className="block text-sm">Title<input required minLength={3} maxLength={90} value={step.instructionTitle} onChange={(event) => setSteps((items) => items.map((item) => item.id === step.id ? { ...item, instructionTitle: event.target.value } : item))} className="mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3" /></label>
      <label className="block text-sm">Directions<textarea required minLength={12} maxLength={900} rows={5} value={step.instructionDetail} onChange={(event) => setSteps((items) => items.map((item) => item.id === step.id ? { ...item, instructionDetail: event.target.value } : item))} className="mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3" /></label>
    </fieldset>)}
    {message ? <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-emerald-300" : "text-rose-300"}>{message.text}</p> : null}
    <button disabled={pending} className="rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-black disabled:opacity-50">{pending ? "Saving..." : `Save as version ${revision + 1}`}</button>
  </form>;
}
