import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PlatformType, RobloxAuditFocus } from "@prisma/client";
import { launchWizardDraftSchema } from "../lib/launch-wizard-draft";
import { isRobloxExperienceUrl, ROBLOX_AUDIT_FOCUS_LABELS } from "../lib/roblox-cohorts";
import { platformTag } from "../lib/billing";

test("Roblox experience URLs require HTTPS, a Roblox host, and a numeric games path", () => {
  assert.equal(isRobloxExperienceUrl("https://www.roblox.com/games/123456789/My-Experience"), true);
  assert.equal(isRobloxExperienceUrl("https://roblox.com/games/987654321"), true);
  assert.equal(isRobloxExperienceUrl("http://www.roblox.com/games/123456789/unsafe"), false);
  assert.equal(isRobloxExperienceUrl("https://roblox.example/games/123456789/fake"), false);
  assert.equal(isRobloxExperienceUrl("https://www.roblox.com/catalog/123456789/item"), false);
});

test("Roblox audit focuses have stable operator-facing labels", () => {
  assert.deepEqual(Object.keys(ROBLOX_AUDIT_FOCUS_LABELS).sort(), Object.values(RobloxAuditFocus).sort());
  assert.equal(ROBLOX_AUDIT_FOCUS_LABELS.LOW_END_MEMORY_THROTTLE, "Low-end memory throttle");
  assert.equal(platformTag(PlatformType.ROBLOX_EXPERIENCE), "Roblox");
});

test("launch autosave retains incomplete Roblox telemetry targeting fields", () => {
  const parsed = launchWizardDraftSchema.parse({
    version: 1,
    form: {
      title: "Roblox stress audit",
      platform: "ROBLOX_EXPERIENCE",
      appUrl: "https://www.roblox.com/games/123456789/My-Experience",
      robloxExperienceUrl: "https://www.roblox.com/games/123456789/My-Experience",
      robloxUniverseId: "123456789",
      robloxAuditFocus: "CONCURRENT_SERVER_STRESS",
      minMemoryGB: 3,
      targetVibe: "Roblox players",
      description: "",
      totalSlots: 20,
      bountyPerTaskUsd: 5,
      instructions: [],
      discoveryAllowed: false,
      discoveryMinRep: 0,
      cohortType: "STANDARD_QA",
      hardwareStrict: true,
    },
    step: 1,
    highestStep: 1,
    topUpTesters: 5,
    iconFileName: "",
    ai: { open: false, description: "", notes: "", audience: "" },
  });
  assert.equal(parsed.form.platform, "ROBLOX_EXPERIENCE");
  assert.equal(parsed.form.robloxAuditFocus, "CONCURRENT_SERVER_STRESS");
  assert.equal(parsed.form.minMemoryGB, 3);
});

test("campaign creation and public discovery wire every Roblox field", async () => {
  const [actions, studio, publicLanding, cohortPage, migration] = await Promise.all([
    readFile("app/actions/campaignActions.ts", "utf8"),
    readFile("components/developer-studio.tsx", "utf8"),
    readFile("components/public-landing.tsx", "utf8"),
    readFile("app/(public)/cohorts/[id]/page.tsx", "utf8"),
    readFile("prisma/migrations/20261013_roblox_experience_cohorts/migration.sql", "utf8"),
  ]);
  for (const field of ["robloxExperienceUrl", "robloxUniverseId", "robloxAuditFocus", "minMemoryGB"]) {
    assert.ok(actions.includes(field), `campaign action must persist ${field}`);
    assert.ok(studio.includes(field), `launch wizard must collect ${field}`);
  }
  assert.match(publicLanding, /ROBLOX_EXPERIENCE: "Roblox \/ Experience"/);
  assert.match(cohortPage, /Open on Roblox/);
  assert.match(migration, /ALTER TYPE "PlatformType" ADD VALUE IF NOT EXISTS 'ROBLOX_EXPERIENCE'/);
  assert.match(migration, /CREATE TYPE "RobloxAuditFocus"/);
});
