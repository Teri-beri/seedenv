import assert from "node:assert/strict";
import test, { mock } from "node:test";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { landingViews } from "../lib/landing-views";

Object.assign(globalThis, { React });

test("pending requests precede history and eligibility controls, with visible review actions", async () => {
  const modules = [
    mock.module("../components/member-action.tsx", { namedExports: { MemberAction: ({ children }: { children: ReactNode }) => React.createElement("button", null, children) } }),
    mock.module("../app/actions/applicationActions.ts", { namedExports: { decideApplication: async () => "", withdrawApplication: async () => "", updateMissionRequirements: async () => "" } }),
  ];
  try {
    const { ApplicationCenter } = await import("../components/application-center");
    const application = { id: "request", status: "PENDING", note: "I can test on an iPhone.", passReserved: false, startBy: null, campaign: { title: "Pending test cohort", id: "cohort" }, tester: { username: "genuine_tester", xpPoints: 0, _count: { submissions: 0 } } };
    const html = renderToStaticMarkup(React.createElement(ApplicationCenter, {
      developer: true,
      applications: [{ ...application, id: "history", status: "DECLINED", campaign: { title: "Older declined cohort", id: "old" } }, application],
      campaigns: [{ id: "cohort", title: "Pending test cohort", discoveryAllowed: false, discoveryMinRep: 0, instructions: [] }],
      chargePreviews: { cohort: { credit: true } },
    }));
    assert.ok(html.includes('id="tester-requests"'));
    assert.ok(html.includes("1 pending in this list"));
    assert.ok(html.includes("Accept"));
    assert.ok(html.includes("Decline"));
    assert.ok(html.indexOf("genuine_tester") < html.indexOf("Configure task eligibility"));
    assert.ok(html.indexOf("Pending test cohort") < html.indexOf("Older declined cohort"));
    assert.ok(!html.includes("<details open"));
    const empty = renderToStaticMarkup(React.createElement(ApplicationCenter, { developer: true, applications: [], campaigns: [] }));
    assert.ok(empty.includes("No applications yet."));
  } finally {
    modules.reverse().forEach((item) => item.restore());
  }
});

test("landing anchor navigation follows developer, live cohorts, then validator sections", () => {
  assert.deepEqual(landingViews.map((view) => view.anchor), ["top", "engine", "cohorts", "validators", "pricing", "pwa"]);
});
