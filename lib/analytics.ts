import { prisma } from "@/lib/prisma";

export type AnalyticsSummaryData = {
  pageViews: number;
  ctaClicks: number;
  signupStarts: number;
  uniqueSessions: number;
  changes: {
    pageViews: number | null;
    ctaClicks: number | null;
    signupStarts: number | null;
    uniqueSessions: number | null;
  };
  topReferrers: Array<{
    referrer: string;
    host: string;
    faviconUrl: string;
    hits: number;
    sessions: number;
    conversions: number;
    conversionRate: number;
  }>;
};

const trackedEvents = ["page_view", "cta_click", "signup_start"];
const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

function countForEvent(rows: Array<{ eventName: string; _count: { _all: number } }>, eventName: string) {
  return rows.find((row) => row.eventName === eventName)?._count._all || 0;
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

function parseReferrer(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.replace(/^www\./i, "");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return { key: `${host}${path}`, host, path, faviconUrl: `${url.origin}/favicon.ico` };
  } catch {
    return null;
  }
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummaryData> {
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const thisWeekStart = new Date(now - sevenDaysMs);
  const previousWeekStart = new Date(now - 2 * sevenDaysMs);

  const [monthCounts, thisWeekCounts, previousWeekCounts, monthSessions, thisWeekSessions, previousWeekSessions, referrerEvents, signupSessions] = await Promise.all([
    prisma.analyticsEvent.groupBy({ by: ["eventName"], where: { eventName: { in: trackedEvents }, createdAt: { gte: thirtyDaysAgo } }, _count: { _all: true } }),
    prisma.analyticsEvent.groupBy({ by: ["eventName"], where: { eventName: { in: trackedEvents }, createdAt: { gte: thisWeekStart } }, _count: { _all: true } }),
    prisma.analyticsEvent.groupBy({ by: ["eventName"], where: { eventName: { in: trackedEvents }, createdAt: { gte: previousWeekStart, lt: thisWeekStart } }, _count: { _all: true } }),
    prisma.analyticsEvent.findMany({ where: { createdAt: { gte: thirtyDaysAgo }, sessionKey: { not: null } }, distinct: ["sessionKey"], select: { sessionKey: true } }),
    prisma.analyticsEvent.findMany({ where: { createdAt: { gte: thisWeekStart }, sessionKey: { not: null } }, distinct: ["sessionKey"], select: { sessionKey: true } }),
    prisma.analyticsEvent.findMany({ where: { createdAt: { gte: previousWeekStart, lt: thisWeekStart }, sessionKey: { not: null } }, distinct: ["sessionKey"], select: { sessionKey: true } }),
    prisma.analyticsEvent.findMany({ where: { eventName: "page_view", createdAt: { gte: thirtyDaysAgo }, referrer: { not: null }, sessionKey: { not: null } }, select: { referrer: true, sessionKey: true } }),
    prisma.analyticsEvent.findMany({ where: { eventName: "signup_start", createdAt: { gte: thirtyDaysAgo }, sessionKey: { not: null } }, distinct: ["sessionKey"], select: { sessionKey: true } }),
  ]);

  const signupSessionKeys = new Set(signupSessions.map((row) => row.sessionKey).filter((key): key is string => Boolean(key)));
  const referrerGroups = new Map<string, { referrer: string; host: string; faviconUrl: string; hits: number; sessionKeys: Set<string> }>();
  for (const event of referrerEvents) {
    if (!event.referrer || !event.sessionKey) continue;
    const parsed = parseReferrer(event.referrer);
    if (!parsed) continue;
    const group = referrerGroups.get(parsed.key) || {
      referrer: parsed.path,
      host: parsed.host,
      faviconUrl: parsed.faviconUrl,
      hits: 0,
      sessionKeys: new Set<string>(),
    };
    group.hits += 1;
    group.sessionKeys.add(event.sessionKey);
    referrerGroups.set(parsed.key, group);
  }

  const topReferrers = [...referrerGroups.values()]
    .map((group) => {
      const conversions = [...group.sessionKeys].filter((key) => signupSessionKeys.has(key)).length;
      return {
        referrer: group.referrer,
        host: group.host,
        faviconUrl: group.faviconUrl,
        hits: group.hits,
        sessions: group.sessionKeys.size,
        conversions,
        conversionRate: group.sessionKeys.size ? Math.round((conversions / group.sessionKeys.size) * 100) : 0,
      };
    })
    .sort((left, right) => right.hits - left.hits)
    .slice(0, 5);

  const current = {
    pageViews: countForEvent(thisWeekCounts, "page_view"),
    ctaClicks: countForEvent(thisWeekCounts, "cta_click"),
    signupStarts: countForEvent(thisWeekCounts, "signup_start"),
    uniqueSessions: thisWeekSessions.length,
  };
  const previous = {
    pageViews: countForEvent(previousWeekCounts, "page_view"),
    ctaClicks: countForEvent(previousWeekCounts, "cta_click"),
    signupStarts: countForEvent(previousWeekCounts, "signup_start"),
    uniqueSessions: previousWeekSessions.length,
  };

  return {
    pageViews: countForEvent(monthCounts, "page_view"),
    ctaClicks: countForEvent(monthCounts, "cta_click"),
    signupStarts: countForEvent(monthCounts, "signup_start"),
    uniqueSessions: monthSessions.length,
    changes: {
      pageViews: percentChange(current.pageViews, previous.pageViews),
      ctaClicks: percentChange(current.ctaClicks, previous.ctaClicks),
      signupStarts: percentChange(current.signupStarts, previous.signupStarts),
      uniqueSessions: percentChange(current.uniqueSessions, previous.uniqueSessions),
    },
    topReferrers,
  };
}