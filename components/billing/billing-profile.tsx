"use client";

import { CreditCard, Lock } from "lucide-react";
import { useState, useTransition } from "react";
import { createStripePaymentMethodSetupLink } from "@/app/actions/accountActions";
import { saveCompanyBillingDetails } from "@/app/actions/enterpriseActions";
import type { BillingDetails } from "@/lib/enterprise-rules";

type PaymentMethod = { brand: string; last4: string; expMonth: number; expYear: number } | null;

const inputClass = "mt-1.5 h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-600";
const labelClass = "block font-mono text-[11px] uppercase tracking-wider text-zinc-500";

function brandLabel(brand: string) {
  const names: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover", jcb: "JCB", diners: "Diners Club", unionpay: "UnionPay" };
  return names[brand] || brand.charAt(0).toUpperCase() + brand.slice(1);
}

export function PaymentMethodCard({ method, unavailable, setupResult }: { method: PaymentMethod; unavailable?: boolean; setupResult?: string }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function update() {
    setMessage("");
    startTransition(async () => {
      const result = await createStripePaymentMethodSetupLink(undefined, "billing");
      if (!result.ok) return setMessage(result.message);
      window.location.assign(result.url);
    });
  }
  return (
    <section className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-100">Payment Method</h3>
        <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Stripe</span>
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3.5">
        <span className="flex h-8 w-11 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900"><CreditCard className="size-4 text-zinc-400" /></span>
        {method ? (
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-100">
              <span className="font-medium">{brandLabel(method.brand)}</span>
              <span className="font-mono text-zinc-300">•••• {method.last4}</span>
              <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-400">Default</span>
            </p>
            <p className="mt-0.5 font-mono text-xs text-zinc-500">Expires {String(method.expMonth).padStart(2, "0")}/{String(method.expYear).slice(-2)}</p>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-300">{unavailable ? "Card details are temporarily unavailable" : "No default card on file"}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{unavailable ? "Stripe could not be reached. Try again shortly." : "Add a card to fund cohort escrow at launch."}</p>
          </div>
        )}
      </div>
      {setupResult === "success" ? <p className="mt-3 text-xs text-emerald-400" role="status">Card saved. Stripe may take a few seconds to confirm it as your default.</p> : null}
      {setupResult === "cancelled" ? <p className="mt-3 text-xs text-zinc-400" role="status">Card update cancelled. No changes were made.</p> : null}
      {message ? <p className="mt-3 text-xs text-red-300" role="alert">{message}</p> : null}
      <div className="mt-auto pt-5">
        <button type="button" onClick={update} disabled={pending} className="inline-flex h-8 items-center rounded-lg border border-zinc-700 px-3 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800/60 disabled:opacity-50">
          {pending ? "Opening Stripe…" : method ? "Update Payment Method" : "Add Payment Method"}
        </button>
        <p className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-zinc-500"><Lock className="size-3" />Payments processed securely via Stripe. SeedEnv never stores card numbers.</p>
      </div>
    </section>
  );
}

export function BillingInfoForm({ initial }: { initial: BillingDetails }) {
  const [details, setDetails] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const field = (name: keyof BillingDetails, label: string, options: { limit: number; required?: boolean; type?: string; placeholder?: string; className?: string }) => (
    <label className={options.className}>
      <span className={labelClass}>{label}{options.required ? null : <span className="normal-case tracking-normal text-zinc-600"> (optional)</span>}</span>
      <input name={name} type={options.type || "text"} required={options.required} maxLength={options.limit} placeholder={options.placeholder} value={details[name]} onChange={(event) => setDetails((current) => ({ ...current, [name]: event.target.value }))} className={inputClass} />
    </label>
  );
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-100">Billing Information</h3>
        <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Printed on receipts</span>
      </div>
      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          startTransition(async () => {
            const result = await saveCompanyBillingDetails(details);
            setMessage(result.ok ? { ok: true, text: "Billing info saved. New receipts will use these details." } : { ok: false, text: result.message });
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {field("companyName", "Company / Entity Name", { limit: 150, required: true, className: "sm:col-span-2" })}
          {field("taxId", "Tax ID / VAT", { limit: 80 })}
          {field("billingEmail", "Billing Contact Email", { limit: 254, type: "email", placeholder: "billing@company.com" })}
          {field("addressLine1", "Address", { limit: 200, required: true, className: "sm:col-span-2" })}
          {field("addressLine2", "Address Line 2", { limit: 200, className: "sm:col-span-2" })}
          {field("city", "City", { limit: 100, required: true })}
          {field("region", "State / Region", { limit: 100 })}
          {field("postalCode", "Postal Code", { limit: 30, required: true })}
          {field("country", "Country Code", { limit: 2, required: true, placeholder: "US" })}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="inline-flex h-8 items-center rounded-lg bg-white px-3.5 text-xs font-semibold text-zinc-950 transition-all hover:bg-zinc-200 disabled:opacity-50">{pending ? "Saving…" : "Save Billing Info"}</button>
          {message ? <p className={`text-xs ${message.ok ? "text-emerald-400" : "text-red-300"}`} role="status">{message.text}</p> : null}
        </div>
      </form>
    </section>
  );
}
