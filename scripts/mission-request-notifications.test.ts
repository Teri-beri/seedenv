import assert from "node:assert/strict";
import test, { mock } from "node:test";

test("pending tester requests email the developer with an idempotent review link", async () => {
  const sent: unknown[][] = [];
  let enabled = true;
  let status = "PENDING";
  const updatedAt = new Date("2026-10-12T20:00:00.000Z");
  const modules = [
    mock.module("../lib/prisma.ts", { namedExports: { prisma: {
      missionApplication: { findUnique: async () => ({
        id: "application-1",
        status,
        note: "I can test this build on a physical Pixel device.",
        updatedAt,
        tester: { username: "alex_qa", xpPoints: 840 },
        campaign: {
          title: "Android checkout beta",
          developer: { email: "developer@example.invalid", notificationPreferences: { email_tester_requests: enabled } },
        },
      }) },
    } } }),
    mock.module("../lib/notifications.ts", { namedExports: {
      notificationEnabled: (preferences: Record<string, boolean>, key: string, fallback: boolean) => preferences[key] ?? fallback,
      sendNotificationEmail: async (...args: unknown[]) => { sent.push(args); return true; },
    } }),
  ];
  const previousOrigin = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://seedenv.example";
  try {
    const { notifyDeveloperOfMissionRequest } = await import("../lib/mission-request-notifications");
    assert.equal(await notifyDeveloperOfMissionRequest("application-1"), true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0][0], "developer@example.invalid");
    assert.equal(sent[0][1], "New tester request: Android checkout beta");
    assert.match(String(sent[0][2]), /alex_qa requested to test Android checkout beta/);
    assert.match(String(sent[0][2]), /840 REP/);
    assert.match(String(sent[0][2]), /https:\/\/seedenv\.example\/applications#tester-requests/);
    assert.equal(sent[0][3], `mission-request-application-1-${updatedAt.getTime()}`);

    enabled = false;
    assert.equal(await notifyDeveloperOfMissionRequest("application-1"), false);
    status = "WITHDRAWN";
    enabled = true;
    assert.equal(await notifyDeveloperOfMissionRequest("application-1"), false);
    assert.equal(sent.length, 1);
  } finally {
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousOrigin;
    modules.reverse().forEach((item) => item.restore());
  }
});
