import assert from "node:assert/strict";
import { before, beforeEach, mock, test } from "node:test";
import type { Prisma } from "@prisma/client";

type Member = { id: string; email: string; emailVerified: Date | null; testerWorkspaceEnabled: boolean; username: string; name: string | null; bio: string | null; stripeConnectAccountId: string | null };
type Approval = { testerId: string; status: string; approvedById: string | null; bugTitle: string | null; hardwareStatus: string; denialReviewPending: boolean; bugSeverity: string | null; reproSteps: string[]; deviceModel: string | null; osBuild: string | null; campaign: { developerId: string } };
type Referral = { id: string; friendId: string; inviterId: string; rewardedAt: Date | null; rewardTransactionId: string | null; friend: Member; inviter: Member };
let referral: Referral;
let approvals: Approval[];
let cycles: Record<string, string>;
let ledgers: Prisma.WalletTransactionUncheckedCreateInput[];
let operations: Prisma.BillingOperationUncheckedCreateInput[];
let failReservation = false;

const member = (id: string): Member => ({ id, email: `${id}@example.invalid`, emailVerified: new Date(), testerWorkspaceEnabled: true, username: `tester_${id.replaceAll("-", "_")}`, name: "Fixture tester", bio: "Real device testing", stripeConnectAccountId: "acct_fixture" });
const fakeCore = {
  referral: {
    findUnique: async ({ where, include }: { where: { friendId: string }; include?: unknown }) => include && where.friendId === referral.friendId ? structuredClone(referral) : cycles[where.friendId] ? { inviterId: cycles[where.friendId] } : null,
    updateMany: async () => {
      if (referral.rewardedAt || referral.rewardTransactionId) return { count: 0 };
      referral.rewardedAt = new Date();
      return { count: 1 };
    },
    update: async ({ data }: { data: { rewardTransactionId: string } }) => { referral.rewardTransactionId = data.rewardTransactionId; return referral; },
    count: async ({ where }: { where: { rewardedAt?: null } }) => where.rewardedAt === null ? referral.rewardedAt ? 0 : 1 : 1,
  },
  submission: {
    findMany: async () => approvals.filter((report) => report.testerId === referral.friendId && report.status === "APPROVED" && report.approvedById && report.bugTitle && report.hardwareStatus === "VERIFIED_PHYSICAL_NODE" && !report.denialReviewPending),
  },
  walletTransaction: {
    create: async ({ data }: { data: Prisma.WalletTransactionUncheckedCreateInput }) => { const id = `reward-${ledgers.length}`; ledgers.push({ id, ...data }); return { id }; },
    aggregate: async ({ where }: { where: { status: string | { in: string[] } } }) => ({ _sum: { amountCents: ledgers.filter((row) => typeof where.status === "string" ? row.status === where.status : where.status.in.includes(row.status ?? "PENDING")).reduce((sum, row) => sum + row.amountCents, 0) } }),
  },
};
const fake = {
  ...fakeCore,
  $transaction: async <T>(work: (tx: typeof fakeCore) => Promise<T>): Promise<T> => {
    const snapshot = structuredClone({ referral, ledgers, operations });
    try { return await work(fakeCore); } catch (error) { referral = snapshot.referral; ledgers = snapshot.ledgers; operations = snapshot.operations; throw error; }
  },
};
let award: typeof import("../lib/tester-referrals").awardTesterReferralBounty;
let stats: typeof import("../lib/tester-referrals").getTesterReferralStats;
let prisma: typeof import("../lib/prisma").prisma;

before(async () => {
  mock.module("../lib/prisma.ts", { namedExports: { prisma: fake } });
  mock.module("../lib/billing-operations.ts", { namedExports: {
    reserveBillingOperation: async (_tx: unknown, data: Prisma.BillingOperationUncheckedCreateInput) => {
      if (failReservation) throw new Error("Reservation failed");
      operations.push(data);
      return data;
    },
  } });
  ({ awardTesterReferralBounty: award, getTesterReferralStats: stats } = await import("../lib/tester-referrals"));
  ({ prisma } = await import("../lib/prisma"));
});
beforeEach(() => {
  referral = { id: "referral-1", friendId: "friend", inviterId: "inviter", rewardedAt: null, rewardTransactionId: null, friend: member("friend"), inviter: member("inviter") };
  approvals = [{ testerId: "friend", status: "APPROVED", approvedById: "developer", campaign: { developerId: "developer" }, bugTitle: "Checkout hangs", bugSeverity: "MAJOR", reproSteps: ["Open checkout", "Tap payment"], hardwareStatus: "VERIFIED_PHYSICAL_NODE", denialReviewPending: false, deviceModel: "iPhone 14 Pro", osBuild: "iOS 17.4" }];
  cycles = {};
  ledgers = [];
  operations = [];
  failReservation = false;
});

