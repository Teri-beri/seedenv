import Link from "next/link";

type CompliancePing = { dayNumber: number; validatorId: string; deviceModel: string; osVersion: string };

export function GooglePlayComplianceCard({ cohortId, targetDays = 14, requiredTesters = 12, status, pings, demo = false }: { cohortId: string; targetDays?: number; requiredTesters?: number; status: string; pings: CompliancePing[]; demo?: boolean }) {
  const testerCountByDay = new Map<number, number>();
  for (let day = 1; day <= targetDays; day += 1) {
    testerCountByDay.set(day, new Set(pings.filter((ping) => ping.dayNumber === day).map((ping) => ping.validatorId)).size);
  }
  const coveredDays = [...testerCountByDay.values()].filter((count) => count >= requiredTesters).length;
  const activeDevices = new Set(pings.map((ping) => `${ping.validatorId}:${ping.deviceModel}`)).size;
  const zeroLapsedDays = coveredDays === targetDays;
  const ready = demo || zeroLapsedDays;
  const progress = Math.round((coveredDays / targetDays) * 100);
  return (
    <section className="rounded-xl border border-emerald-900/60 bg-zinc-950/80 p-5" aria-label="Google Play 14-day compliance">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-mono text-[11px] uppercase tracking-wider text-emerald-400">Google Play 14-Day Audit Kit</p><h2 className="mt-1 text-lg font-semibold text-zinc-100">Closed testing engagement</h2></div>
        <span className="rounded border border-zinc-800 px-2 py-1 font-mono text-[10px] uppercase text-zinc-400">{status.replaceAll("_", " ")}</span>
      </div>
      <div className="mt-5 flex items-end justify-between font-mono text-xs text-zinc-300"><span>Coverage {String(coveredDays).padStart(2, "0")} / {targetDays} days</span><span>{progress}%</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900"><div className="h-full rounded-full bg-emerald-400 transition-[width]" style={{ width: `${progress}%` }} /></div>
      <div className="mt-4 flex flex-wrap gap-2 font-mono text-[11px] text-zinc-400"><span className="rounded border border-zinc-800 px-2 py-1">{activeDevices} active devices</span><span className="rounded border border-zinc-800 px-2 py-1">{Math.max(0, activeDevices - requiredTesters)} buffer</span><span className={`rounded border px-2 py-1 ${zeroLapsedDays ? "border-emerald-900/60 text-emerald-400" : "border-amber-900/60 text-amber-300"}`}>{zeroLapsedDays ? "Zero lapsed days" : "Coverage gaps detected"}</span></div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link href={`/api/cohorts/${cohortId}/compliance-pdf`} className="inline-flex rounded-lg border border-emerald-900 bg-emerald-950/40 px-3 py-1.5 font-mono text-xs text-emerald-400 hover:bg-emerald-900/60">{ready ? "Export Play Console Audit PDF ↓" : "Download In-Progress Preview PDF ↓"}</Link>
        {!ready ? <p className="font-mono text-[11px] text-zinc-500">Preview only · final status requires {targetDays}/{targetDays} covered days.</p> : null}
      </div>
    </section>
  );
}
