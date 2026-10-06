import assert from "node:assert/strict";
import test from "node:test";
import { AUTO_APPROVE_AFTER_MS, autoApproveDeadlineFrom, isAutoApprovalDue } from "../lib/auto-approval-window";
import { recordingHref, isStoredRecording, STORED_RECORDING_PREFIX } from "../lib/recording";
import { describeDevice, formatRankLevel, validatorNodeId } from "../lib/validator-identity";

test("auto-approval window is 48 hours from submission", () => {
  assert.equal(AUTO_APPROVE_AFTER_MS, 48 * 60 * 60 * 1000);
  const submitted = new Date("2026-01-01T00:00:00Z");
  assert.equal(autoApproveDeadlineFrom(submitted)?.toISOString(), "2026-01-03T00:00:00.000Z");
});

test("auto-approval is only due after the window elapses", () => {
  const base = { status: "PENDING", submittedAt: new Date("2026-01-01T00:00:00Z"), revisionRequestedAt: null, feedbackText: "Steps worked fine", proofImageUrl: null };
  assert.equal(isAutoApprovalDue(base, new Date("2026-01-02T23:59:59Z")), false);
  assert.equal(isAutoApprovalDue(base, new Date("2026-01-03T00:00:01Z")), true);
  const later = new Date("2030-01-01T00:00:00Z");
  assert.equal(isAutoApprovalDue({ ...base, submittedAt: null }, later), false);
  assert.equal(isAutoApprovalDue({ ...base, revisionRequestedAt: new Date() }, later), false);
  assert.equal(isAutoApprovalDue({ ...base, status: "APPROVED" }, later), false);
  assert.equal(isAutoApprovalDue({ ...base, feedbackText: null }, later), false);
});

test("validator node ids are stable and formatted", () => {
  const id = validatorNodeId("user_abc");
  assert.match(id, /^NODE-SE-\d{4}$/);
  assert.equal(validatorNodeId("user_abc"), id);
  assert.equal(formatRankLevel("CORE_VALIDATOR"), "LEVEL 02");
});

test("device descriptions come from the user agent", () => {
  assert.deepEqual(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X)"), { model: "iPhone", os: "iOS 18.2", platform: "iOS" });
  const pixel = describeDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36");
  assert.equal(pixel.os, "Android 14");
  assert.equal(pixel.model, "Pixel 8");
});

test("stored recordings resolve to the authenticated route", () => {
  assert.equal(isStoredRecording(`${STORED_RECORDING_PREFIX}abc/x.mp4`), true);
  assert.equal(recordingHref("sub1", `${STORED_RECORDING_PREFIX}sub1/x.mp4`), "/api/submissions/sub1/recording");
  assert.equal(recordingHref("sub1", "https://example.com/v.mp4"), "https://example.com/v.mp4");
  assert.equal(recordingHref("sub1", null), null);
});
