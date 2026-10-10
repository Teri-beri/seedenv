import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type User } from "@prisma/client";
import { assignedCampaign, editDirectionsSchema, versionDirections } from "../lib/instruction-versions";

test("direction edits permit only existing titles/details and a revision precondition", () => {
  const input = { campaignId: "cohort", expectedRevision: 1, directions: [{ id: "step", instructionTitle: "Test onboarding", instructionDetail: "Complete the onboarding flow." }] };
  assert.ok(editDirectionsSchema.safeParse(input).success);
  for (const extra of [{ bountyPerTaskUsd: 0 }, { status: "COMPLETED" }, { totalSlots: 100 }]) assert.ok(!editDirectionsSchema.safeParse({ ...input, ...extra }).success);
  assert.ok(!editDirectionsSchema.safeParse({ ...input, directions: [{ ...input.directions[0], proofType: "TEXT_FEEDBACK" }] }).success);
  assert.ok(!editDirectionsSchema.safeParse({ ...input, expectedRevision: 0 }).success);
  assert.ok(!editDirectionsSchema.safeParse({ ...input, directions: [] }).success);
  assert.throws(() => versionDirections({ directions: [{ instructionTitle: "Incomplete snapshot" }] }));
});

test("assigned displays use pinned directions and refuse missing/mismatched versions", () => {
  const directions = [{ id: "step", stepNumber: 1, instructionTitle: "Original title", instructionDetail: "Original directions.", proofType: "SCREENSHOT" as const, minimumRep: 0 }];
  const campaign = { id: "cohort", instructionRevision: 2, instructions: [{ ...directions[0], campaignId: "cohort", instructionDetail: "New directions." }] };
  const version = { id: "version", campaignId: "cohort", revision: 1, directions, editedById: "developer", createdAt: new Date() };
  const assigned = assignedCampaign(campaign, version);
  assert.equal(assigned.instructions[0].instructionDetail, "Original directions.");
  assert.equal(assigned.acceptedInstructionRevision, 1);
  assert.equal(assigned.directionsUpdated, true);
  assert.equal(campaign.instructions[0].instructionDetail, "New directions.");
  assert.throws(() => assignedCampaign(campaign, null), /missing/);
  assert.throws(() => assignedCampaign(campaign, { ...version, campaignId: "other" }), /another cohort/);
});

