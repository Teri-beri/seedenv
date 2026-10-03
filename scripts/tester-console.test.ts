import assert from "node:assert/strict";
import test from "node:test";
import { rankForXp, rankProgress, xpForBounty } from "../lib/rank";
import { approvalRate, availableSlots, discoverMissions, resolveTesterView, testerMilestones, testerViews } from "../lib/tester-console";

test("tester views are separate, bookmarkable, and accepted mission links open the mission desk", () => {
  assert.deepEqual(testerViews.map((item) => item.id), ["discover", "missions", "reputation", "leaderboard"]);
  for (const view of testerViews) assert.equal(resolveTesterView(view.id), view.id);
  assert.equal(resolveTesterView(), "discover");
  assert.equal(resolveTesterView("unknown"), "discover");
  assert.equal(resolveTesterView("discover", "accepted-campaign"), "missions");
  assert.equal(resolveTesterView(undefined, "legacy-claim-link"), "missions");
});

const missions = [
  { title: "Social launch", description: "Share useful feedback", targetVibe: "Community", platform: "WEB_STAGING", bountyPerTaskUsd: 4.99, totalSlots: 10, claimedSlots: 8 },
  { title: "Pocket studio", description: "Create a project", targetVibe: "Creative", platform: "TESTFLIGHT", bountyPerTaskUsd: 5, totalSlots: 10, claimedSlots: 10 },
  { title: "Android explorer", description: "Explore a new app", targetVibe: "Discovery", platform: "PLAY_STORE", bountyPerTaskUsd: 8, totalSlots: 20, claimedSlots: 2 },
];

test("discovery searches title, description, and interests without mutating the input", () => {
  const original = [...missions];
  assert.deepEqual(discoverMissions(missions, " COMMUNITY ", "all", "reward").map((item) => item.title), ["Social launch"]);
  assert.equal(discoverMissions(missions, "PROJECT", "all", "reward")[0].title, "Pocket studio");
  assert.equal(discoverMissions(missions, "android", "all", "reward")[0].title, "Android explorer");
  assert.deepEqual(missions, original);
});

test("platform and reward filters use actual fields and the inclusive $5 threshold", () => {
  for (const platform of ["WEB_STAGING", "TESTFLIGHT", "PLAY_STORE"] as const) {
    assert.equal(discoverMissions(missions, "", platform, "reward").length, 1);
  }
  assert.deepEqual(discoverMissions(missions, "", "high-bounty", "reward").map((item) => item.bountyPerTaskUsd), [8, 5]);
  assert.equal(discoverMissions(missions, "missing", "all", "reward").length, 0);
});

test("discovery sorts by reward or open slots and clamps unavailable slots", () => {
  assert.deepEqual(discoverMissions(missions, "", "all", "reward").map((item) => item.bountyPerTaskUsd), [8, 5, 4.99]);
  assert.deepEqual(discoverMissions(missions, "", "all", "slots").map(availableSlots), [18, 2, 0]);
  assert.equal(availableSlots({ totalSlots: 1, claimedSlots: 2 }), 0);
  assert.deepEqual(discoverMissions([], "", "all", "reward"), []);
});

test("approval rate is unavailable before reviews and excludes unreviewed claims", () => {
  assert.equal(approvalRate(0, 0), null);
  assert.equal(approvalRate(3, 1), 75);
  assert.equal(approvalRate(0, 2), 0);
  assert.equal(approvalRate(2, 0), 100);
});

test("milestones only unlock at the actual contribution thresholds", () => {
  assert.equal(testerMilestones(0, 0).filter((item) => item.earned).length, 0);
  assert.equal(testerMilestones(1, 75)[0].earned, true);
  assert.equal(testerMilestones(4, 1499)[1].earned, false);
  assert.equal(testerMilestones(5, 1500)[1].earned, true);
  assert.equal(testerMilestones(25, 1500).filter((item) => item.earned).length, 4);
  assert.equal(testerMilestones(100, 9000)[0].percent, 100);
});

test("REP matches approval rewards and ranks at exact boundaries", () => {
  assert.equal(xpForBounty(100), 75);
  assert.equal(xpForBounty(500), 160);
  assert.equal(rankForXp(1499), "ALPHA_SEEDER");
  assert.equal(rankForXp(1500), "CORE_VALIDATOR");
  assert.equal(rankForXp(5999), "CORE_VALIDATOR");
  assert.equal(rankForXp(6000), "APEX_ARCHITECT");
  assert.equal(rankProgress(rankForXp(0), 0).percent, 0);
  assert.equal(rankProgress(rankForXp(1499), 1499).remainingXp, 1);
  assert.equal(rankProgress(rankForXp(6000), 6000).percent, 100);
});
