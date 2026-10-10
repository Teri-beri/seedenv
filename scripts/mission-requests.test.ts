import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { MissionApplicationError } from "../lib/mission-applications";

test("join actions return readable expected errors and never report failed requests as sent", async () => {
  let role = "TESTER";
  let failure: Error | null = null;
  let saved = 0;
  const revalidated: string[] = [];
  const logged: unknown[] = [];
  const modules = [
    mock.module("../lib/member.ts", { namedExports: { requireMember: async () => ({ id: "tester", role }) } }),
    mock.module("../lib/quest-ledger.ts", { namedExports: { serializable: async (work: (tx: object) => Promise<unknown>) => work({}) } }),
    mock.module("../lib/mission-applications.ts", { namedExports: {
      MissionApplicationError,
      createMissionApplication: async (_tx: object, testerId: string, campaignId: string, note: string) => {
        assert.equal(testerId, "tester");
        assert.equal(campaignId, "cohort");
        assert.equal(note, "A relevant tester application.");
        if (failure) throw failure;
        saved++;
      },
      reviewMissionApplication: async () => {},
      closeMissionApplication: async () => {},
    } }),
    mock.module("next/cache", { namedExports: { revalidatePath: (path: string) => revalidated.push(path) } }),
  ];
  const logger = mock.method(console, "error", (...args: unknown[]) => { logged.push(args); });
  try {
    const { requestMission } = await import("../app/actions/applicationActions");
    const good = await requestMission("cohort", "  A relevant tester application.  ");
    assert.equal(good.ok, true);
    assert.equal(saved, 1);
    assert.deepEqual(revalidated, ["/dashboard", "/applications", "/console"]);
    for (const message of [
      "You cannot apply to your own cohort.",
      "You have already applied to this mission.",
      "This mission requires 1500 REP.",
      "Earn or exchange Quest XP for a Discovery Pass first.",
      "This mission is not accepting applications.",
    ]) {
      failure = new MissionApplicationError(message);
      assert.deepEqual(await requestMission("cohort", "A relevant tester application."), { ok: false, message });
    }
    failure = new Error("Private database details");
    const failed = await requestMission("cohort", "A relevant tester application.");
    assert.equal(failed.ok, false);
    assert.ok(!failed.message.includes("Private database"));
    assert.equal(logged.length, 1);
    assert.equal((await requestMission("cohort", "short")).ok, false);
    role = "DEVELOPER";
    assert.match((await requestMission("cohort", "A relevant tester application.")).message, /tester workspace/);
    assert.equal(saved, 1);
    assert.equal(revalidated.length, 3, "Failures do not refresh the UI as successful mutations.");
  } finally {
    logger.mock.restore();
    modules.reverse().forEach((item) => item.restore());
  }
});
