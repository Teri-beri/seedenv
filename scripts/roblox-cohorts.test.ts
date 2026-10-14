import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PlatformType, RobloxAuditFocus } from "@prisma/client";
import { launchWizardDraftSchema } from "../lib/launch-wizard-draft";
import { buildRobloxLaunchUrl, extractRobloxPlaceId, isRobloxAccessMethod, isRobloxExperienceUrl, isRobloxPlaceId, parseRobloxDeviceConstraints, ROBLOX_AUDIT_FOCUS_LABELS } from "../lib/roblox-cohorts";
import { platformTag } from "../lib/billing";

test("Roblox experience URLs require HTTPS, a Roblox host, and a numeric games path", () => {
  assert.equal(isRobloxExperienceUrl("https://www.roblox.com/games/123456789/My-Experience"), true);
  assert.equal(isRobloxExperienceUrl("https://roblox.com/games/987654321"), true);
  assert.equal(isRobloxExperienceUrl("http://www.roblox.com/games/123456789/unsafe"), false);
  assert.equal(isRobloxExperienceUrl("https://roblox.example/games/123456789/fake"), false);
  assert.equal(isRobloxExperienceUrl("https://www.roblox.com/catalog/123456789/item"), false);
});

test("Roblox access methods accept place IDs and preserve private server links", () => {
  const privateServerUrl = "https://www.roblox.com/share?code=secret&type=Server";
  assert.equal(isRobloxExperienceUrl(privateServerUrl), true);
  assert.equal(isRobloxPlaceId("123456789"), true);
  assert.equal(isRobloxPlaceId("placeId=123456789"), false);
  assert.equal(isRobloxAccessMethod("123456789"), true);
  assert.equal(isRobloxAccessMethod(privateServerUrl), true);
  assert.equal(isRobloxAccessMethod("not-a-place-id"), false);
  assert.equal(extractRobloxPlaceId("123456789"), "123456789");
  assert.equal(extractRobloxPlaceId("https://www.roblox.com/games/987654321/My-Experience"), "987654321");
  assert.equal(buildRobloxLaunchUrl(privateServerUrl), privateServerUrl);
  assert.equal(buildRobloxLaunchUrl("123456789"), "roblox://placeId=123456789");
  assert.equal(buildRobloxLaunchUrl(null, "987654321"), "roblox://placeId=987654321");
});

test("Roblox audit focuses have stable operator-facing labels", () => {
  assert.deepEqual(Object.keys(ROBLOX_AUDIT_FOCUS_LABELS).sort(), Object.values(RobloxAuditFocus).sort());
  assert.equal(ROBLOX_AUDIT_FOCUS_LABELS.MOBILE_GUI_SCALING, "Mobile Notch & Dynamic Island UI Scaling");
  assert.equal(ROBLOX_AUDIT_FOCUS_LABELS.LOW_END_MEMORY_THROTTLE, "Low-Memory Stress & Crash Profiling (RAM ≤ 4GB)");
  assert.equal(ROBLOX_AUDIT_FOCUS_LABELS.CONCURRENT_SERVER_STRESS, "Multiplayer Server Latency & Physics Replication");
  assert.equal(platformTag(PlatformType.ROBLOX_EXPERIENCE), "Roblox");
});

test("Roblox device constraints survive database draft restoration", () => {
  assert.deepEqual(parseRobloxDeviceConstraints(null), { mobileOnly: true, allowIpad: false, allowDesktop: false });
  assert.deepEqual(parseRobloxDeviceConstraints({ mobileOnly: false, allowIpad: true, allowDesktop: true }), {
    mobileOnly: false,
    allowIpad: true,
    allowDesktop: true,
  });
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
  const [actions, submissionActions, studio, missionExperience, recordingRoute, publicLanding, cohortPage, platformMigration, deepLinkMigration] = await Promise.all([
    readFile("app/actions/campaignActions.ts", "utf8"),
    readFile("app/actions/submissionActions.ts", "utf8"),
    readFile("components/developer-studio.tsx", "utf8"),
    readFile("components/mission-experience.tsx", "utf8"),
    readFile("app/api/submissions/[id]/recording/route.ts", "utf8"),
    readFile("components/public-landing.tsx", "utf8"),
    readFile("app/(public)/cohorts/[id]/page.tsx", "utf8"),
    readFile("prisma/migrations/20261013_roblox_experience_cohorts/migration.sql", "utf8"),
    readFile("prisma/migrations/20261013_roblox_deep_link_fields/migration.sql", "utf8"),
  ]);
  for (const field of ["robloxExperienceUrl", "robloxUniverseId", "robloxPlaceId", "robloxAuditFocus", "minMemoryGB"]) {
    assert.ok(actions.includes(field), `campaign action must persist ${field}`);
    assert.ok(studio.includes(field), `launch wizard must collect ${field}`);
  }
  assert.ok(actions.includes("robloxDeviceConstraints"), "campaign action must persist Roblox device constraints");
  for (const field of ["robloxMobileOnly", "robloxAllowIpad", "robloxAllowDesktop"]) {
    assert.ok(studio.includes(field), `launch wizard must collect ${field}`);
  }
  assert.match(studio, /type="text"[\s\S]*robloxExperienceUrl/);
  assert.match(missionExperience, /buildRobloxLaunchUrl\(activeMission\.robloxExperienceUrl \|\| activeMission\.appUrl, activeMission\.robloxPlaceId\)/);
  assert.match(missionExperience, /In-Game Telemetry Protocol/);
  assert.match(missionExperience, /Developer console \(\/console\) captured in recording/);
  assert.match(missionExperience, /Submit Roblox Telemetry Proof/);
  assert.match(submissionActions, /robloxUsername/);
  assert.match(submissionActions, /robloxChecklist/);
  assert.match(recordingRoute, /MAX_ROBLOX_RECORDING_BYTES = 150 \* 1024 \* 1024/);
  assert.match(publicLanding, /ROBLOX_EXPERIENCE: "Roblox \/ Experience"/);
  assert.match(cohortPage, /Open on Roblox/);
  assert.match(platformMigration, /ALTER TYPE "PlatformType" ADD VALUE IF NOT EXISTS 'ROBLOX_EXPERIENCE'/);
  assert.match(platformMigration, /CREATE TYPE "RobloxAuditFocus"/);
  assert.match(deepLinkMigration, /"roblox_place_id" TEXT/);
  assert.match(deepLinkMigration, /"roblox_device_constraints" JSONB/);
  assert.match(deepLinkMigration, /"roblox_username" TEXT/);
  assert.match(deepLinkMigration, /"roblox_checklist" JSONB/);
});
