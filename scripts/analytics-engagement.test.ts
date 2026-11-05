import assert from "node:assert/strict";
import test, { mock } from "node:test";

// Mock Prisma before importing anything that reaches lib/prisma, so tests never touch a real database.
const prismaStub: Record<string, unknown> = {};
mock.module("../lib/prisma.ts", { namedExports: { prisma: prismaStub } });
mock.module("next-auth/jwt", { namedExports: { getToken: async () => null } });
const tracker = import("../components/analytics-tracker");
const summaryView = import("../components/analytics-summary");

test("engagement timer counts active foreground time and stops after one idle minute", async () => {
  const { createEngagementTimer } = await tracker;
  let clock = 0;
  const timer = createEngagementTimer(() => clock, 60_000);
  timer.activity();
  clock = 20_000;
  timer.activity();
  clock = 30_000;
  assert.equal(timer.take(), 30_000);
  clock = 500_000;
  assert.equal(timer.take(), 60_000 - 30_000 + 20_000, "idle time beyond one minute after the last input is excluded");
  clock = 600_000;
  timer.activity();
  clock = 610_000;
  timer.pause();
  clock = 900_000;
  assert.equal(timer.take(), 10_000, "hidden time after a pause is excluded");
  assert.equal(timer.take(), 0);
});

test("time on site is the median engaged time per visit", async () => {
  const at = new Date("2026-11-05T12:00:00Z");
  const event = (sessionKey: string | null, engagedMs: number, visitorId = "v1") => ({ eventName: "engagement", path: "/", sessionKey, visitorId, engagedMs, source: null, country: null, device: null, browser: null, os: null, loadMs: null, createdAt: at });
  const events = [
    event("a", 30_000), event("a", 90_000),
    event("b", 10_000, "v2"),
    event(null, 300_000, "v3"),
    { ...event("c", 5_000), eventName: "page_view", engagedMs: null },
  ];
  prismaStub.analyticsEvent = { findMany: async () => events, findFirst: async () => ({ createdAt: at }) };
  const { getAnalyticsSummary, visitDurations } = await import("../lib/analytics");
  assert.deepEqual(visitDurations(events).sort((a, b) => a - b), [10_000, 120_000, 300_000]);
  const summary = await getAnalyticsSummary("7d", new Date("2026-11-05T13:00:00Z"));
  assert.equal(summary.totals.medianVisitMs, 120_000);
  assert.equal(summary.totals.engagedVisits, 3);
  assert.equal(summary.totals.pageViews, 1, "engagement events are not page views");
  assert.equal(summary.changes.medianVisitMs, null);
});

test("collector stores capped engagement and ignores sub-second visits", async () => {
  const created: Array<Record<string, unknown>> = [];
  prismaStub.analyticsEvent = { create: async ({ data }: { data: Record<string, unknown> }) => { created.push(data); return data; } };
  {
    const { NextRequest } = await import("next/server");
    const { POST } = await import("../app/api/analytics/collect/route");
    const post = (body: Record<string, unknown>) => POST(new NextRequest("https://seedenv.com/api/analytics/collect", {
      method: "POST",
      headers: { host: "seedenv.com", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    assert.equal((await (await post({ eventName: "engagement", path: "/", engagedMs: 400 })).json()).counted, false);
    assert.equal((await (await post({ eventName: "engagement", path: "/tools", sessionKey: "s1", engagedMs: 99_000_000 })).json()).counted, true);
    assert.equal((await (await post({ eventName: "page_view", path: "/", engagedMs: 50_000 })).json()).counted, true);
    assert.equal(created.length, 2);
    assert.equal(created[0].engagedMs, 30 * 60 * 1000);
    assert.equal(created[0].path, "/tools");
    assert.equal(created[1].engagedMs, null, "only engagement events carry engaged time");
  }
});

test("durations format compactly", async () => {
  const { formatDuration } = await summaryView;
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(42_400), "42s");
  assert.equal(formatDuration(125_000), "2m 05s");
  assert.equal(formatDuration(3_780_000), "1h 03m");
});
