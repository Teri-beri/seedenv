import test from "node:test";
import assert from "node:assert/strict";
import { assertClipTransition, clipCampaignSchema, clipChargeCents, publicationIdentity, clipTermsVersion } from "../lib/clipper-rules";

test("creator fee uses integer cents, includes the platform share, and has exact limits", () => {
  assert.equal(clipChargeCents(1000), 1370);
  assert.equal(clipChargeCents(5000), 5953);
  assert.equal(clipChargeCents(100000), 118466);
  assert.equal(clipChargeCents(1001), 1371);
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

test("clipper pricing keeps the full platform fee after Stripe's cut", async () => {
  const { quoteClipperCharge, stripeProcessingCostCents } = await import("../lib/pricing");
  for (const creator of [1000, 1999, 5000, 33333, 100000]) {
    const quote = quoteClipperCharge(creator);
    assert.ok(quote.platformFeeCents >= 300);
    assert.equal(quote.totalCents, creator + quote.platformFeeCents + quote.transactionFeeCents);
    assert.ok(quote.totalCents - creator - stripeProcessingCostCents(quote.totalCents) >= quote.platformFeeCents);
  }
  assert.equal(quoteClipperCharge(5000, true).platformFeeCents, 0);
  assert.ok(quoteClipperCharge(5000, true).transactionFeeCents > 0);
});

test("every agreement status has a readable label and active ones tell each party what to do", async () => {
  const { clipStatus, clipStatusLabel, clipNextStep } = await import("../lib/clipper-rules");
  for (const status of clipStatus) assert.doesNotMatch(clipStatusLabel(status), /_/);
  for (const status of ["APPLIED", "ACCEPTED", "FUNDED", "DRAFT_SUBMITTED", "DRAFT_APPROVED", "PROOF_SUBMITTED", "VERIFIED"]) {
    assert.ok(clipNextStep(status, "DEVELOPER"));
    assert.ok(clipNextStep(status, "CREATOR"));
  }
});

test("creator profiles require curated genres and authentic social profile URL shapes", async () => {
  const { clipProfileSchema, clipSocialLinks, socialProfileIdentity, clipFeeInputSchema, clipEligibility } = await import("../lib/clipper-rules");
  const profile = { bio: "I create original mobile gaming tutorials.", portfolioUrl: "https://example.invalid/samples", socialUrl: "https://tiktok.com/@creator?tracking=1", specialties: "Mobile gamers and students", genres: ["Gaming", "Tech & apps"], instagramUrl: "https://www.instagram.com/creator/" };
  const parsed = clipProfileSchema.parse(profile);
  assert.equal(parsed.socialUrl, "https://www.tiktok.com/@creator");
  assert.equal(clipProfileSchema.safeParse({ ...profile, tiktokUrl: "https://www.tiktok.com/@different" }).success, false);
  assert.equal(clipProfileSchema.safeParse({ ...profile, tiktokUrl: "https://tiktok.com/@creator/" }).success, true);
  assert.deepEqual(clipSocialLinks(parsed).map((link) => link.platform), ["TIKTOK", "INSTAGRAM"]);
  for (const invalid of [{ genres: [] }, { genres: ["not-a-genre"] }, { genres: ["Gaming", "Gaming"] }, { genres: ["Gaming", "Tech & apps", "Lifestyle", "Comedy", "Fitness", "Education"] }, { socialUrl: "https://tiktok.com/@creator/video/123" }, { instagramUrl: "https://youtube.com/@creator" }]) assert.equal(clipProfileSchema.safeParse({ ...profile, ...invalid }).success, false);
  for (const url of ["https://tiktok.com.evil.invalid/@creator", "https://instagram.com/reels", "https://instagram.com/accounts/login", "https://youtu.be/abcdefghijk", "https://youtube.com/watch?v=abcdefghijk", "http://tiktok.com/@creator", "https://tiktok.com:444/@creator"]) assert.throws(() => socialProfileIdentity(url));
  assert.equal(clipFeeInputSchema.parse("50.01"), 5001);
  for (const value of ["10.001", "1e2", "0", "-10", "1000.01", "NaN"]) assert.equal(clipFeeInputSchema.safeParse(value).success, false);
  const creator = { emailVerified: new Date(), xpPoints: 100 };
  assert.equal(clipEligibility(creator, { ...parsed, status: "APPROVED" }, { platform: "TIKTOK", minimumRep: 100 }), null);
  assert.match(clipEligibility(creator, { ...parsed, status: "PENDING_REVIEW" }, { platform: "TIKTOK", minimumRep: 0 })!, /approved/);
  assert.match(clipEligibility(creator, { ...parsed, status: "APPROVED" }, { platform: "YOUTUBE", minimumRep: 0 })!, /youtube/);
  assert.match(clipEligibility(creator, { ...parsed, status: "APPROVED" }, { platform: "TIKTOK", minimumRep: 101 })!, /101 REP/);
});
