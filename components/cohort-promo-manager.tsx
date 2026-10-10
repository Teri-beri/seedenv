"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCohortPromo, setCohortPromoEnabled } from "@/app/actions/cohortPromoActions";

export type ManagedCohortPromo = {
  id: string; code: string; discountPercent: number; maxRedemptions: number; reservedCount: number; expiresAt: string | null; enabled: boolean;
};

export function CohortPromoManager({ codes }: { codes: ManagedCohortPromo[] }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const field = "mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2";
  return <div className="space-y-6">
    <form className="grid gap-4 rounded-xl border border-zinc-800 p-5 sm:grid-cols-2" onSubmit={(event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const values = new FormData(form);
      startTransition(async () => {
        try {
          const result = await createCohortPromo({
            code: String(values.get("code")),
            discountPercent: Number(values.get("discountPercent")),
            maxRedemptions: Number(values.get("maxRedemptions")),
            expiresAt: new Date(String(values.get("expiresAt"))).toISOString(),
          });
          if (!result.ok) { setMessage(result.error); return; }
          form.reset();
          setMessage("Code created. Share it only with the developers you want to invite.");
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Could not create the promo code.");
        }
      });
    }}>
      <label>Code<input className={field} name="code" required minLength={3} maxLength={40} pattern={"[A-Za-z0-9][A-Za-z0-9_\\-]{2,39}"} placeholder="FIRSTDROP" /></label>
      <label>Platform fee discount (%)<input className={field} name="discountPercent" type="number" required min={1} max={100} defaultValue={50} /></label>
      <label>Total redemption cap<input className={field} name="maxRedemptions" type="number" required min={1} max={100000} defaultValue={50} /></label>
      <label>Expires at (your local time)<input className={field} name="expiresAt" type="datetime-local" required /></label>
      <p className="text-sm text-zinc-400 sm:col-span-2">100% waives the fee; 50% halves it, including the custom cohort minimum. One paid cohort per developer per code. Reservations count toward the cap, but unpaid reservations can move between that developer&apos;s cohorts. Successful payment locks the code. Rewards are never discounted. Codes cannot stack with permanent waivers. Existing reserved terms survive disablement or expiry; moving to a new cohort requires a valid code.</p>
      <button disabled={pending} className="rounded-lg bg-emerald-500 px-4 py-3 font-semibold text-black disabled:opacity-50" type="submit">{pending ? "Saving..." : "Create code"}</button>
    </form>
    {message ? <p role="status" className="text-sm text-amber-200">{message}</p> : null}
    <div className="space-y-3">{codes.map((code) => <article key={code.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 p-4">
      <div><h2 className="font-mono font-semibold">{code.code}</h2><p className="mt-1 text-sm text-zinc-400">{code.discountPercent}% off platform fees · {code.reservedCount}/{code.maxRedemptions} reserved · {code.expiresAt ? `Expires ${new Date(code.expiresAt).toLocaleString()}` : "Never expires"} · {code.enabled ? "Enabled" : "Disabled"}</p></div>
      <button type="button" disabled={pending} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm" onClick={() => {
        startTransition(async () => {
          try {
            const result = await setCohortPromoEnabled(code.id, !code.enabled);
            if (!result.ok) { setMessage(result.error); return; }
            setMessage("Code availability updated. Existing cohort discounts are unchanged."); router.refresh();
          }
          catch (error) { setMessage(error instanceof Error ? error.message : "Could not update the code."); }
        });
      }}>{code.enabled ? "Disable" : "Enable"}</button>
    </article>)}</div>
    {!codes.length ? <p className="text-sm text-zinc-400">No codes yet. No public discount is active until you create one.</p> : null}
  </div>;
}
