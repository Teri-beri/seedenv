import assert from "node:assert/strict";
import test, { mock } from "node:test";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { landingViews } from "../lib/landing-views";

Object.assign(globalThis, { React });

test("developer applications render the live queue and cohort rule summary", async () => {
  const modules = [
    mock.module("../components/member-action.tsx", { namedExports: { MemberAction: ({ children }: { children: ReactNode }) => React.createElement("button", null, children) } }),
    mock.module("../app/actions/applicationActions.ts", { namedExports: { decideApplication: async () => "", withdrawApplication: async () => "", updateMissionRequirements: async () => "" } }),
  ];
  try {
    const { ApplicationCenter } = await import("../components/application-center");
    const application = { id: "request", status: "PENDING", note: "I can test on an iPhone.", passReserved: false, startBy: null, campaign: { title: "Pending test cohort", id: "cohort" }, tester: { username: "genuine_tester", xpPoints: 0, _count: { submissions: 0 } } };
    const queueApplication = {
      ...application,
      completed: false,
      tester: { username: "genuine_tester", avatarUrl: null, xpPoints: 0, rankLabel: "Alpha Seeder", submissionCount: 0, deviceModel: "iPhone 15", osBuild: "iOS 18" },
    };
    const html = renderToStaticMarkup(React.createElement(ApplicationCenter, {
      developer: true,
      applications: [{ ...application, id: "history", status: "DECLINED", campaign: { title: "Older declined cohort", id: "old" } }, application],
      campaigns: [{ id: "cohort", title: "Pending test cohort", status: "ACTIVE", discoveryAllowed: false, discoveryMinRep: 0, hardwareStrict: true, instructions: [{ id: "task", instructionTitle: "Checkout", minimumRep: 85 }] }],
      chargePreviews: { cohort: { credit: true } },
      queue: [{ ...queueApplication, id: "history", status: "DECLINED", campaign: { title: "Older declined cohort", id: "old" } }, queueApplication],
      renderedAt: Date.now(),
    }));
    assert.ok(html.includes("Pending Review (1)"));
    assert.ok(html.includes("Rejected (1)"));
    assert.ok(html.includes("Accept &amp; Issue Build"));
    assert.ok(html.includes("Decline"));
    assert.ok(html.includes("Gating &amp; Validation Rules"));
    assert.ok(html.includes("85 REP"));
    assert.ok(html.includes("Physical device required"));
    assert.ok(!html.includes("Configure task eligibility"));
    const empty = renderToStaticMarkup(React.createElement(ApplicationCenter, { developer: true, applications: [], campaigns: [] }));
    assert.ok(empty.includes("No pending tester applications"));
  } finally {
    modules.reverse().forEach((item) => item.restore());
  }
});

test("landing anchor navigation follows live cohorts, developer, then validator sections", () => {
  assert.deepEqual(landingViews.map((view) => view.anchor), ["top", "cohorts", "engine", "validators", "pricing", "pwa"]);
});
