import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { ownerPayoutPolicy, ownerPayoutsEnabled, recentOwnerPayouts, runOwnerPayout, type EarningsPlan } from "@/lib/owner-earnings";

export const dynamic = "force-dynamic";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function OwnerEarningsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");
  if (session.user.role !== "ADMIN") redirect("/");

  const policy = ownerPayoutPolicy();
  const [preview, history] = await Promise.all([
    runOwnerPayout({ dryRun: true }).then((run) => (run.outcome === "preview" ? run.plan : null)).catch((error: unknown) => (error instanceof Error ? error.message : "Could not read Stripe.")),
    recentOwnerPayouts(),
  ]);
  const plan: EarningsPlan | null = typeof preview === "string" ? null : preview;

  return (
    <main className="min-h-screen bg-[#0A0D12] px-4 py-8 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/admin" className="inline-flex min-h-11 items-center text-sm text-zinc-400">← Back to admin</Link>
        <header>
          <h1 className="text-2xl font-semibold">Owner earnings</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Every Friday after {policy.runHour}:00 New York time, SeedEnv pays your matured platform fees to your bank. Tester escrow, developer balances, refunds in progress, sales tax, fees from cohorts that ended less than {policy.holdDays} days ago, and a {policy.reservePercent}% dispute reserve always stay in Stripe.
          </p>
          <p className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs ${ownerPayoutsEnabled() ? "border-emerald-500/40 text-emerald-200" : "border-amber-500/40 text-amber-200"}`}>
            {ownerPayoutsEnabled() ? "Automatic Friday payouts are on" : "Automatic payouts are off (preview only)"}
          </p>
        </header>

        {typeof preview === "string" && <p className="rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-sm text-red-200">Preview unavailable: {preview}</p>}

        {plan && (
          <section className="rounded-2xl border border-[#1F2430] bg-[#0E1017] p-5">
            <h2 className="text-lg font-semibold">If payout ran right now</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Metric label="Would pay you" value={usd(plan.payoutCents)} tone="text-emerald-300" />
              <Metric label={`Move to tax savings (${policy.taxPercent}%)`} value={usd(plan.taxSetAsideCents)} tone="text-amber-300" />
              <Metric label="Yours to keep" value={usd(plan.keepCents)} tone="text-white" />
            </div>
            {plan.belowMinimum && <p className="mt-3 text-xs text-zinc-400">Below the {usd(policy.minimumCents)} minimum, so this week would be skipped and roll into the next.</p>}
            <dl className="mt-5 divide-y divide-[#1F2430] text-sm">
              <Row label="Stripe available balance" value={plan.availableCents} />
              <Row label="Stripe pending (not yet available)" value={plan.pendingStripeCents} muted />
              <Row label="Held for testers (escrow incl. pending payouts)" value={-plan.testerEscrowCents} />
              <Row label="Developer prepaid balances" value={-plan.developerBalancesCents} />
              <Row label="Clippers escrow" value={-plan.clipperEscrowCents} />
              <Row label="Refunds in progress" value={-plan.refundsInFlightCents} />
              <Row label="Sales tax collected (recent)" value={-plan.salesTaxCollectedCents} />
              <Row label={`Dispute/refund reserve (${policy.reservePercent}% of ${policy.reserveWindowDays}-day fees)`} value={-plan.reserveCents} />
              <Row label="Left after obligations" value={plan.balanceHeadroomCents} strong />
              <Row label="Matured fees earned (all time)" value={plan.maturedFeesCents} muted />
              <Row label="Already paid to you" value={-plan.previousOwnerPayoutsCents} muted />
              <Row label="Fee income not yet paid (after reserve)" value={plan.feeHeadroomCents} strong />
              <Row label={`Fees still inside the ${policy.holdDays}-day hold`} value={plan.immatureFeesCents} muted />
            </dl>
            <p className="mt-3 text-xs text-zinc-500">The payout is the smaller of the two bold lines, so it can never use money owed to testers or developers.</p>
          </section>
        )}

        <section className="rounded-2xl border border-[#1F2430] bg-[#0E1017] p-5">
          <h2 className="text-lg font-semibold">Payout history</h2>
          {history.length === 0 ? <p className="mt-3 text-sm text-zinc-400">No automated payouts yet.</p> : (
            <table className="mt-4 w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500"><tr><th className="py-2">Friday</th><th>Status</th><th className="text-right">Paid</th><th className="text-right">Tax set-aside</th></tr></thead>
              <tbody className="divide-y divide-[#1F2430]">
                {history.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2 font-mono">{row.weekKey}</td>
                    <td title={row.error ?? undefined}>{row.status}{row.error && row.status !== "SKIPPED" ? " ⚠" : ""}</td>
                    <td className="text-right font-mono">{usd(row.amountCents)}</td>
                    <td className="text-right font-mono">{usd(row.taxSetAsideCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <p className="text-xs text-zinc-500">The tax set-aside is an estimate for federal income and self-employment tax, not tax advice. Confirm your percentage with an accountant.</p>
      </div>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-[#1F2430] bg-black/20 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: number; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-2 ${muted ? "text-zinc-500" : ""} ${strong ? "font-semibold text-white" : ""}`}>
      <dt>{label}</dt>
      <dd className="font-mono">{value < 0 ? `−${usd(-value)}` : usd(value)}</dd>
    </div>
  );
}
