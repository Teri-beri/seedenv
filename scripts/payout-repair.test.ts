import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";

const HOUR = 60 * 60 * 1000;
type Operation = { id: string; kind: string; state: string; userId: string; ledgerId: string | null; destinationId: string | null; remoteId: string | null; amountCents: number; attempt: number; error: string | null; firstAttemptAt: Date | null; createdAt: Date };
const state = {
  operation: null as Operation | null,
  ledger: null as Record<string, unknown> | null,
  transfersByGroup: [] as Array<{ id: string; metadata: Record<string, string> }>,
  transfersByDestination: [] as Array<{ id: string; metadata: Record<string, string> }>,
  updates: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
  updateCount: 1,
  releases: [] as string[],
};

function fresh(overrides: Partial<Operation> = {}): Operation {
  return { id: "seedenv-payout-led_1", kind: "PAYOUT", state: "SUBMITTED", userId: "tester_1", ledgerId: "led_1", destinationId: "acct_tester", remoteId: null, amountCents: 500, attempt: 0, error: "Stripe outcome remains unknown beyond the safe retry window", firstAttemptAt: new Date(Date.now() - 30 * 24 * HOUR), createdAt: new Date(), ...overrides };
}

async function* iterate<T>(rows: T[]) { for (const row of rows) yield row; }

const mocks = [
  mock.module("server-only", { namedExports: {} }),
  mock.module("@/lib/billing-operations", { namedExports: { SAFE_STRIPE_RETRY_MS: 23 * HOUR } }),
  mock.module("@/lib/prisma", { namedExports: { prisma: {
    billingOperation: {
      findUnique: async () => state.operation,
      findMany: async () => (state.operation ? [state.operation] : []),
      updateMany: async (call: { where: Record<string, unknown>; data: Record<string, unknown> }) => { state.updates.push(call); return { count: state.updateCount }; },
    },
    walletTransaction: { findUnique: async () => state.ledger },
    user: { findMany: async () => [{ id: "tester_1", email: "tester@example.com" }] },
  } } }),
  mock.module("@/lib/stripe", { namedExports: { getStripe: () => ({ transfers: { list: (params: { transfer_group?: string }) => iterate(params.transfer_group ? state.transfersByGroup : state.transfersByDestination) } }) } }),
  mock.module("@/lib/submission-approval", { namedExports: { releaseTesterPayouts: async (testerId: string) => { state.releases.push(testerId); return { releasedCount: 1, pendingCount: 0, failures: [] }; } } }),
];
after(() => mocks.forEach((item) => item.restore()));

let repair: typeof import("@/lib/payout-repair");
before(async () => { repair = await import("@/lib/payout-repair"); });
beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_fixture";
  state.operation = fresh();
  state.ledger = { id: "led_1", type: "BOUNTY_PAYOUT", status: "PENDING", amountCents: 500, userId: "tester_1" };
  state.transfersByGroup = [];
  state.transfersByDestination = [{ id: "tr_other", metadata: { seedenvOperationId: "seedenv-payout-other" } }];
  state.updates = [];
  state.updateCount = 1;
  state.releases = [];
});

test("reopens a stuck payout only after Stripe shows no transfer, then retries it", async () => {
  const result = await repair.repairStuckPayout("seedenv-payout-led_1", "admin_1");
  assert.equal(result.reopened, true);
  assert.equal(result.existingTransfer, null);
  assert.equal(state.updates.length, 1);
  const [update] = state.updates;
  assert.deepEqual(update.where, { id: "seedenv-payout-led_1", state: { in: ["SUBMITTED", "FAILED"] }, remoteId: null, attempt: 0 });
  assert.equal(update.data.state, "RESERVED");
  assert.equal(update.data.attempt, 1, "a new attempt gives Stripe a new idempotency key");
  assert.equal(update.data.firstAttemptAt, null);
  assert.equal(update.data.sourceChargeId, null);
  assert.match(String(update.data.error), /admin_1/);
  assert.deepEqual(state.releases, ["tester_1"]);
});

test("attaches an existing Stripe transfer instead of paying twice", async () => {
  state.transfersByDestination.push({ id: "tr_found", metadata: { seedenvLedgerTransactionId: "led_1" } });
  const result = await repair.repairStuckPayout("seedenv-payout-led_1", "admin_1");
  assert.equal(result.reopened, false);
  assert.equal(result.existingTransfer, "tr_found");
  assert.equal(state.updates.length, 0);
  assert.deepEqual(state.releases, ["tester_1"]);
});

test("refuses when Stripe has more than one matching transfer", async () => {
  state.transfersByGroup = [{ id: "tr_a", metadata: {} }];
  state.transfersByDestination.push({ id: "tr_b", metadata: { seedenvOperationId: "seedenv-payout-led_1" } });
  await assert.rejects(repair.repairStuckPayout("seedenv-payout-led_1", "admin_1"), /multiple matching transfers/);
  assert.equal(state.updates.length, 0);
  assert.equal(state.releases.length, 0);
});

test("refuses unsafe or mismatched repairs", async () => {
  state.operation = fresh({ firstAttemptAt: new Date(Date.now() - HOUR) });
  await assert.rejects(repair.repairStuckPayout("x", "admin_1"), /safe retry window/);
  state.operation = fresh({ kind: "LEGACY_PAYOUT" });
  await assert.rejects(repair.repairStuckPayout("x", "admin_1"), /legacy/i);
  state.operation = fresh({ remoteId: "tr_done" });
  await assert.rejects(repair.repairStuckPayout("x", "admin_1"), /already has a Stripe transfer/);
  state.operation = fresh();
  state.ledger = { id: "led_1", type: "BOUNTY_PAYOUT", status: "COMPLETED", amountCents: 500, userId: "tester_1" };
  await assert.rejects(repair.repairStuckPayout("x", "admin_1"), /matching pending payout/);
  state.ledger = { id: "led_1", type: "BOUNTY_PAYOUT", status: "PENDING", amountCents: 900, userId: "tester_1" };
  await assert.rejects(repair.repairStuckPayout("x", "admin_1"), /matching pending payout/);
  assert.equal(state.updates.length, 0);
  assert.equal(state.releases.length, 0);
});

test("a concurrent change aborts the reopen without retrying", async () => {
  state.updateCount = 0;
  await assert.rejects(repair.repairStuckPayout("seedenv-payout-led_1", "admin_1"), /changed while it was being repaired/);
  assert.equal(state.releases.length, 0);
});

test("lists stuck payouts with repairability", async () => {
  const [row] = await repair.listStuckPayouts();
  assert.equal(row.repairable, true);
  assert.equal(row.testerEmail, "tester@example.com");
  state.operation = fresh({ firstAttemptAt: new Date(Date.now() - HOUR) });
  assert.equal((await repair.listStuckPayouts())[0].repairable, false);
  state.operation = fresh({ kind: "LEGACY_PAYOUT" });
  assert.equal((await repair.listStuckPayouts())[0].repairable, false);
});
