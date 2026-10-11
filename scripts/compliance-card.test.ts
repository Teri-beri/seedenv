import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GooglePlayComplianceCard } from "../components/console/GooglePlayComplianceCard";

function pings(days: number, testersPerDay: number) {
  return Array.from({ length: days }, (_, dayIndex) => (
    Array.from({ length: testersPerDay }, (_, testerIndex) => ({
      dayNumber: dayIndex + 1,
      validatorId: `tester-${testerIndex + 1}`,
      deviceModel: `Device ${testerIndex + 1}`,
      osVersion: "Android 14",
    }))
  )).flat();
}

test("an incomplete audit offers a clearly labeled preview PDF", () => {
  const html = renderToStaticMarkup(createElement(GooglePlayComplianceCard, {
    cohortId: "cohort-preview",
    targetDays: 14,
    requiredTesters: 12,
    status: "ACTIVE",
    pings: pings(9, 12),
  }));

  assert.ok(html.includes("Coverage 09 / 14 days"));
  assert.ok(html.includes("Download In-Progress Preview PDF"));
  assert.ok(html.includes("Preview only"));
  assert.ok(html.includes("/api/cohorts/cohort-preview/compliance-pdf"));
  assert.ok(!html.includes("Export Play Console Audit PDF"));
});

test("the final export unlocks only when every day meets required tester coverage", () => {
  const oneTesterPerDay = renderToStaticMarkup(createElement(GooglePlayComplianceCard, {
    cohortId: "under-covered",
    targetDays: 14,
    requiredTesters: 12,
    status: "ACTIVE",
    pings: pings(14, 1),
  }));
  assert.ok(oneTesterPerDay.includes("Coverage 00 / 14 days"));
  assert.ok(oneTesterPerDay.includes("Download In-Progress Preview PDF"));

  const fullyCovered = renderToStaticMarkup(createElement(GooglePlayComplianceCard, {
    cohortId: "complete",
    targetDays: 14,
    requiredTesters: 12,
    status: "READY_FOR_REVIEW",
    pings: pings(14, 12),
  }));
  assert.ok(fullyCovered.includes("Coverage 14 / 14 days"));
  assert.ok(fullyCovered.includes("Export Play Console Audit PDF"));
  assert.ok(fullyCovered.includes("Zero lapsed days"));
  assert.ok(!fullyCovered.includes("Preview only"));
});

test("the PDF route marks incomplete exports as previews", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile("app/api/cohorts/[id]/compliance-pdf/route.tsx", "utf8"));
  assert.match(source, /IN-PROGRESS PREVIEW · NOT READY FOR PRODUCTION-ACCESS SUBMISSION/);
  assert.match(source, /complete \? "audit" : "preview"/);
  assert.match(source, /size >= campaign\.compliance!\.requiredTesters/);
});
