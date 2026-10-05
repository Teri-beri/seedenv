"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";
import { saveCompanyBillingDetails } from "@/app/actions/enterpriseActions";
import type { BillingDetails } from "@/lib/enterprise-rules";

export function CompanyBillingForm({ initial }: { initial: BillingDetails }) {
  const [details, setDetails] = useState(initial);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const fields = [
    ["companyName", "Company Name", 150, true], ["taxId", "Tax ID / VAT", 80, false],
    ["addressLine1", "Billing Address", 200, true], ["addressLine2", "Address Line 2", 200, false],
    ["city", "City", 100, true], ["region", "State / Region", 100, false],
    ["postalCode", "Postal Code", 30, true], ["country", "Country Code (e.g. US)", 2, true],
  ] as const;
  return <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); setMessage(""); startTransition(async () => { const result = await saveCompanyBillingDetails(details); setMessage(result.ok ? "Billing details saved for future receipts." : result.message); }); }}>
    <div className="grid gap-4 sm:grid-cols-2">{fields.map(([name, label, limit, required]) => <label key={name} className="text-sm text-zinc-300">{label}<input required={required} maxLength={limit} value={details[name]} onChange={(event) => setDetails((current) => ({ ...current, [name]: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-[#12161F] px-3 py-2 text-white outline-none focus:border-emerald-400" /></label>)}</div>
    <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"><Save className="size-4" />{pending ? "Saving..." : "Save Billing Details"}</button>
    {message ? <p className="text-sm text-zinc-300" role="status">{message}</p> : null}
  </form>;
}