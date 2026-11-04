import assert from "node:assert/strict";
import { before, beforeEach, mock, test } from "node:test";
import type { Prisma } from "@prisma/client";

let status = "PENDING";
let approvedById: string | null = null;
let rewardReads = 0;
const fake = {
  submission: {
    findUnique: async () => ({
      id: "proof", campaignId: "campaign", testerId: "friend", status,
      feedbackText: "Expected a receipt, actual checkout freeze.", proofImageUrl: null, denialReviewPending: false,
      revisionRequestedAt: null, hardwareStatus: "VERIFIED_PHYSICAL_NODE", audit: null,
      submittedAt: new Date(Date.now() - 49 * 3600_000), payoutCents: 500,
      campaign: { developerId: "developer", title: "Test cohort", taxSnapshot: null },
      tester: { xpPoints: 0, stripeConnectAccountId: null },
    }),
    updateMany: async ({ data }: { data: { approvedById: string | null } }) => { if (status !== "PENDING") return { count: 0 }; status = "APPROVED"; approvedById = data.approvedById; return { count: 1 }; },
  },
  appCampaign: { update: async () => undefined },
  user: { update: async () => undefined },
};
let approve: typeof import("../lib/submission-approval").approvePendingSubmission;
let prisma: typeof import("../lib/prisma").prisma;
before(async () => {
  mock.module("../lib/prisma.ts", { namedExports: { prisma: fake } });
  mock.module("../lib/quest-ledger.ts", { namedExports: { awardQuestXp: async () => true, qualifyReferral: async () => undefined, serializable: async (work: (tx: typeof fake) => Promise<unknown>) => work(fake) } });
  mock.module("../lib/billing-operations.ts", { namedExports: { operationTransfer: async () => undefined, reserveBillingOperation: async () => undefined } });
  mock.module("../lib/funding-reversals.ts", { namedExports: { assertCampaignFunding: async () => undefined } });
  mock.module("../lib/payout-funding-source.ts", { namedExports: { payoutSourceCandidates: async () => [] } });
  mock.module("../lib/billing/ledger.ts", { namedExports: { releaseBountyAndDeductFee: async () => ({ id: "bounty-ledger" }) } });
  mock.module("../lib/tester-referrals.ts", { namedExports: { awardTesterReferralBounty: async (tx: Prisma.TransactionClient, friendId: string) => {
    assert.equal(tx, prisma);
    assert.equal(friendId, "friend");
    assert.equal(status, "APPROVED");
    rewardReads += 1;
    return approvedById === "developer" ? { userId: "inviter", transactionId: "referral-ledger" } : null;
  } } });
  ({ approvePendingSubmission: approve } = await import("../lib/submission-approval"));
  ({ prisma } = await import("../lib/prisma"));
});
beforeEach(() => { status = "PENDING"; approvedById = null; rewardReads = 0; });

test("developer approval records provenance and qualifies the reward inside the same approval transaction", async () => {
  const result = await approve(prisma, "proof", { kind: "reviewer", id: "developer", admin: false });
  assert.equal(approvedById, "developer");
  assert.deepEqual(result.referralReward, { userId: "inviter", transactionId: "referral-ledger" });
  assert.equal(result.payoutCents, 500);
  assert.equal(result.payoutTransactionId, "bounty-ledger");
  await assert.rejects(approve(prisma, "proof", { kind: "reviewer", id: "developer", admin: false }), /Pending submission/);
  assert.equal(rewardReads, 1);
});

test("automatic and admin-override approvals preserve bounty behavior but cannot claim developer provenance", async () => {
  const automatic = await approve(prisma, "proof", { kind: "auto", now: new Date() });
  assert.equal(approvedById, null);
  assert.equal(automatic.referralReward, null);
  status = "PENDING";
  const admin = await approve(prisma, "proof", { kind: "reviewer", id: "admin", admin: true });
  assert.equal(approvedById, null);
  assert.equal(admin.referralReward, null);
  assert.equal(admin.payoutCents, 500);
});
