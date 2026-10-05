import test from "node:test";
import assert from "node:assert/strict";
import { resolveTaskMinimumRep, SEED_TASK_PRESETS } from "../lib/micro-task-templates";
import { applicationEligibility } from "../lib/quest-rules";

test("testing missions have stable unique IDs and the four requested groups", () => {
  assert.equal(SEED_TASK_PRESETS.length, 10);
  assert.equal(new Set(SEED_TASK_PRESETS.map((preset) => preset.id)).size, 10);
  assert.deepEqual(Array.from(new Set(SEED_TASK_PRESETS.map((preset) => preset.category))), [
    "Core Flows", "Stress & Performance", "Commerce & Auth", "Bug Hunting & Device",
  ]);
  assert.deepEqual(["Core Flows", "Stress & Performance", "Commerce & Auth", "Bug Hunting & Device"].map((category) => SEED_TASK_PRESETS.filter((preset) => preset.category === category).length), [3, 3, 2, 2]);
});

test("every preset fits the existing task validation and has a positive duration", () => {
  for (const preset of SEED_TASK_PRESETS) {
    assert.ok(preset.title.length >= 3 && preset.title.length <= 90, preset.id);
    assert.ok(preset.defaultDescription.length >= 12 && preset.defaultDescription.length <= 900, preset.id);
    assert.ok(Number.isInteger(preset.estimatedMinutes) && preset.estimatedMinutes > 0, preset.id);
  }
  assert.equal(SEED_TASK_PRESETS.find((preset) => preset.id === "screen-record-repro")?.estimatedMinutes, 10);
  assert.equal(SEED_TASK_PRESETS.find((preset) => preset.id === "checkout-iap-sandbox")?.estimatedMinutes, 8);
});

test("SeedEnv assigns REP automatically by preset rather than trusting lower client values", () => {
  for (const preset of SEED_TASK_PRESETS) {
    const expected = preset.category === "Core Flows" || preset.id === "specific-device-screen-fit" ? 0 : 1500;
    assert.equal(resolveTaskMinimumRep({ presetId: preset.id, instructionTitle: "Edited custom title", minimumRep: 0 }), expected, preset.id);
    assert.equal(resolveTaskMinimumRep({ instructionTitle: preset.title }), expected, preset.id);
  }
  assert.equal(resolveTaskMinimumRep({ instructionTitle: "Custom instructions" }), 0);
  assert.equal(resolveTaskMinimumRep({ presetId: "offline-reconnect", instructionTitle: "Offline sync", minimumRep: 6000 }), 6000);
  assert.equal(resolveTaskMinimumRep({ instructionTitle: "Existing draft instructions", minimumRep: 300 }), 300);
});

test("automatic REP filters applicants while honoring developer Discovery rules", () => {
  const required = resolveTaskMinimumRep({ presetId: "auth-providers-test", instructionTitle: "Auth" });
  assert.equal(applicationEligibility(1499, required, false, 0), "locked");
  assert.equal(applicationEligibility(1500, required, false, 0), "standard");
  assert.equal(applicationEligibility(900, required, true, 900), "pass");
  assert.equal(applicationEligibility(899, required, true, 900), "locked");
  assert.equal(applicationEligibility(0, resolveTaskMinimumRep({ instructionTitle: "Custom instructions" }), false, 0), "standard");
});