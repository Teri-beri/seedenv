import { BarChart3, MousePointerClick, Users, Workflow } from "lucide-react";

export type AnalyticsSummaryData = {
  pageViews: number;
  ctaClicks: number;
  signupStarts: number;
  uniqueSessions: number;
  topReferrers: { referrer: string; count: number }[];
};

export function AnalyticsSummary({ data }: { data: AnalyticsSummaryData }) {
  return (
    <section className="luxury-panel rounded-2xl p-5" aria-labelledby="analytics-summary-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs uppercase tracking-[0.24em] text-amber-500">Site performance · last 30 days</p><h2 id="analytics-summary-title" className="mt-2 text-2xl font-black">Conversion signal</h2></div>
        <BarChart3 className="size-5 text-amber-500" />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Page views" value={data.pageViews} icon={<BarChart3 className="size-4" />} />
        <Metric label="CTA clicks" value={data.ctaClicks} icon={<MousePointerClick className="size-4" />} />
        <Metric label="Signup starts" value={data.signupStarts} icon={<Workflow className="size-4" />} />
        <Metric label="Unique sessions" value={data.uniqueSessions} icon={<Users className="size-4" />} />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-zinc-500"><span>Top referrers:</span>{data.topReferrers.length ? data.topReferrers.map((item) => <span className="rounded-full border border-white/10 bg-zinc-950/55 px-3 py-1.5 font-mono" key={item.referrer}>{item.referrer} · {item.count}</span>) : <span>No referrer data yet.</span>}</div>
    </section>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return <div className="rounded-xl border border-white/10 bg-zinc-950/55 p-4"><div className="flex items-center justify-between text-zinc-500"><span className="text-xs font-semibold uppercase tracking-[0.12em]">{label}</span>{icon}</div><p className="mt-2 font-mono text-2xl font-black text-white">{value.toLocaleString()}</p></div>;
}
