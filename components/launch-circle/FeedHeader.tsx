import Link from "next/link";
import { Search } from "lucide-react";
import { BackButton } from "@/components/back-button";

export type FeedTab = "all" | "following" | "drops";
export type FeedSort = "latest" | "discussed";

export const FEED_TABS: ReadonlyArray<{ value: FeedTab; label: string; memberOnly: boolean }> = [
  { value: "all", label: "All Updates", memberOnly: false },
  { value: "following", label: "Following", memberOnly: true },
  { value: "drops", label: "Active Drops", memberOnly: false },
];

export function feedHref({ tab = "all", sort = "latest", query = "", page = 1 }: { tab?: FeedTab; sort?: FeedSort; query?: string; page?: number }) {
  const params = new URLSearchParams();
  if (tab !== "all") params.set("show", tab);
  if (sort !== "latest") params.set("sort", sort);
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const value = params.toString();
  return value ? `/community?${value}` : "/community";
}

export function FeedHeader({ tab, sort, query, home, member }: { tab: FeedTab; sort: FeedSort; query: string; home: string; member: boolean }) {
  const control = (active: boolean) => `inline-flex min-h-9 items-center rounded-md px-3 font-mono text-xs transition-colors ${active ? "bg-emerald-500/15 text-emerald-300" : "text-zinc-400 hover:text-white"}`;
  const tabs = FEED_TABS.filter((item) => member || !item.memberOnly);
  return <header className="mb-5 space-y-4">
    <div>
      <BackButton fallbackHref={home} className="-ml-1 mb-1" />
      <h1 className="text-2xl font-bold text-white">Launch Circle</h1>
      <p className="mt-1 font-mono text-xs text-zinc-400">Live developer changelogs &amp; validator feedback</p>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
      <nav aria-label="Feed views" className="inline-flex rounded-lg border border-zinc-800 p-0.5">
        {tabs.map((item) => <Link key={item.value} href={feedHref({ tab: item.value, sort, query })} aria-current={tab === item.value ? "page" : undefined} className={control(tab === item.value)}>{item.label}</Link>)}
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <form action="/community" role="search" className="relative">
          {tab !== "all" ? <input type="hidden" name="show" value={tab} /> : null}
          {sort !== "latest" ? <input type="hidden" name="sort" value={sort} /> : null}
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input name="q" defaultValue={query} aria-label="Search updates or apps" placeholder="Search updates or apps..." className="min-h-9 w-56 rounded-lg border border-zinc-800 bg-zinc-950/60 py-2 pl-9 pr-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500/50 focus:outline-none" />
        </form>
        <nav aria-label="Sort feed" className="inline-flex rounded-lg border border-zinc-800 p-0.5">
          {([["latest", "Latest"], ["discussed", "Discussed"]] as const).map(([value, label]) => <Link key={value} href={feedHref({ tab, sort: value, query })} aria-current={sort === value ? "page" : undefined} className={control(sort === value)}>{label}</Link>)}
        </nav>
      </div>
    </div>
  </header>;
}
