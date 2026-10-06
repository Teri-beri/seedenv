import { prisma } from "@/lib/prisma";

export const analyticsRanges = {
  "24h": { label: "24 hours", ms: 24 * 60 * 60 * 1000, buckets: 24, bucketMs: 60 * 60 * 1000 },
  "7d": { label: "7 days", ms: 7 * 24 * 60 * 60 * 1000, buckets: 7, bucketMs: 24 * 60 * 60 * 1000 },
  "30d": { label: "30 days", ms: 30 * 24 * 60 * 60 * 1000, buckets: 30, bucketMs: 24 * 60 * 60 * 1000 },
} as const;

export type AnalyticsRange = keyof typeof analyticsRanges;

export function parseAnalyticsRange(value: unknown): AnalyticsRange {
  return typeof value === "string" && value in analyticsRanges ? value as AnalyticsRange : "7d";
}

export type AnalyticsBreakdownRow = { label: string; views: number; visitors: number };

export type AnalyticsSummaryData = {
  range: AnalyticsRange;
  trackingSince: string | null;
  activeNow: number;
  totals: { visitors: number; pageViews: number; signupStarts: number; conversionRate: number; medianLoadMs: number | null };
  changes: { visitors: number | null; pageViews: number | null; signupStarts: number | null; conversionRate: number | null; medianLoadMs: number | null };
  series: Array<{ start: string; views: number; visitors: number }>;
  funnel: { visitors: number; ctaClicks: number; signupStarts: number };
  pages: AnalyticsBreakdownRow[];
  sources: AnalyticsBreakdownRow[];
  countries: AnalyticsBreakdownRow[];
  devices: AnalyticsBreakdownRow[];
  browsers: AnalyticsBreakdownRow[];
  operatingSystems: AnalyticsBreakdownRow[];
};

type EventRow = {
  eventName: string;
  path: string;
  visitorId: string | null;
  source: string | null;
  country: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  loadMs: number | null;
  createdAt: Date;
};

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function periodStats(events: EventRow[]) {
  const visitors = new Set<string>();
  const ctaVisitors = new Set<string>();
  const signupVisitors = new Set<string>();
  let pageViews = 0;
  let signupStarts = 0;
  const loads: number[] = [];
  for (const event of events) {
    if (!event.visitorId) continue;
    if (event.eventName === "page_view") {
      pageViews += 1;
      visitors.add(event.visitorId);
      if (event.loadMs) loads.push(event.loadMs);
    } else if (event.eventName === "cta_click") {
      ctaVisitors.add(event.visitorId);
    } else if (event.eventName === "signup_start") {
      signupStarts += 1;
      signupVisitors.add(event.visitorId);
    }
  }
  const conversionRate = visitors.size ? Math.round((signupVisitors.size / visitors.size) * 1000) / 10 : 0;
  return { visitors: visitors.size, pageViews, signupStarts, conversionRate, medianLoadMs: median(loads), ctaVisitors: ctaVisitors.size, signupVisitors: signupVisitors.size };
}

export function breakdown(events: EventRow[], key: (event: EventRow) => string | null, fallback: string, limit = 8): AnalyticsBreakdownRow[] {
  const groups = new Map<string, { views: number; visitors: Set<string> }>();
  for (const event of events) {
    if (event.eventName !== "page_view" || !event.visitorId) continue;
    const label = key(event) || fallback;
    const group = groups.get(label) || { views: 0, visitors: new Set<string>() };
    group.views += 1;
    group.visitors.add(event.visitorId);
    groups.set(label, group);
  }
  return [...groups.entries()]
    .map(([label, group]) => ({ label, views: group.views, visitors: group.visitors.size }))
    .sort((left, right) => right.visitors - left.visitors || right.views - left.views)
    .slice(0, limit);
}

export async function getAnalyticsSummary(rangeKey: AnalyticsRange = "7d", now = new Date()): Promise<AnalyticsSummaryData> {
  const range = analyticsRanges[rangeKey];
  const end = now.getTime();
  // Align buckets to the hour/day boundary so the chart reads naturally.
  const alignedEnd = Math.ceil(end / range.bucketMs) * range.bucketMs;
  const start = alignedEnd - range.buckets * range.bucketMs;
  const previousStart = start - range.ms;

  // Only events captured by the filtered pipeline (visitorId set) are counted, so pre-filter traffic is ignored.
  const [events, firstTracked] = await Promise.all([
    prisma.analyticsEvent.findMany({
      where: { createdAt: { gte: new Date(previousStart) }, visitorId: { not: null } },
      select: { eventName: true, path: true, visitorId: true, source: true, country: true, device: true, browser: true, os: true, loadMs: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 200_000,
    }),
    prisma.analyticsEvent.findFirst({ where: { visitorId: { not: null } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);

  const current = events.filter((event) => event.createdAt.getTime() >= start);
  const previous = events.filter((event) => event.createdAt.getTime() < start);
  const currentStats = periodStats(current);
  const previousStats = periodStats(previous);

  const series = Array.from({ length: range.buckets }, (_, index) => ({ start: start + index * range.bucketMs, views: 0, visitors: new Set<string>() }));
  for (const event of current) {
    if (event.eventName !== "page_view" || !event.visitorId) continue;
    const index = Math.floor((event.createdAt.getTime() - start) / range.bucketMs);
    const bucket = series[index];
    if (!bucket) continue;
    bucket.views += 1;
    bucket.visitors.add(event.visitorId);
  }

  const activeCutoff = end - 30 * 60 * 1000;
  const activeNow = new Set(current.filter((event) => event.visitorId && event.createdAt.getTime() >= activeCutoff).map((event) => event.visitorId)).size;

  return {
    range: rangeKey,
    trackingSince: firstTracked?.createdAt.toISOString() || null,
    activeNow,
    totals: {
      visitors: currentStats.visitors,
      pageViews: currentStats.pageViews,
      signupStarts: currentStats.signupStarts,
      conversionRate: currentStats.conversionRate,
      medianLoadMs: currentStats.medianLoadMs,
    },
    changes: {
      visitors: percentChange(currentStats.visitors, previousStats.visitors),
      pageViews: percentChange(currentStats.pageViews, previousStats.pageViews),
      signupStarts: percentChange(currentStats.signupStarts, previousStats.signupStarts),
      conversionRate: percentChange(currentStats.conversionRate, previousStats.conversionRate),
      medianLoadMs: currentStats.medianLoadMs !== null && previousStats.medianLoadMs !== null ? percentChange(currentStats.medianLoadMs, previousStats.medianLoadMs) : null,
    },
    series: series.map((bucket) => ({ start: new Date(bucket.start).toISOString(), views: bucket.views, visitors: bucket.visitors.size })),
    funnel: { visitors: currentStats.visitors, ctaClicks: currentStats.ctaVisitors, signupStarts: currentStats.signupVisitors },
    pages: breakdown(current, (event) => event.path, "/"),
    sources: breakdown(current, (event) => event.source, "Direct / none"),
    countries: breakdown(current, (event) => event.country, "Unknown"),
    devices: breakdown(current, (event) => event.device, "Unknown"),
    browsers: breakdown(current, (event) => event.browser, "Unknown"),
    operatingSystems: breakdown(current, (event) => event.os, "Unknown"),
  };
}
