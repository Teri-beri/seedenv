import test from "node:test";
import assert from "node:assert/strict";
import { assertClipTransition, clipCampaignSchema, clipChargeCents, publicationIdentity, clipTermsVersion } from "../lib/clipper-rules";

test("creator fee uses integer cents, includes the platform share, and has exact limits", () => {
  assert.equal(clipChargeCents(1000), 1087);
  assert.equal(clipChargeCents(5000), 5435);
  assert.equal(clipChargeCents(100000), 108696);
  for (const value of [999, 100001, 1000.5, NaN, Infinity]) assert.throws(() => clipChargeCents(value));
});

test("publication URLs enforce platform ownership hosts and video shapes", () => {
  assert.equal(publicationIdentity("https://www.tiktok.com/@creator/video/7080213458555737986?x=1", "TIKTOK").id, "7080213458555737986");
  assert.equal(publicationIdentity("https://www.instagram.com/reel/ABCdef123/", "INSTAGRAM").id, "ABCdef123");
  for (const url of ["https://youtu.be/abcdefghijk", "https://www.youtube.com/shorts/abcdefghijk", "https://www.youtube.com/watch?v=abcdefghijk"]) assert.equal(publicationIdentity(url, "YOUTUBE").id, "abcdefghijk");
  for (const url of ["http://www.tiktok.com/@creator/video/7080213458555737986", "https://www.tiktok.com.evil.test/@creator/video/7080213458555737986", "https://user:password@www.tiktok.com/@creator/video/7080213458555737986", "https://www.tiktok.com:444/@creator/video/7080213458555737986", "https://vm.tiktok.com/abc", "https://www.tiktok.com/@creator"]) assert.throws(() => publicationIdentity(url, "TIKTOK"));
  assert.throws(() => publicationIdentity("https://www.instagram.com/reel/ABCdef123/", "TIKTOK"));
});

test("workflow disallows unfunded work, unapproved publication, and premature payout", () => {
  for (const status of ["APPLIED", "ACCEPTED", "FUNDING", "DISPUTED", "PAID"]) assert.throws(() => assertClipTransition(status, ["FUNDED", "CHANGES_REQUESTED"]));
  assert.doesNotThrow(() => assertClipTransition("FUNDED", ["FUNDED", "CHANGES_REQUESTED"]));
  for (const status of ["FUNDED", "DRAFT_SUBMITTED", "CHANGES_REQUESTED"]) assert.throws(() => assertClipTransition(status, ["DRAFT_APPROVED", "PROOF_SUBMITTED"]));
  assert.throws(() => assertClipTransition("PROOF_SUBMITTED", ["VERIFIED", "PAYMENT_PENDING"]));
  assert.doesNotThrow(() => assertClipTransition("PAYMENT_PENDING", ["VERIFIED", "PAYMENT_PENDING"]));
});

test("campaign terms are bounded and versioned", () => {
  const input = { title: "Creator brief", appUrl: "https://example.invalid", brief: "Create an original mobile onboarding video with licensed media and sponsorship disclosure.", platform: "TIKTOK", feeCents: 5000, revisionLimit: 2, deliveryDays: 7, liveDays: 30, minimumRep: 0 };
  assert.equal(clipCampaignSchema.parse(input).feeCents, 5000);
  assert.equal(clipTermsVersion, "clippers-v1-organic-90");
  for (const invalid of [{ revisionLimit: 6 }, { deliveryDays: 0 }, { liveDays: 0 }, { feeCents: 100 }, { minimumRep: -1 }]) assert.equal(clipCampaignSchema.safeParse({ ...input, ...invalid }).success, false);
});