test("a qualified tester reserves exactly $1 in a platform-funded, pending earnings ledger", async () => {
  const reward = await prisma.$transaction((tx) => award(tx, "friend"));
  assert.deepEqual(reward, { userId: "inviter", transactionId: "reward-0" });
  assert.equal(ledgers[0].amountCents, 100);
  assert.equal(ledgers[0].type, "REFERRAL_REWARD");
  assert.equal(ledgers[0].status, "PENDING");
  assert.equal(operations[0].kind, "REFERRAL_PAYOUT");
  assert.equal(operations[0].campaignId, undefined);
  assert.equal(operations[0].sourceChargeId, undefined);
  assert.equal(referral.rewardTransactionId, "reward-0");
});

test("replays and concurrent qualification checks do not issue another reward", async () => {
  await Promise.all([award(prisma, "friend"), award(prisma, "friend"), award(prisma, "friend")]);
  assert.equal(ledgers.length, 1);
  assert.equal(operations.length, 1);
  assert.equal(await award(prisma, "friend"), null);
});

test("cash rewards have no monthly cap while each distinct invited tester qualifies only once", async () => {
  for (let index = 0; index < 5; index++) {
    referral = { ...referral, id: `referral-${index}`, friendId: `friend-${index}`, friend: member(`friend-${index}`), rewardedAt: null, rewardTransactionId: null };
    approvals[0].testerId = referral.friendId;
    await award(prisma, referral.friendId);
    await award(prisma, referral.friendId);
  }
  assert.equal(ledgers.length, 5);
  assert.equal(ledgers.reduce((sum, row) => sum + row.amountCents, 0), 500);
});
test("unverified emails, incomplete profiles, emulators and unstructured reports do not qualify", async () => {
  referral.friend.emailVerified = null;
  assert.equal(await award(prisma, "friend"), null);
  referral.friend.emailVerified = new Date();
  referral.friend.bio = null;
  assert.equal(await award(prisma, "friend"), null);
  referral.friend.bio = "Complete profile";
  approvals[0].hardwareStatus = "EMULATOR_FLAGGED";
  assert.equal(await award(prisma, "friend"), null);
  approvals[0].hardwareStatus = "VERIFIED_PHYSICAL_NODE";
  approvals[0].reproSteps = ["One step"];
  assert.equal(await award(prisma, "friend"), null);
  assert.equal(ledgers.length, 0);
});

test("auto-approval, admin override, self-approval and inviter approvals cannot earn cash", async () => {
  approvals[0].approvedById = null;
  assert.equal(await award(prisma, "friend"), null);
  approvals[0].approvedById = "admin";
  assert.equal(await award(prisma, "friend"), null);
  approvals[0].approvedById = "friend";
  approvals[0].campaign.developerId = "friend";
  assert.equal(await award(prisma, "friend"), null);
  approvals[0].approvedById = "inviter";
  approvals[0].campaign.developerId = "inviter";
  assert.equal(await award(prisma, "friend"), null);
});

test("longer cycles and duplicate identities never create rewards", async () => {
  cycles = { inviter: "ancestor", ancestor: "friend" };
  assert.equal(await award(prisma, "friend"), null);
  cycles = {};
  referral.friend.email = referral.inviter.email;
  assert.equal(await award(prisma, "friend"), null);
});

test("a failed reservation rolls back attribution and can be retried without losing the reward", async () => {
  failReservation = true;
  await assert.rejects(prisma.$transaction((tx) => award(tx, "friend")), /Reservation failed/);
  assert.equal(referral.rewardedAt, null);
  assert.equal(referral.rewardTransactionId, null);
  assert.equal(ledgers.length, 0);
  failReservation = false;
  assert.ok(await prisma.$transaction((tx) => award(tx, "friend")));
});

test("late profile verification can qualify a recorded developer approval; stats distinguish earned and pending money", async () => {
  referral.friend.emailVerified = null;
  assert.equal(await award(prisma, "friend"), null);
  referral.friend.emailVerified = new Date();
  await award(prisma, "friend");
  const result = await stats("inviter");
  assert.equal(result.inviteUrl, "https://seedenv.com/join?ref=inviter");
  assert.equal(result.totalInvited, 1);
  assert.equal(result.pendingFirstBug, 0);
  assert.equal(result.earnedCents, 100);
  assert.equal(result.pendingPayoutCents, 100);
  ledgers[0].status = "COMPLETED";
  assert.equal((await stats("inviter")).pendingPayoutCents, 0);
  assert.equal((await stats("inviter")).earnedCents, 100);
});
