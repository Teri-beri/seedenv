import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { awardQuestXp, qualifyReferral, spendQuestXp } from "../lib/quest-ledger";
import { closeMissionApplication, createMissionApplication, reviewMissionApplication, startAcceptedApplication } from "../lib/mission-applications";

test("real PostgreSQL ledger and referral lifecycle (all fixtures are rolled back)", { skip: process.env.RUN_QUEST_DB_TESTS !== "1" }, async () => {
  const marker = `quest-test-${randomUUID()}`;
  const rollback = new Error("Intentional fixture rollback");
  try {
    await prisma.$transaction(async (tx) => {
      const inviter = await tx.user.create({ data: { email: `${marker}-inviter@example.invalid`, role: "TESTER", testerWorkspaceEnabled: true } });
      const friend = await tx.user.create({ data: { email: `${marker}-friend@example.invalid`, role: "TESTER", testerWorkspaceEnabled: true } });
      await tx.referral.create({ data: { inviterId: inviter.id, friendId: friend.id } });
      await qualifyReferral(tx, friend.id);
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: inviter.id } })).questXp, 0);
      assert.equal(await awardQuestXp(tx, inviter.id, "daily:test", 5, "Daily test"), true);
      assert.equal(await awardQuestXp(tx, inviter.id, "daily:test", 5, "Daily test"), false);
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: inviter.id } })).questXp, 5);
      await assert.rejects(spendQuestXp(tx, inviter.id, "pass"), /more Quest XP/);
      const campaign = await tx.appCampaign.create({ data: { developerId: inviter.id, title: "Integration fixture", platform: "WEB_STAGING", appUrl: "https://example.invalid", targetVibe: "Test", description: "Rollback-only fixture", totalBudgetUsd: 0, bountyPerTaskUsd: 0, platformFeeUsd: 0, totalSlots: 1, expiresAt: new Date(Date.now() + 3600000) } });
      await tx.submission.create({ data: { campaignId: campaign.id, testerId: friend.id, status: "APPROVED", payoutCents: 0, expiresAt: new Date() } });
      await qualifyReferral(tx, friend.id);
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: inviter.id } })).questXp, 5);
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: friend.id } })).questXp, 0);
      await tx.user.update({ where: { id: friend.id }, data: { emailVerified: new Date() } });
      await qualifyReferral(tx, friend.id);
      await qualifyReferral(tx, friend.id);
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: inviter.id } })).questXp, 205);
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: inviter.id } })).discoveryPasses, 1);
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: friend.id } })).questXp, 100);
      await awardQuestXp(tx, inviter.id, "extra:test", 300, "Test award");
      await spendQuestXp(tx, inviter.id, "pass");
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: inviter.id } })).questXp, 205);
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: inviter.id } })).discoveryPasses, 2);
      await spendQuestXp(tx, inviter.id, "violet");
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: inviter.id } })).questTheme, "violet");
      await assert.rejects(spendQuestXp(tx, inviter.id, "violet"), /already own/);
      for (let index = 0; index < 3; index++) {
        const extra = await tx.user.create({ data: { email: `${marker}-${index}@example.invalid`, emailVerified: new Date() } });
        await tx.referral.create({ data: { inviterId: inviter.id, friendId: extra.id } });
        await tx.submission.create({ data: { campaignId: campaign.id, testerId: extra.id, status: "APPROVED", payoutCents: 0, expiresAt: new Date() } });
        await qualifyReferral(tx, extra.id);
      }
      assert.equal(await tx.referral.count({ where: { inviterId: inviter.id, qualifiedAt: { not: null } } }), 3);
      assert.equal(await tx.referral.count({ where: { inviterId: inviter.id, qualifiedAt: null } }), 1);
      const applicationCampaign = await tx.appCampaign.create({ data: { developerId: inviter.id, title: "Application fixture", platform: "WEB_STAGING", appUrl: "https://example.invalid", targetVibe: "Test", description: "Rollback-only application fixture", totalBudgetUsd: 0, bountyPerTaskUsd: 0, platformFeeUsd: 0, totalSlots: 1, status: "ACTIVE", discoveryAllowed: true, discoveryMinRep: 0, expiresAt: new Date(Date.now() + 86400000), instructions: { create: [{ stepNumber: 1, instructionTitle: "Test", instructionDetail: "Test requirement", proofType: "SCREENSHOT", minimumRep: 1500 }] } } });
      await assert.rejects(startAcceptedApplication(tx, friend.id, applicationCampaign.id), /acceptance/);
      await assert.rejects(createMissionApplication(tx, friend.id, applicationCampaign.id, "Useful application note"), /Discovery Pass/);
      await tx.user.update({ where: { id: friend.id }, data: { discoveryPasses: 1 } });
      const application = await createMissionApplication(tx, friend.id, applicationCampaign.id, "Useful application note");
      assert.equal(application.passReserved, true);
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: friend.id } })).discoveryPasses, 0);
      await assert.rejects(createMissionApplication(tx, friend.id, applicationCampaign.id, "Duplicate request"), /already applied/);
      await assert.rejects(reviewMissionApplication(tx, friend.id, application.id, "accept"), /not found/);
      await reviewMissionApplication(tx, inviter.id, application.id, "decline");
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: friend.id } })).discoveryPasses, 1);
      const reapplied = await createMissionApplication(tx, friend.id, applicationCampaign.id, "Corrected application note");
      await reviewMissionApplication(tx, inviter.id, reapplied.id, "accept");
      assert.equal((await tx.missionApplication.findUniqueOrThrow({ where: { id: reapplied.id } })).status, "ACCEPTED");
      assert.equal(await tx.submission.count({ where: { campaignId: applicationCampaign.id } }), 0);
      const competitor = await tx.user.create({ data: { email: `${marker}-competitor@example.invalid`, xpPoints: 2000 } });
      const otherApplication = await createMissionApplication(tx, competitor.id, applicationCampaign.id, "A second tester request");
      assert.equal(otherApplication.passReserved, false);
      await assert.rejects(reviewMissionApplication(tx, inviter.id, otherApplication.id, "accept"), /reserved/);
      await closeMissionApplication(tx, friend.id, reapplied.id);
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: friend.id } })).discoveryPasses, 1);
      const restarted = await createMissionApplication(tx, friend.id, applicationCampaign.id, "A fresh request to join");
      await reviewMissionApplication(tx, inviter.id, restarted.id, "accept");
      await startAcceptedApplication(tx, friend.id, applicationCampaign.id);
      assert.equal((await tx.missionApplication.findUniqueOrThrow({ where: { id: restarted.id } })).status, "STARTED");
      assert.equal((await tx.missionApplication.findUniqueOrThrow({ where: { id: restarted.id } })).passReserved, false);
      await assert.rejects(startAcceptedApplication(tx, friend.id, applicationCampaign.id), /acceptance/);
      await assert.rejects(closeMissionApplication(tx, friend.id, restarted.id), /cannot be withdrawn/);
      await tx.submission.create({ data: { campaignId: applicationCampaign.id, testerId: friend.id, status: "REJECTED", payoutCents: 0, expiresAt: new Date() } });
      await tx.user.update({ where: { id: friend.id }, data: { discoveryPasses: 1 } });
      assert.equal((await createMissionApplication(tx, friend.id, applicationCampaign.id, "Retry after rejected work")).status, "PENDING");
      await closeMissionApplication(tx, friend.id, restarted.id);
      await tx.submission.update({ where: { campaignId_testerId: { campaignId: applicationCampaign.id, testerId: friend.id } }, data: { status: "EXPIRED" } });
      await tx.missionApplication.update({ where: { id: restarted.id }, data: { status: "STARTED" } });
      assert.equal((await createMissionApplication(tx, friend.id, applicationCampaign.id, "Retry after expired work")).status, "PENDING");
      await tx.appCampaign.update({ where: { id: applicationCampaign.id }, data: { discoveryAllowed: false } });
      const belowRep = await tx.user.create({ data: { email: `${marker}-lowrep@example.invalid`, discoveryPasses: 3 } });
      await assert.rejects(createMissionApplication(tx, belowRep.id, applicationCampaign.id, "Below strict threshold"), /requires 1500 REP/);
      throw rollback;
    }, { timeout: 60000 });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    try { assert.equal(await prisma.user.count({ where: { email: { startsWith: marker } } }), 0); }
    finally { await prisma.$disconnect(); }
  }
});
