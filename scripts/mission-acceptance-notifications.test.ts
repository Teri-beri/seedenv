import assert from "node:assert/strict";
import test, { mock } from "node:test";

test("accepted mission applications email the tester with the campaign claim link", async () => {
  const sent: unknown[][] = [];
  let status = "ACCEPTED";
  const updatedAt = new Date("2026-10-13T20:00:00.000Z");
  const startBy = new Date("2026-10-14T20:00:00.000Z");
  const modules = [
    mock.module("../lib/prisma.ts", { namedExports: { prisma: {
      missionApplication: { findUnique: async () => ({
        id: "application-1",
        status,
        startBy,
        updatedAt,
        tester: { email: "tester@example.invalid", username: "roblox_node" },
        campaign: { id: "campaign-1", title: "Roblox private run", platform: "ROBLOX_EXPERIENCE" },
      }) },
    } } }),
    mock.module("../lib/notifications.ts", { namedExports: {
      sendNotificationEmail: async (...args: unknown[]) => { sent.push(args); return true; },
    } }),
  ];
  const previousOrigin = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://seedenv.example";
  try {
    const { notifyTesterOfMissionAcceptance } = await import("../lib/mission-acceptance-notifications");
    assert.equal(await notifyTesterOfMissionAcceptance("application-1"), true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0][0], "tester@example.invalid");
    assert.equal(sent[0][1], "Accepted to test: Roblox private run");
    assert.match(String(sent[0][2]), /private Roblox run/);
    assert.match(String(sent[0][2]), /dashboard\?view=missions&claim=campaign-1/);
    assert.match(String(sent[0][2]), /24 hours/);
    assert.equal(sent[0][3], `mission-accepted-application-1-${updatedAt.getTime()}`);

    status = "DECLINED";
    assert.equal(await notifyTesterOfMissionAcceptance("application-1"), false);
    assert.equal(sent.length, 1);
  } finally {
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousOrigin;
    modules.reverse().forEach((item) => item.restore());
  }
});
