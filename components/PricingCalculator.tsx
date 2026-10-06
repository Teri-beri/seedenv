"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { COHORT_BUNDLES, COHORT_MIN_PLATFORM_FEE_CENTS, COHORT_PLATFORM_FEE_RATE, isBundleType, projectPerTesterCharges, quoteCampaignFunding, type CohortTypeKey } from "@/lib/pricing";
import { formatCents } from "@/lib/utils";

const tabs: Array<{ type: CohortTypeKey; label: string; price: string }> = [
  { type: "STANDARD_QA", label: "Custom Mission Drop", price: "Pay per tester" },
  { type: "GOOGLE_PLAY_14_DAY", label: "Google Play 14-Day", price: "$199 flat" },
  { type: "LIVE_STRESS_DROP", label: "Flash Concurrency", price: "$349 flat" },
];

const minFeeUsd = COHORT_MIN_PLATFORM_FEE_CENTS / 100;
const feePercent = COHORT_PLATFORM_FEE_RATE * 100;

// Keeps sign-in redirects intact while carrying the chosen cohort type into the launch wizard.
export function cohortLaunchHref(baseHref: string, type: CohortTypeKey) {
  if (type === "STANDARD_QA") return baseHref;
  const target = `/console?view=new-drop&cohort=${type}`;
  if (baseHref.startsWith("/console")) return target;
  if (baseHref.startsWith("/auth/signin")) return `/auth/signin?role=DEVELOPER&callbackUrl=${encodeURIComponent(target)}`;
  return baseHref;
}

export function PricingCalculator({ href }: { href: string }) {
  const [type, setType] = useState<CohortTypeKey>("STANDARD_QA");
  const [validators, setValidators] = useState(25);
  const [stipend, setStipend] = useState(6);
  const bundle = isBundleType(type) ? COHORT_BUNDLES[type] : null;
  const quote = quoteCampaignFunding(validators * stipend, type);
  const feeCents = Math.round(quote.platformFeeUsd * 100);
  const floorApplied = !bundle && feeCents === COHORT_MIN_PLATFORM_FEE_CENTS;
  const perTester = projectPerTesterCharges(validators, Math.round(stipend * 100));

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
      <div className="grid grid-cols-3 border-b border-zinc-800" role="tablist" aria-label="Pricing options">
        {tabs.map((tab) => (
          <button aria-selected={type === tab.type} className={`min-h-14 border-b-2 px-2 py-2 text-left transition-colors sm:px-4 ${type === tab.type ? "border-emerald-400 bg-zinc-900/60 text-zinc-100" : "border-transparent text-zinc-400 hover:text-zinc-200"}`} key={tab.type} onClick={() => setType(tab.type)} role="tab" type="button">
            <span className="block text-xs font-semibold sm:text-sm">{tab.label}</span>
            <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider text-zinc-500 sm:text-[11px]">{tab.price}</span>
          </button>
        ))}
      </div>

      <div className="p-5 sm:p-6" role="tabpanel">
        {bundle ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="font-mono text-xs uppercase tracking-wider text-zinc-400">{bundle.name}</div>
              <div className="font-mono text-2xl font-semibold text-zinc-100">{formatCents(bundle.totalCents)}<span className="ml-1 text-xs font-normal text-zinc-500">flat</span></div>
            </div>
            <div className="mt-3 text-sm leading-6 text-zinc-400">{bundle.summary}</div>
            <ul className="mt-4 space-y-2 text-sm text-zinc-300">
              {bundle.features.map((feature) => <li className="flex gap-2" key={feature}><Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />{feature}</li>)}
            </ul>
          </>
        ) : (
          <div className="space-y-5">
            <RangeField id="pricing-validators" label="Testers" max={500} min={5} step={1} value={validators} display={`${validators}`} onChange={setValidators} />
            <RangeField id="pricing-stipend" label="Reward per tester" max={100} min={1} step={0.5} value={stipend} display={formatCents(Math.round(stipend * 100))} onChange={setStipend} />
          </div>
        )}

        {bundle ? (
          <dl className="mt-6 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 border-t border-zinc-800 pt-5 text-sm">
            <dt className="text-zinc-400">Tester reward pool ({bundle.slots} × {formatCents(bundle.bountyCents)})</dt>
            <dd className="text-right font-mono text-emerald-400">{formatCents(Math.round(quote.payoutPoolUsd * 100))}</dd>
            <dt className="text-zinc-400">Platform fee (flat)</dt>
            <dd className="text-right font-mono text-zinc-200">{formatCents(feeCents)}</dd>
            <dt className="border-t border-zinc-800 pt-3 font-medium text-zinc-100">Total due at checkout</dt>
            <dd className="border-t border-zinc-800 pt-3 text-right font-mono font-medium text-zinc-100">{formatCents(quote.escrowTotalCents)}</dd>
          </dl>
        ) : (
          <dl className="mt-6 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 border-t border-zinc-800 pt-5 text-sm">
            <dt className="text-zinc-400">Due at launch</dt>
            <dd className="text-right font-mono text-emerald-400">$0.00</dd>
            <dt className="text-zinc-400">Each accepted tester</dt>
            <dd className="text-right font-mono text-zinc-200">{formatCents(perTester.typicalCharge?.totalCents || 0)}</dd>
            <dt className="text-zinc-500">· Rewards if all fill ({validators} × {formatCents(Math.round(stipend * 100))})</dt>
            <dd className="text-right font-mono text-zinc-400">{formatCents(perTester.stipendCents)}</dd>
            <dt className="text-zinc-500">· {floorApplied ? `Platform fee ($${minFeeUsd} minimum)` : `Platform fee (${feePercent}%)`}</dt>
            <dd className="text-right font-mono text-zinc-400">{formatCents(perTester.platformFeeCents)}</dd>
            <dt className="text-zinc-500">· Card processing (2.9% + 30¢ per charge)</dt>
            <dd className="text-right font-mono text-zinc-400">{formatCents(perTester.processingFeeCents)}</dd>
            <dt className="border-t border-zinc-800 pt-3 font-medium text-zinc-100">Maximum if every place fills</dt>
            <dd className="border-t border-zinc-800 pt-3 text-right font-mono font-medium text-zinc-100">{formatCents(perTester.maxTotalCents)}</dd>
          </dl>
        )}
        <div className="mt-3 text-xs leading-5 text-zinc-500">
          {bundle?.type === "GOOGLE_PLAY_14_DAY"
            ? "SeedEnv cannot guarantee Google's production-access decision; the refund covers tester retention only."
            : bundle
              ? "The live session time is agreed in your cohort brief. Testers join from their own devices and networks."
              : `Launch free with a saved card. You're charged only when you accept a tester; the $${minFeeUsd} minimum fee is collected on the first one. Unused paid places are refunded when the cohort ends (card processing excepted).`}
        </div>
        <Link className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-white" href={cohortLaunchHref(href, type)}>
          {bundle ? `Start ${bundle.shortName}` : "Deploy a Cohort"} <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

function RangeField({ id, label, min, max, step, value, display, onChange }: { id: string; label: string; min: number; max: number; step: number; value: number; display: string; onChange: (value: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm"><label className="text-zinc-300" htmlFor={id}>{label}</label><span className="font-mono text-zinc-100">{display}</span></div>
      <input className="mt-2 min-h-11 w-full accent-emerald-500" id={id} max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} step={step} type="range" value={value} />
    </div>
  );
}
