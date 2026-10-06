import Link from "next/link";
import { Info } from "lucide-react";
import type { AnalyticsBreakdownRow, AnalyticsRange, AnalyticsSummaryData } from "@/lib/analytics";
import { analyticsRanges } from "@/lib/analytics";
import { AnalyticsExclusionToggle } from "@/components/analytics-exclusion-toggle";
import { ReferrerFavicon } from "@/components/referrer-favicon";

export type { AnalyticsSummaryData } from "@/lib/analytics";

export type AnalyticsExclusionState = {
  browserExcluded: boolean;
  ip: string | null;
  ipExcluded: boolean;
};

const countryNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

function flag(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...[...code].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

function countryName(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return countryNames?.of(code) || code;
  } catch {
    return code;
  }
}

function formatMs(value: number | null) {
  if (value === null) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value}ms`;
}

function bucketLabel(iso: string, range: AnalyticsRange) {
  const date = new Date(iso);
  return range === "24h"
    ? date.toLocaleTimeString("en-US", { hour: "numeric", timeZone: "UTC" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function AnalyticsSummary({ data, exclusion }: { data: AnalyticsSummaryData; exclusion: AnalyticsExclusionState }) {
  const maxViews = Math.max(1, ...data.series.map((bucket) => bucket.views));
  const rangeLabel = analyticsRanges[data.range].label;

  return (
    <section className="space-y-4" aria-labelledby="analytics-summary-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 id="analytics-summary-title" className="font-mono text-xs uppercase tracking-wider text-zinc-400">Web analytics · last {rangeLabel}</h2>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            {data.activeNow} active · 30 min
          </span>
        </div>
        <nav className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/60 p-1" aria-label="Analytics range">
          {(Object.keys(analyticsRanges) as AnalyticsRange[]).map((range) => (
            <Link
              key={range}
              href={`/account?tab=site-performance&range=${range}`}
              aria-current={data.range === range ? "page" : undefined}
              className={`rounded-md px-3 py-1 font-mono text-xs transition-colors ${data.range === range ? "bg-zinc-800/80 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {range}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Visitors" value={data.totals.visitors.toLocaleString()} change={data.changes.visitors} detail="Unique visitors per day, counted with a privacy-safe hash of IP + browser that rotates every 24 hours. No IP addresses are stored." />
        <Stat label="Page views" value={data.totals.pageViews.toLocaleString()} change={data.changes.pageViews} detail="Every tracked page load from real visitors. Reloads count again." />
        <Stat label="Signup starts" value={data.totals.signupStarts.toLocaleString()} change={data.changes.signupStarts} detail="Clicks into the signup / sign-in flow." />
        <Stat label="Conversion" value={`${data.totals.conversionRate}%`} change={data.changes.conversionRate} detail="Share of visitors who started signup." />
        <Stat label="Median load" value={formatMs(data.totals.medianLoadMs)} change={data.changes.medianLoadMs} lowerIsBetter detail="Median full page load time measured in visitors' browsers." />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-100">Traffic</h3>
          <div className="flex items-center gap-4 font-mono text-[11px] text-zinc-500">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-emerald-500/80" />Page views</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-emerald-300" />Visitors</span>
          </div>
        </div>
        <div className="flex h-40 items-end gap-[3px]" role="img" aria-label={`Page views over the last ${rangeLabel}`}>
          {data.series.map((bucket) => (
            <div key={bucket.start} className="group relative flex h-full flex-1 items-end" title={`${bucketLabel(bucket.start, data.range)} — ${bucket.views} views · ${bucket.visitors} visitors`}>
              <div className="relative w-full rounded-sm bg-emerald-500/30 transition-colors group-hover:bg-emerald-500/50" style={{ height: `${Math.max(bucket.views ? 4 : 1, (bucket.views / maxViews) * 100)}%` }}>
                <div className="absolute inset-x-0 bottom-0 rounded-sm bg-emerald-400/80" style={{ height: bucket.views ? `${(bucket.visitors / bucket.views) * 100}%` : "0%" }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-zinc-500">
          <span>{bucketLabel(data.series[0]?.start || new Date().toISOString(), data.range)}</span>
          <span>{data.range === "24h" ? "UTC" : ""}</span>
          <span>{bucketLabel(data.series.at(-1)?.start || new Date().toISOString(), data.range)}</span>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-100">Conversion funnel</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <FunnelStep label="Visited" value={data.funnel.visitors} total={data.funnel.visitors} />
          <FunnelStep label="Clicked a CTA" value={data.funnel.ctaClicks} total={data.funnel.visitors} />
          <FunnelStep label="Started signup" value={data.funnel.signupStarts} total={data.funnel.visitors} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Breakdown title="Top pages" rows={data.pages} render={(row) => <span className="truncate font-mono">{row.label}</span>} />
        <Breakdown title="Top sources" rows={data.sources} render={(row) => row.label.includes(".") ? <span className="flex min-w-0 items-center gap-2"><ReferrerFavicon host={row.label} src={`https://${row.label}/favicon.ico`} /><span className="truncate">{row.label}</span></span> : <span className="truncate">{row.label}</span>} />
        <Breakdown title="Countries" rows={data.countries} render={(row) => <span className="flex min-w-0 items-center gap-2"><span aria-hidden>{flag(row.label)}</span><span className="truncate">{countryName(row.label)}</span></span>} />
        <Breakdown title="Devices" rows={data.devices} />
        <Breakdown title="Browsers" rows={data.browsers} />
        <Breakdown title="Operating systems" rows={data.operatingSystems} />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-100">Filtering</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          Only real visitors are counted. Your signed-in sessions, admin accounts, bots &amp; crawlers, localhost/dev servers, opted-out browsers, and excluded IPs are dropped before anything is stored.
          {data.trackingSince ? ` Filtered tracking started ${new Date(data.trackingSince).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}; older unfiltered events are not counted.` : " No filtered events recorded yet; older unfiltered events are not counted."}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">This browser</p>
            <AnalyticsExclusionToggle initialExcluded={exclusion.browserExcluded} />
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Your current IP</p>
            <p className="mt-2 font-mono text-sm text-zinc-100">{exclusion.ip || "Unavailable"}</p>
            <p className={`mt-1 text-xs ${exclusion.ipExcluded ? "text-emerald-400" : "text-zinc-500"}`}>
              {exclusion.ipExcluded ? "Excluded by SEEDENV_ANALYTICS_EXCLUDED_IPS" : "Add to SEEDENV_ANALYTICS_EXCLUDED_IPS on Render to drop all traffic from this network (e.g. home Wi-Fi)."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, change, detail, lowerIsBetter = false }: { label: string; value: string; change: number | null; detail: string; lowerIsBetter?: boolean }) {
  const good = change !== null && (lowerIsBetter ? change < 0 : change > 0);
  const bad = change !== null && (lowerIsBetter ? change > 0 : change < 0);
  const changeLabel = change === null ? "No prior data" : `${change > 0 ? "+" : ""}${change}% vs prior`;
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">{label}</span>
        <span title={detail} aria-label={detail} className="text-zinc-600"><Info className="size-3.5" /></span>
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold text-zinc-100">{value}</p>
      <p className={`mt-1 text-xs ${good ? "text-emerald-400" : bad ? "text-rose-400" : "text-zinc-500"}`}>{changeLabel}</p>
    </div>
  );
}

function FunnelStep({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className="font-mono text-xs text-zinc-500">{percent}%</span>
      </div>
      <p className="mt-1 font-mono text-lg font-semibold text-zinc-100">{value.toLocaleString()}</p>
      <div className="mt-2 h-1 rounded-full bg-zinc-800"><div className="h-1 rounded-full bg-emerald-500" style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

function Breakdown({ title, rows, render }: { title: string; rows: AnalyticsBreakdownRow[]; render?: (row: AnalyticsBreakdownRow) => React.ReactNode }) {
  const max = Math.max(1, ...rows.map((row) => row.visitors));
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">Visitors · Views</span>
      </div>
      {rows.length ? (
        <ul className="space-y-1 p-2">
          {rows.map((row) => (
            <li key={row.label} className="relative flex items-center justify-between gap-3 overflow-hidden rounded-md px-2 py-1.5 text-xs text-zinc-300">
              <span className="absolute inset-y-0 left-0 rounded-md bg-emerald-500/10" style={{ width: `${(row.visitors / max) * 100}%` }} aria-hidden />
              <span className="relative min-w-0 flex-1">{render ? render(row) : <span className="truncate">{row.label}</span>}</span>
              <span className="relative shrink-0 font-mono text-zinc-400">{row.visitors.toLocaleString()} <span className="text-zinc-600">· {row.views.toLocaleString()}</span></span>
            </li>
          ))}
        </ul>
      ) : <p className="px-4 py-5 text-xs text-zinc-500">No data yet.</p>}
    </div>
  );
}
