import { formatCents } from "@/lib/utils";

export function CheckoutSummaryModal({ testerBountyEscrowCents, basePlatformFeeCents, platformTakeRateCents, firstCohort, referralDiscountPercent }: {
  testerBountyEscrowCents: number; basePlatformFeeCents: number; platformTakeRateCents: number; firstCohort: boolean; referralDiscountPercent: number;
}) {
  return <section aria-label="Itemized cohort funding" className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
    <h3 className="text-sm font-semibold text-zinc-100">Itemized cohort funding</h3>
    <dl className="mt-3 space-y-2 text-sm">
      <div className="flex justify-between gap-3"><dt>Tester bounty escrow <span className="text-xs text-zinc-400">(100% to testers)</span></dt><dd className="font-mono text-emerald-300">{formatCents(testerBountyEscrowCents)}</dd></div>
      <div className="flex justify-between gap-3"><dt>Platform fee</dt><dd className="text-right font-mono">{platformTakeRateCents < basePlatformFeeCents ? <del className="mr-2 text-zinc-500">{formatCents(basePlatformFeeCents)}</del> : null}{formatCents(platformTakeRateCents)}</dd></div>
      <div className="flex justify-between gap-3"><dt>Payment &amp; escrow processing <span title="SeedEnv absorbs card processing until compliant credit-card-only surcharging is approved and available." className="cursor-help text-zinc-400">(currently absorbed)</span></dt><dd className="font-mono">$0.00</dd></div>
      <div className="flex justify-between gap-3 border-t border-zinc-800 pt-2"><dt>Maximum required escrow</dt><dd className="font-mono text-emerald-300">{formatCents(testerBountyEscrowCents + platformTakeRateCents)}</dd></div>
    </dl>
    {firstCohort ? <p className="mt-2 text-xs text-emerald-300">First Cohort 100% Off Applied</p> : referralDiscountPercent ? <p className="mt-2 text-xs text-emerald-300">Referral stack applied (up to 75% off platform fees).</p> : null}
    <p className="mt-3 text-xs text-zinc-400" title="Credits reduce only SeedEnv's servicing fee, never tester rewards or eligible payment processing.">Fee benefits never reduce guaranteed tester compensation. Custom cohorts draw funds only for accepted testers.</p>
  </section>;
}
