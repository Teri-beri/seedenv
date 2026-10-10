"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { availableDeveloperCredits, previewCohortPromo } from "@/app/actions/cohortPromoActions";

export type AppliedCohortPromo = { code: string; discountPercent: number };

export function CohortPromoInput({ code, waived, onCodeChange, onApplied, draftId, reserved = false }: {
  code: string; waived: boolean; onCodeChange: (code: string) => void; onApplied: (promo: AppliedCohortPromo | null) => void; draftId?: string; reserved?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [credits, setCredits] = useState<Array<AppliedCohortPromo & { state: string }>>([]);
  useEffect(() => {
    let active = true;
    availableDeveloperCredits().then((items) => { if (active) setCredits(items); }).catch(() => { if (active) setMessage("Could not load your referral credits. Refresh to try again."); });
    return () => { active = false; };
  }, []);
  const sequence = useRef(0);
  async function apply(value: string) {
    const request = ++sequence.current;
    onApplied(null);
    if (!value.trim() || waived) {
      setMessage("");
      setBusy(false);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const promo = await previewCohortPromo(value, draftId);
      if (request !== sequence.current) return;
      if (!promo.ok) {
        setMessage(promo.error);
        return;
      }
      onApplied(promo);
      setMessage(`${promo.code}: ${promo.discountPercent}% off the platform fee. Tester rewards are unchanged.`);
    } catch (error) {
      if (request !== sequence.current) return;
      setMessage(error instanceof Error ? error.message : "Could not validate this code. Try again.");
    } finally {
      if (request === sequence.current) setBusy(false);
    }
  }
  const validate = useEffectEvent(() => { void apply(code); });
  useEffect(() => {
    sequence.current += 1;
    const timer = setTimeout(() => validate(), 700);
    return () => { clearTimeout(timer); sequence.current += 1; };
  }, [code, waived, draftId]);

  return <fieldset className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
    <legend className="px-1 text-xs font-semibold text-zinc-300">Promo code</legend>
    <div className="flex gap-2">
      <input aria-label="Cohort promo code" autoComplete="off" maxLength={81} value={code} disabled={waived || reserved} onChange={(event) => {
        sequence.current += 1;
        onApplied(null);
        setMessage("");
        onCodeChange(event.target.value.toUpperCase());
      }} placeholder="Enter your code" className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-black/30 px-3 py-2 text-sm text-white disabled:opacity-50" />
      <button type="button" disabled={waived || busy || !code.trim()} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm disabled:opacity-50" onClick={() => { void apply(code); }}>{busy ? "Checking..." : "Apply"}</button>
      {code && !reserved ? <button type="button" className="px-2 text-xs underline" onClick={() => { onCodeChange(""); onApplied(null); setMessage(""); }}>Remove</button> : null}
    </div>
    {credits.length ? <div className="mt-3 space-y-2"><p className="text-xs text-emerald-300">Your referral credits: 50% off each, never expire. Use alone or stack with BUILD50 or another credit, up to 100% off platform fees.</p>{credits.map((credit) => <button key={credit.code} type="button" disabled={waived || reserved || code.split(",").includes(credit.code) || code.split(",").filter(Boolean).length >= 2} className="mr-2 rounded border border-emerald-500/30 p-2 text-xs disabled:opacity-50" onClick={() => { onApplied(null); onCodeChange([code.trim(), credit.code].filter(Boolean).join(",")); }}>Use {credit.code} - {credit.state}</button>)}</div> : null}
    {reserved ? <p className="mt-2 text-xs text-zinc-400">This draft keeps its reserved code. To move an unpaid reservation, enter the code in a new cohort instead.</p> : null}
    {waived ? <p className="mt-2 text-xs text-emerald-300">Your account already has a permanent full fee waiver. Codes do not stack with permanent waivers.</p> : <p className="mt-2 text-xs text-zinc-500">One paid cohort per code per developer. One public code plus a referral credit, or two referral credits, separated by a comma; total cannot exceed 100%. Applies only to platform fees. Reserved at launch, used after a successful launch top-up, bundle payment, or first tester debit. If unpaid, you can retry or move it to a new cohort; launching closes the previous unpaid checkout and returns that cohort to a draft.</p>}
    {message ? <p role="status" className="mt-2 text-xs text-zinc-300">{message}</p> : null}
  </fieldset>;
}