test("versioned directions survive edits, both acceptance paths, claims, revisions and concurrent saves (sandbox PostgreSQL)", {
  skip: process.env.RUN_INSTRUCTION_VERSION_DB_TESTS !== "1",
}, async () => {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(url.hostname.startsWith("dpg-db4khrcs728c73flrip0-a") && url.pathname === "/seedenv_staging_db", "Only the isolated sandbox is allowed.");
  const db = new PrismaClient();
  const marker = `versions-${randomUUID()}`;
  const users: string[] = [];
  const campaigns: string[] = [];
  let member: User;
  const modules = [
    mock.module("../lib/prisma.ts", { namedExports: { prisma: db } }),
    mock.module("../lib/member.ts", { namedExports: { requireMember: async () => member } }),
    mock.module("../lib/auth.ts", { namedExports: { getCurrentUser: async () => member } }),
    mock.module("../lib/stripe.ts", { namedExports: { getStripe: () => { throw new Error("No Stripe requests allowed."); } } }),
    mock.module("../lib/notifications.ts", { namedExports: { notificationEnabled: () => false, sendNotificationEmail: async () => { throw new Error("No email allowed."); } } }),
    mock.module("../lib/ai/qa-audit.ts", { namedExports: { auditSubmission: async () => { throw new Error("No AI requests allowed."); } } }),
    mock.module("next/cache", { namedExports: { revalidatePath: () => {} } }),
  ];
  const previousTax = process.env.SEEDENV_STRIPE_TAX_ENABLED;
  process.env.SEEDENV_STRIPE_TAX_ENABLED = "0";
  try {
    const { editCohortDirections } = await import("../lib/instruction-versions");
    const { serializable } = await import("../lib/quest-ledger");
    const { reviewMissionApplication, createMissionApplication } = await import("../lib/mission-applications");
    const { acceptApplicationWithFunding } = await import("../lib/slot-funding");
    const { claimTaskSlot } = await import("../app/actions/submissionActions");
    const { requestMission } = await import("../app/actions/applicationActions");
    const { startProofRevision, requestProofRevision } = await import("../lib/submission-lifecycle");
    const makeUser = async (role: "DEVELOPER" | "TESTER") => {
      const user = await db.user.create({ data: { email: `${marker}-${users.length}@example.invalid`, role, fundingBalanceCents: 10000 } });
      users.push(user.id);
      return user;
    };
    const developer = await makeUser("DEVELOPER");
    const stranger = await makeUser("DEVELOPER");
    const firstTester = await makeUser("TESTER");
    const secondTester = await makeUser("TESTER");
    const makeCampaign = async (fundingModel: "PREPAID" | "PAY_PER_TESTER") => {
      const campaign = await db.appCampaign.create({ data: {
        developerId: developer.id, title: marker, platform: "WEB_STAGING", appUrl: "https://example.invalid", targetVibe: "Testing",
        description: "Testing instruction version preservation.", totalBudgetUsd: 1900 / 100, platformFeeUsd: 15,
        bountyPerTaskUsd: 4, totalSlots: 5, status: "ACTIVE", fundingModel, expiresAt: new Date(Date.now() + 86400000),
        instructions: { create: [{ stepNumber: 1, instructionTitle: "Original step", instructionDetail: "Follow the original onboarding directions.", proofType: "SCREENSHOT" }] },
      }, include: { instructions: true } });
      campaigns.push(campaign.id);
      return campaign;
    };
    for (const fundingModel of ["PREPAID", "PAY_PER_TESTER"] as const) {
      const campaign = await makeCampaign(fundingModel);
      const before = await db.appCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
      const apply = async (testerId: string) => {
        member = testerId === firstTester.id ? firstTester : secondTester;
        const result = await requestMission(campaign.id, "I will follow the assigned instructions.");
        assert.equal(result.ok, true, result.message);
        const duplicate = await requestMission(campaign.id, "I will follow the assigned instructions.");
        assert.equal(duplicate.ok, false);
        assert.match(duplicate.message, /already applied/);
        return db.missionApplication.findUniqueOrThrow({ where: { campaignId_testerId: { campaignId: campaign.id, testerId } } });
      };
      member = { ...developer, role: "TESTER" };
      const self = await requestMission(campaign.id, "I want to join my own cohort.");
      assert.equal(self.ok, false);
      assert.match(self.message, /own cohort/);
      const first = await apply(firstTester.id);
      const accept = async (id: string) => fundingModel === "PREPAID"
        ? serializable((tx) => reviewMissionApplication(tx, developer.id, id, "accept"))
        : acceptApplicationWithFunding(developer.id, id);
      await accept(first.id);
      const pinned = await db.missionApplication.findUniqueOrThrow({ where: { id: first.id }, include: { instructionVersion: true } });
      assert.equal(pinned.instructionVersion?.revision, 1);
      const edit = { campaignId: campaign.id, expectedRevision: 1, directions: [{ id: campaign.instructions[0].id, instructionTitle: "Updated step", instructionDetail: "Follow the NEW onboarding directions." }] };
      await assert.rejects(serializable((tx) => editCohortDirections(tx, stranger.id, edit)), /your account/);
      await assert.rejects(serializable((tx) => editCohortDirections(tx, developer.id, { ...edit, directions: [{ ...edit.directions[0], id: "other-step" }] })), /existing steps/);
      await assert.rejects(serializable((tx) => editCohortDirections(tx, developer.id, { ...edit, directions: [{ id: campaign.instructions[0].id, instructionTitle: campaign.instructions[0].instructionTitle, instructionDetail: campaign.instructions[0].instructionDetail }] })), /No direction changes/);
      await serializable((tx) => editCohortDirections(tx, developer.id, edit));
      await assert.rejects(serializable((tx) => editCohortDirections(tx, developer.id, edit)), /Reload/);
      member = firstTester;
      const claimed = await claimTaskSlot(campaign.id);
      assert.equal(claimed.instructionVersionId, pinned.instructionVersionId);
      assert.equal(claimed.acceptedDirections[0].instructionDetail, campaign.instructions[0].instructionDetail);
      assert.equal(claimed.instructionRevision, 1);
      assert.equal((await claimTaskSlot(campaign.id)).instructionVersionId, claimed.instructionVersionId, "Claim retry is idempotent.");
      const second = await apply(secondTester.id);
      await accept(second.id);
      member = secondTester;
      const newClaim = await claimTaskSlot(campaign.id);
      assert.equal(newClaim.instructionRevision, 2);
      assert.equal(newClaim.acceptedDirections[0].instructionDetail, edit.directions[0].instructionDetail);
      await db.submission.update({ where: { id: claimed.id }, data: { feedbackText: "Original evidence for the original directions.", submittedAt: new Date() } });
      await serializable((tx) => requestProofRevision(tx, developer.id, false, claimed.id, "Please clarify the original onboarding evidence."));
      await serializable((tx) => startProofRevision(tx, firstTester.id, claimed.id));
      const revised = await db.submission.findUniqueOrThrow({ where: { id: claimed.id } });
      assert.equal(revised.instructionVersionId, pinned.instructionVersionId, "Revision keeps original directions.");
      const after = await db.appCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
      for (const field of ["bountyPerTaskUsd", "totalBudgetUsd", "totalSlots", "fundingModel", "platformFeeUsd"] as const) assert.equal(after[field], before[field], field);
      assert.equal((await db.taskInstruction.findUniqueOrThrow({ where: { id: campaign.instructions[0].id } })).proofType, "SCREENSHOT");
      const races = await Promise.allSettled([1, 2].map((n) => serializable((tx) => editCohortDirections(tx, developer.id, { ...edit, expectedRevision: 2, directions: [{ ...edit.directions[0], instructionDetail: `Concurrent update ${n}, new tester directions.` }] }))));
      assert.equal(races.filter((result) => result.status === "fulfilled").length, 1);
      const versions = await db.cohortInstructionVersion.findMany({ where: { campaignId: campaign.id }, orderBy: { revision: "asc" } });
      assert.deepEqual(versions.map((item) => item.revision), [1, 2, 3]);
      assert.equal(versionDirections(versions[0])[0].instructionDetail, campaign.instructions[0].instructionDetail);
      assert.equal(versionDirections(versions[1])[0].instructionDetail, edit.directions[0].instructionDetail);
      assert.equal(versions[2].editedById, developer.id);
      await db.submission.update({ where: { id: claimed.id }, data: { status: "EXPIRED" } });
      await db.appCampaign.update({ where: { id: campaign.id }, data: { claimedSlots: { decrement: 1 } } });
      const reapplied = await serializable((tx) => createMissionApplication(tx, firstTester.id, campaign.id, "I would like to retest the updated instructions."));
      assert.equal(reapplied.instructionVersionId, null, "A new application does not inherit an old accepted version.");
      await accept(reapplied.id);
      member = firstTester;
      const reclaimed = await claimTaskSlot(campaign.id);
      assert.equal(reclaimed.instructionRevision, 3, "A newly accepted assignment uses the latest directions.");
      await db.appCampaign.update({ where: { id: campaign.id }, data: { status: "COMPLETED" } });
      await assert.rejects(serializable((tx) => editCohortDirections(tx, developer.id, { ...edit, expectedRevision: 3 })), /Only active/);
    }
  } finally {
    await db.submission.deleteMany({ where: { campaignId: { in: campaigns } } });
    await db.missionApplication.deleteMany({ where: { campaignId: { in: campaigns } } });
    await db.cohortInstructionVersion.deleteMany({ where: { campaignId: { in: campaigns } } });
    await db.appCampaign.deleteMany({ where: { id: { in: campaigns } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect();
    modules.reverse().forEach((item) => item.restore());
    if (previousTax === undefined) delete process.env.SEEDENV_STRIPE_TAX_ENABLED;
    else process.env.SEEDENV_STRIPE_TAX_ENABLED = previousTax;
  }
});
