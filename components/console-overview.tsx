import { PlatformType } from "@prisma/client";
import { Boxes } from "lucide-react";
import Link from "next/link";
import { formatCents } from "@/lib/utils";

export type ConsoleMetrics = {
  activeCohorts: number;
  runsInProgress: number;
  pendingAudits: number;
  verifiedValidators: number;
  escrowCommittedCents: number;
  platformFeePercent: number;
};

export type ConsoleCohort = {
  id: string;
  title: string;
  platform: PlatformType;
  totalBudgetUsd: number;
  totalSlots: number;
  claimedSlots: number;
  completedSlots: number;
  bountyPerTaskUsd: number;
};

const platformLabels: Record<PlatformType, string> = {
  [PlatformType.TESTFLIGHT]: "TestFlight",
  [PlatformType.PLAY_STORE]: "Play Console",
  [PlatformType.WEB_STAGING]: "Web staging",
};

function plural(count: number, one: string, many = `${one}s`) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

export function ConsoleMetricStrip({ metrics }: { metrics: ConsoleMetrics }) {
  const cards = [
    { label: "Active cohorts", value: metrics.activeCohorts.toLocaleString(), detail: `${plural(metrics.runsInProgress, "run")} in progress` },
    { label: "Pending audits", value: metrics.pendingAudits.toLocaleString(), detail: metrics.pendingAudits ? `${plural(metrics.pendingAudits, "submission")} awaiting review` : "All submissions cleared" },
    { label: "Verified validators", value: metrics.verifiedValidators.toLocaleString(), detail: "Testers with approved reports" },
    { label: "Escrow committed", value: formatCents(metrics.escrowCommittedCents), detail: `${Math.round(metrics.platformFeePercent * 100)}% fee · $15 min on custom drops` },
  ];
  return (
    <section aria-label="Console metrics" className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">{card.label}</p>
          <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-zinc-100">{card.value}</p>
          <p className="mt-1 truncate text-xs text-zinc-500">{card.detail}</p>
        </div>
      ))}
    </section>
  );
}

export function ActiveCohorts({ cohorts, total }: { cohorts: ConsoleCohort[]; total: number }) {
  return (
    <section aria-labelledby="active-cohorts-heading" className="mb-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="active-cohorts-heading" className="text-sm font-semibold text-zinc-100">
          Active Cohorts {total ? <span className="ml-1 font-mono text-xs font-normal text-zinc-500">{total}</span> : null}
        </h2>
        <Link href="/console?view=new-drop" className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white">
          + New Cohort Drop
        </Link>
      </div>
      {cohorts.length ? (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/40 font-mono text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-normal">Cohort</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Platform</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Slots filled</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Escrow locked</th>
                <th scope="col" className="px-4 py-2.5 text-right font-normal">Released</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {cohorts.map((cohort) => {
                const filledPercent = cohort.totalSlots ? Math.min(100, Math.round((cohort.claimedSlots / cohort.totalSlots) * 100)) : 0;
                const releasedUsd = Math.min(cohort.totalBudgetUsd, cohort.completedSlots * cohort.bountyPerTaskUsd);
                const lockedUsd = Math.max(0, cohort.totalBudgetUsd - releasedUsd);
                return (
                  <tr key={cohort.id} className="transition-colors hover:bg-zinc-900/40">
                    <td className="max-w-xs px-4 py-3">
                      <Link href="/console?view=review-deck" className="block truncate font-medium text-zinc-100 hover:underline">{cohort.title}</Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">{platformLabels[cohort.platform]}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${filledPercent}%` }} /></div>
                        <span className="font-mono text-xs text-zinc-400">{cohort.claimedSlots}/{cohort.totalSlots}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-zinc-200">${lockedUsd.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-emerald-400">${releasedUsd.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {total > cohorts.length ? <p className="border-t border-zinc-800 px-4 py-2.5 font-mono text-xs text-zinc-500">Showing {cohorts.length} of {total} active cohorts</p> : null}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 p-10 text-center">
          <Boxes aria-hidden className="mb-3 size-8 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-200">No cohorts currently deployed</p>
          <p className="mt-1 max-w-md text-sm leading-6 text-zinc-500">Deploy a TestFlight or Play Console build to start recruiting hardware nodes and collecting crash telemetry.</p>
          <Link href="/console?view=new-drop" className="mt-5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-950 transition-all hover:bg-zinc-200">Deploy First Cohort</Link>
        </div>
      )}
    </section>
  );
}
