import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

const HOUR = 60 * 60 * 1000;
type Row = { id: string; kind: string; state: string; remoteId: string | null; attempt: number; firstAttemptAt: Date | null; destinationId: string | null; ledgerId: string | null };
const state = {
  operation: null as Row | null,
  byGroup: [] as Array<{ id: string; metadata: Record<string, string> }>,
  byDestination: [] as Array<{ id: string; metadata: Record<string, string> }>,
  updates: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
};
async function* iterate<T>(rows: T[]) { for (const row of rows) yield row; }

mock.module("../lib/prisma.ts", { namedExports: { prisma: { billingOperation: {
  updateMany: async (call: { where: Record<string, unknown>; data: Record<string, unknown> }) => { state.updates.push(call); Object.assign(state.operation!, call.data); return { count: 1 }; },
  findUniqueOrThrow: async () => ({ ...state.operation }),
} } } });
mock.module("../lib/stripe.ts", { namedExports: { getStripe: () => ({ transfers: { list: (params: { transfer_group?: string }) => iterate(params.transfer_group ? state.byGroup : state.byDestination) } }) } });
mock.module("../lib/quest-ledger.ts", { namedExports: { serializable: async () => { throw new Error("unused"); } } });
const operations = import("../lib/billing-operations");

function stuck(overrides: Partial<Row> = {}): Row {
  return { id: "seedenv-payout-led_1", kind: "PAYOUT", state: "SUBMITTED", remoteId: null, attempt: 0, firstAttemptAt: new Date(Date.now() - 30 * 24 * HOUR), destinationId: "acct_t", ledgerId: "led_1", ...overrides };
}
beforeEach(() => { state.operation = stuck(); state.byGroup = []; state.byDestination = [{ id: "tr_other", metadata: { seedenvOperationId: "seedenv-payout-other" } }]; state.updates = []; });
const call = async () => (await operations).reopenStalePayoutIfUnsent(state.operation as never);

test("a tester's retry reopens a stale payout when Stripe has no transfer for it", async () => {
  const result = await call();
  assert.equal(result.state, "RESERVED");
  assert.equal(result.attempt, 1, "a fresh attempt gets a fresh Stripe idempotency key");
  assert.equal(result.firstAttemptAt, null);
  assert.deepEqual(state.updates[0].where, { id: "seedenv-payout-led_1", state: "SUBMITTED", remoteId: null, attempt: 0 });
});

test("never reopens when Stripe already holds a matching transfer", async () => {
  state.byDestination.push({ id: "tr_ledger", metadata: { seedenvLedgerTransactionId: "led_1" } });
  assert.equal((await call()).state, "SUBMITTED");
  state.byDestination = []; state.byGroup = [{ id: "tr_group", metadata: {} }];
  assert.equal((await call()).state, "SUBMITTED");
  assert.equal(state.updates.length, 0);
});

test("leaves fresh, settled, linked, and legacy payouts alone without calling Stripe", async () => {
  for (const row of [stuck({ firstAttemptAt: new Date() }), stuck({ state: "SETTLED" }), stuck({ remoteId: "tr_1" }), stuck({ kind: "LEGACY_PAYOUT" }), stuck({ state: "RESERVED", firstAttemptAt: null })]) {
    state.operation = row;
    assert.equal(await call(), row);
  }
  assert.equal(state.updates.length, 0);
});
