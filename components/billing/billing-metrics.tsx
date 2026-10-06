import type { BillingMetricsData } from "@/lib/billing";
import { SEEDENV_PLATFORM_FEE_PERCENT } from "@/lib/pricing";
import { formatCents } from "@/lib/utils";

function plural(count: number, word: string) {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;
}

export function BillingMetrics({ metrics }: { metrics: BillingMetricsData }) {
  const cards = [
    { label: "Active Escrow Committed", value: formatCents(metrics.activeEscrowCents), detail: `Locked in ${plural(metrics.activeCohorts, "active cohort")}` },
    { label: "Settled Payouts", value: formatCents(metrics.settledPayoutsCents), detail: `${plural(metrics.validatorsPaid, "approved validator task")}` },
    { label: `Platform Fees (${Math.round(SEEDENV_PLATFORM_FEE_PERCENT * 100)}%)`, value: formatCents(metrics.platformFeesCents), detail: "On confirmed escrow deposits" },
    { label: "Awaiting Payment", value: formatCents(metrics.awaitingPaymentCents), detail: metrics.awaitingPaymentCount ? `${plural(metrics.awaitingPaymentCount, "checkout")} not yet confirmed` : "No unconfirmed checkouts" },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">{card.label}</p>
          <p className="mt-2 font-mono text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">{card.value}</p>
          <p className="mt-1 text-xs text-zinc-500">{card.detail}</p>
        </div>
      ))}
    </div>
  );
}
