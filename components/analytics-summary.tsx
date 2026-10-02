import { BarChart3, Info, MousePointerClick, Users, Workflow } from "lucide-react";
import type { AnalyticsSummaryData } from "@/lib/analytics";
import { ReferrerFavicon } from "@/components/referrer-favicon";

export type { AnalyticsSummaryData } from "@/lib/analytics";

export function AnalyticsSummary({ data }: { data: AnalyticsSummaryData }) {
  return (
    <section className="luxury-panel rounded-2xl p-5" aria-labelledby="analytics-summary-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs uppercase tracking-[0.24em] text-amber-500">Site performance · last 30 days</p><h2 id="analytics-summary-title" className="mt-2 text-2xl font-black">Conversion signal</h2></div>
        <BarChart3 className="size-5 text-amber-500" />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Page views" value={data.pageViews} change={data.changes.pageViews} detail="Each tracked page load. Reloads and repeat visits can count more than once." icon={<BarChart3 className="size-4" />} />
        <Metric label="CTA clicks" value={data.ctaClicks} change={data.changes.ctaClicks} detail="Clicks on tracked primary calls to action, including repeated clicks from one visitor." icon={<MousePointerClick className="size-4" />} />
        <Metric label="Signup starts" value={data.signupStarts} change={data.changes.signupStarts} detail="Each time a visitor starts the signup flow. This is an event count, not a count of unique people." icon={<Workflow className="size-4" />} />
        <Metric label="Unique sessions" value={data.uniqueSessions} change={data.changes.uniqueSessions} detail="Distinct browser session IDs stored in sessionStorage during the 30-day period. A person may have multiple sessions." icon={<Users className="size-4" />} />
      </div>
      <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-zinc-950/45">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div><h3 className="text-sm font-semibold text-white">Top referrers</h3><p className="mt-1 text-xs text-zinc-500">Signup conversion is attributed by browser session.</p></div>
          <span className="text-xs text-zinc-500">Last 30 days</span>
        </div>
        {data.topReferrers.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="text-[10px] uppercase tracking-[0.12em] text-zinc-500"><tr><th className="px-4 py-2.5 font-semibold">Path</th><th className="px-4 py-2.5 text-right font-semibold">Hits</th><th className="px-4 py-2.5 text-right font-semibold">Signups</th><th className="px-4 py-2.5 text-right font-semibold">Conversion</th></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {data.topReferrers.map((item) => (
                  <tr className="text-zinc-300" key={`${item.host}${item.referrer}`}>
                    <td className="px-4 py-3"><div className="flex items-center gap-2.5"><ReferrerFavicon host={item.host} src={item.faviconUrl} /><div className="min-w-0"><p className="truncate font-mono text-zinc-100">{item.referrer}</p><p className="mt-0.5 truncate text-[10px] text-zinc-500">{item.host}</p></div></div></td>
                    <td className="px-4 py-3 text-right font-mono">{item.hits.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono">{item.conversions.toLocaleString()} / {item.sessions.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-amber-300">{item.conversionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="px-4 py-5 text-sm text-zinc-500">No referrer data yet.</p>}
      </div>
    </section>
  );
}

function Metric({ label, value, change, detail, icon }: { label: string; value: number; change: number | null; detail: string; icon: React.ReactNode }) {
  const changeLabel = change === null ? "New this week" : `${change > 0 ? "+" : ""}${change}% vs last week`;
  const trendColor = change === null || change > 0 ? "text-emerald-300" : change < 0 ? "text-rose-300" : "text-zinc-500";
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-950/55 p-4">
      <div className="flex items-center justify-between text-zinc-500">
        <span className="text-xs font-semibold uppercase tracking-[0.12em]">{label}</span>
        <span className="flex items-center gap-1.5" title={detail} aria-label={detail}>{icon}<Info className="size-3.5" /></span>
      </div>
      <p className="mt-2 font-mono text-2xl font-black text-white">{value.toLocaleString()}</p>
      <p className={`mt-2 text-xs font-semibold ${trendColor}`}>{changeLabel}</p>
    </div>
  );
}
