import test from "node:test";
import assert from "node:assert/strict";
import { academyQuests, applicationEligibility, exchangeItems, utcDay } from "../lib/quest-rules";

test("REP eligibility honors strict thresholds and developer discovery floors", () => {
  assert.equal(applicationEligibility(1500, 1500, false, 0), "standard");
  assert.equal(applicationEligibility(1499, 1500, false, 0), "locked");
  assert.equal(applicationEligibility(900, 1500, true, 900), "pass");
  assert.equal(applicationEligibility(899, 1500, true, 900), "locked");
  assert.equal(applicationEligibility(0, 0, false, 0), "standard");
});

test("daily reset keys use UTC rather than client time zones", () => {
  assert.equal(utcDay(new Date("2026-10-02T23:59:59Z")), "2026-10-02");
  assert.equal(utcDay(new Date("2026-10-03T00:00:00Z")), "2026-10-03");
});

test("academy quests have unique ids and valid scored answers", () => {
  assert.equal(academyQuests.length, 12);
  assert.equal(new Set(academyQuests.map((quest) => quest.id)).size, academyQuests.length);
  for (const quest of academyQuests) assert.ok(quest.options[quest.answer]);
});

test("exchange always offers repeatable access and permanent cosmetics at positive prices", () => {
  assert.equal(exchangeItems.find((item) => item.id === "pass")?.repeatable, true);
  assert.equal(exchangeItems.find((item) => item.id === "pass")?.cost, 300);
  for (const item of exchangeItems) assert.ok(item.cost > 0);
});
