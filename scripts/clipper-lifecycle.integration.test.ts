import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { applyClip, disputeClip, reviewClipApplication, reviewClipDraft, submitClipDraft, submitClipPublication, verifyClipManually } from "../lib/clipper-lifecycle";

test("Clippers lifecycle preserves contract permissions and evidence (rollback-only PostgreSQL)", { skip: process.env.RUN_CLIPPER_DB_TESTS !== "1" }, async () => {
  const marker = `clip-test-${randomUUID()}`;
  const rollback = new Error("Intentional Clippers rollback");
  try {
    await prisma.$transaction(async (tx) => {
      const developer = await tx.user.create({ data: { email: `${marker}-dev@example.invalid`, role: "DEVELOPER" } });
      const creator = await tx.user.create({ data: { email: `${marker}-creator@example.invalid`, role: "TESTER", xpPoints: 200 } });
      const stranger = await tx.user.create({ data: { email: `${marker}-stranger@example.invalid`, role: "TESTER" } });
      const campaign = await tx.clipCampaign.create({ data: { developerId: developer.id, title: "Rollback creator brief", appUrl: "https://example.invalid", brief: "Show a real onboarding demo with licensed media and sponsorship disclosure.", platform: "TIKTOK", feeCents: 5000, minimumRep: 100, revisionLimit: 1 } });
      await assert.rejects(applyClip(tx, creator.id, campaign.id, "Audience and original video experience"), /Verify your email/);
      await tx.user.update({ where: { id: creator.id }, data: { emailVerified: new Date() } });
      await assert.rejects(applyClip(tx, creator.id, campaign.id, "Audience and original video experience"), /profile/);
      await tx.clipProfile.create({ data: { userId: creator.id, bio: "An experienced mobile app creator.", portfolioUrl: "https://example.invalid/portfolio", socialUrl: "https://www.tiktok.com/@fixture", specialties: "Mobile apps" } });
      const item = await applyClip(tx, creator.id, campaign.id, "Audience and original video experience");
      assert.equal(item.status, "APPLIED");
      assert.equal(item.feeCents, 5000);
      assert.equal(item.chargeCents, 5435);
      assert.equal(item.termsVersion, "clippers-v1-organic-90");
      await assert.rejects(applyClip(tx, creator.id, campaign.id, "Duplicate application note"), /already applied/);
      await assert.rejects(reviewClipApplication(tx, stranger.id, item.id, true), /not found/);
      await assert.rejects(submitClipDraft(tx, creator.id, item.id, "missing"), /unavailable/);
      await reviewClipApplication(tx, developer.id, item.id, true);
      await assert.rejects(reviewClipApplication(tx, developer.id, item.id, true), /unavailable/);
      await assert.rejects(submitClipDraft(tx, creator.id, item.id, "missing"), /unavailable/);
      await tx.clipEngagement.update({ where: { id: item.id }, data: { status: "FUNDED", fundedAt: new Date(Date.now() - 1000) } });
      const draft = await tx.clipAsset.create({ data: { campaignId: campaign.id, engagementId: item.id, ownerId: creator.id, kind: "DRAFT", path: `${marker}/draft`, name: "draft.mp4", mimeType: "video/mp4", sizeBytes: 1000, ready: true } });
      await assert.rejects(submitClipDraft(tx, stranger.id, item.id, draft.id), /not found/);
      await submitClipDraft(tx, creator.id, item.id, draft.id);
      await assert.rejects(submitClipPublication(tx, creator.id, item.id, "https://www.tiktok.com/@fixture/video/7080213458555737986", "missing"), /unavailable/);
      await assert.rejects(reviewClipDraft(tx, stranger.id, item.id, true, ""), /not found/);
      await reviewClipDraft(tx, developer.id, item.id, false, "Please correct the ending call to action.");
      assert.equal((await tx.clipEngagement.findUniqueOrThrow({ where: { id: item.id } })).revisionCount, 1);
      await assert.rejects(submitClipDraft(tx, creator.id, item.id, draft.id), /new version/);
      const revised = await tx.clipAsset.create({ data: { campaignId: campaign.id, engagementId: item.id, ownerId: creator.id, kind: "DRAFT", path: `${marker}/revision`, name: "revision.mp4", mimeType: "video/mp4", sizeBytes: 1100, ready: true } });
      await submitClipDraft(tx, creator.id, item.id, revised.id);
      await assert.rejects(reviewClipDraft(tx, developer.id, item.id, false, "Another change beyond the agreed round"), /limit/);
      await reviewClipDraft(tx, developer.id, item.id, true, "Approved for publication.");
      const approved = await tx.clipEngagement.findUniqueOrThrow({ where: { id: item.id } });
      assert.equal(approved.approvedDraftId, revised.id);
      assert.ok(approved.approvedAt);
      await assert.rejects(submitClipPublication(tx, creator.id, item.id, "https://www.tiktok.com/@fixture/video/7080213458555737986", draft.id), /evidence/);
      const proof = await tx.clipAsset.create({ data: { campaignId: campaign.id, engagementId: item.id, ownerId: creator.id, kind: "PROOF", path: `${marker}/proof`, name: "proof.png", mimeType: "image/png", sizeBytes: 1000, ready: true } });
      await assert.rejects(submitClipPublication(tx, creator.id, item.id, "https://evil.invalid/video/7080213458555737986", proof.id), /platform/);
      await submitClipPublication(tx, creator.id, item.id, "https://www.tiktok.com/@fixture/video/7080213458555737986", proof.id);
      await assert.rejects(verifyClipManually(tx, stranger.id, item.id, "Checked ownership and posted video."), /not found/);
      await verifyClipManually(tx, developer.id, item.id, "Checked account ownership, caption, disclosure, and approved video.");
      const verified = await tx.clipEngagement.findUniqueOrThrow({ where: { id: item.id } });
      assert.equal(verified.status, "VERIFIED");
      assert.equal(verified.verificationMethod, "DEVELOPER_MANUAL");
      assert.equal(verified.paidAt, null);
      assert.equal(verified.licenseEndsAt, null);
      await assert.rejects(disputeClip(tx, stranger.id, item.id, "A stranger cannot freeze this contract."), /not found/);
      await disputeClip(tx, creator.id, item.id, "The creator needs administrator review of the posting requirements.");
      const disputed = await tx.clipEngagement.findUniqueOrThrow({ where: { id: item.id } });
      assert.equal(disputed.status, "DISPUTED");
      assert.equal(disputed.statusBeforeDispute, "VERIFIED");
      await assert.rejects(verifyClipManually(tx, developer.id, item.id, "Another verification attempt should not work."), /unavailable/);
      assert.equal(await tx.walletTransaction.count({ where: { userId: creator.id } }), 0);
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: creator.id } })).xpPoints, 200);
      throw rollback;
    }, { timeout: 60000 });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    try { assert.equal(await prisma.user.count({ where: { email: { startsWith: marker } } }), 0); }
    finally { await prisma.$disconnect(); }
  }
});
