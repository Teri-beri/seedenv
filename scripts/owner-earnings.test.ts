import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { OwnerPayout } from "@prisma/client";
import { ownerPayoutPolicy, payoutWeekKey, planOwnerPayout, runOwnerPayout, type EarningsInputs, type OwnerPayoutDeps } from "@/lib/owner-earnings";

const policy = { ...ownerPayoutPolicy(), holdDays: 14, reservePercent: 10, taxPercent: 30, minimumCents: 2500, runHour: 10 };
const FRIDAY_NOON_NY = new Date("2026-11-13T17:00:00Z");

const baseInputs = (overrides: Partial<EarningsInputs> = {}): EarningsInputs => ({
  availableCents: 100_000,
  pendingStripeCents: 0,
  testerEscrowCents: 20_000,
  pendingTesterPayoutCents: 5_000,
  developerBalancesCents: 10_000,
  clipperEscrowCents: 0,
  refundsInFlightCents: 0,
  salesTaxCollectedCents: 0,
  maturedFeesCents: 30_000,
  immatureFeesCents: 8_000,
  recentFeesCents: 20_000,
  previousOwnerPayoutsCents: 0,
  ...overrides,
});

describe("owner payout math", () => {
  it("pays matured fees minus reserve and sets aside tax", () => {
    const plan = planOwnerPayout(baseInputs(), policy);
    assert.equal(plan.reserveCents, 2_000);
    assert.equal(plan.payoutCents, 28_000);
    assert.equal(plan.taxSetAsideCents, 8_400);
    assert.equal(plan.keepCents, 19_600);
  });

  it("never pays out money owed to testers, developers, or refunds", () => {
    const plan = planOwnerPayout(baseInputs({ availableCents: 40_000, testerEscrowCents: 25_000, developerBalancesCents: 5_000, refundsInFlightCents: 3_000 }), policy);
    assert.equal(plan.balanceHeadroomCents, 40_000 - 33_000 - 2_000);
    assert.equal(plan.payoutCents, 5_000);
    assert.ok(plan.availableCents - plan.payoutCents >= plan.liabilitiesCents + plan.reserveCents);
  });

  it("subtracts earlier owner payouts so fees are not paid twice", () => {
    assert.equal(planOwnerPayout(baseInputs({ previousOwnerPayoutsCents: 27_000 }), policy).payoutCents, 0);
  });

  it("skips when below the minimum or when liabilities exceed the balance", () => {
    assert.equal(planOwnerPayout(baseInputs({ maturedFeesCents: 4_000 }), policy).belowMinimum, true);
    assert.equal(planOwnerPayout(baseInputs({ availableCents: 10_000 }), policy).payoutCents, 0);
  });

  it("rejects non-integer inputs instead of guessing", () => {
    assert.throws(() => planOwnerPayout(baseInputs({ availableCents: 1.5 }), policy), /whole cents/);
  });

  it("only runs on Friday at or after the run hour in New York", () => {
    assert.equal(payoutWeekKey(FRIDAY_NOON_NY, 10), "2026-11-13");
    assert.equal(payoutWeekKey(new Date("2026-11-13T13:00:00Z"), 10), null);
    assert.equal(payoutWeekKey(new Date("2026-11-12T17:00:00Z"), 10), null);
    assert.equal(payoutWeekKey(new Date("2026-11-14T03:00:00Z"), 10), "2026-11-13");
  });
});

describe("owner payout run", () => {
  let rows: OwnerPayout[];
  let created: { amount: number; key?: string }[];
  let inputs: EarningsInputs;
  let createError: unknown;
  let notified: number;
  let stripePayouts: { id: string; amount: number; status: string; metadata: Record<string, string>; failure_message: string | null }[];

  beforeEach(() => {
    rows = [];
    created = [];
    inputs = baseInputs();
    createError = null;
    notified = 0;
    stripePayouts = [];
  });

  const deps = (): OwnerPayoutDeps => ({
    stripe: {
      balance: {} as never,
      payouts: {
        list: async () => ({ data: stripePayouts }),
        retrieve: async (id: string) => stripePayouts.find((payout) => payout.id === id),
        create: async (params: { amount: number; metadata: Record<string, string> }, options?: { idempotencyKey?: string }) => {
          if (createError) throw createError;
          const prior = stripePayouts.find((payout) => payout.metadata.seedenvOwnerPayoutWeek === params.metadata.seedenvOwnerPayoutWeek);
          if (prior) return prior;
          created.push({ amount: params.amount, key: options?.idempotencyKey });
          const payout = { id: `po_${created.length}`, amount: params.amount, status: "pending", metadata: params.metadata, failure_message: null };
          stripePayouts.push(payout);
          return payout;
        },
      } as never,
    },
    gather: async () => inputs,
    store: {
      find: async (weekKey) => rows.find((row) => row.weekKey === weekKey) ?? null,
      create: async (data) => {
        if (rows.some((row) => row.weekKey === data.weekKey)) return null;
        const row = { id: `op_${rows.length + 1}`, stripePayoutId: null, notifiedAt: null, createdAt: FRIDAY_NOON_NY, updatedAt: FRIDAY_NOON_NY, error: null, ...data } as OwnerPayout;
        rows.push(row);
        return row;
      },
      update: async (id, data) => {
        const row = rows.find((candidate) => candidate.id === id)!;
        Object.assign(row, data);
        return row;
      },
      unsettled: async () => rows.filter((row) => row.status === "RESERVED" || row.status === "SUBMITTED"),
    },
    notify: async () => { notified += 1; return true; },
  });

  it("pays once per Friday with a weekly idempotency key", async () => {
    const first = await runOwnerPayout({ now: FRIDAY_NOON_NY, enabled: true }, deps());
    assert.equal(first.outcome, "submitted");
    const second = await runOwnerPayout({ now: new Date(FRIDAY_NOON_NY.getTime() + 3_600_000), enabled: true }, deps());
    assert.equal(second.outcome, "already-ran");
    assert.deepEqual(created, [{ amount: 28_000, key: "seedenv-owner-payout-2026-11-13" }]);
    assert.equal(rows[0].taxSetAsideCents, 8_400);
    assert.equal(notified, 1);
  });

  it("does nothing when disabled or outside payout time, and dry runs never pay", async () => {
    assert.equal((await runOwnerPayout({ now: FRIDAY_NOON_NY, enabled: false }, deps())).outcome, "disabled");
    assert.equal((await runOwnerPayout({ now: new Date("2026-11-12T17:00:00Z"), enabled: true }, deps())).outcome, "not-payout-time");
    assert.equal((await runOwnerPayout({ now: FRIDAY_NOON_NY, dryRun: true }, deps())).outcome, "preview");
    assert.equal(created.length, 0);
    assert.equal(rows.length, 0);
  });

  it("records a skipped week without calling Stripe", async () => {
    inputs = baseInputs({ maturedFeesCents: 1_000 });
    const run = await runOwnerPayout({ now: FRIDAY_NOON_NY, enabled: true }, deps());
    assert.equal(run.outcome, "skipped");
    assert.equal(created.length, 0);
  });

  it("marks a definitive Stripe rejection as failed so the money is not counted as paid", async () => {
    createError = Object.assign(new Error("Insufficient funds"), { type: "StripeInvalidRequestError", statusCode: 400 });
    const run = await runOwnerPayout({ now: FRIDAY_NOON_NY, enabled: true }, deps());
    assert.equal(run.outcome, "failed");
    assert.equal(rows[0].status, "FAILED");
  });

  it("keeps a reserved row after a network error and finishes it on the next sweep without paying twice", async () => {
    createError = Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" });
    await assert.rejects(runOwnerPayout({ now: FRIDAY_NOON_NY, enabled: true }, deps()));
    assert.equal(rows[0].status, "RESERVED");
    createError = null;
    inputs = baseInputs({ maturedFeesCents: 90_000 });
    await runOwnerPayout({ now: new Date(FRIDAY_NOON_NY.getTime() + 3_600_000), enabled: true }, deps());
    assert.equal(rows[0].status, "SUBMITTED");
    assert.deepEqual(created.map((payout) => payout.amount), [28_000]);
  });

  it("does not start a new week while an earlier payout is still unsent, and releases stale reservations", async () => {
    createError = Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" });
    await assert.rejects(runOwnerPayout({ now: FRIDAY_NOON_NY, enabled: true }, deps()));
    const blocked = await runOwnerPayout({ now: new Date(FRIDAY_NOON_NY.getTime() + 3_600_000), enabled: true }, deps());
    assert.equal(blocked.outcome, "blocked");
    rows[0].createdAt = new Date(FRIDAY_NOON_NY.getTime() - 7 * 86_400_000);
    createError = null;
    const nextWeek = await runOwnerPayout({ now: new Date("2026-11-20T17:00:00Z"), enabled: true }, deps());
    assert.equal(rows[0].status, "FAILED");
    assert.equal(nextWeek.outcome, "submitted");
    assert.deepEqual(created.map((payout) => payout.amount), [28_000]);
  });

  it("marks payouts the bank returned as failed", async () => {
    await runOwnerPayout({ now: FRIDAY_NOON_NY, enabled: true }, deps());
    stripePayouts[0].status = "failed";
    stripePayouts[0].failure_message = "Account closed";
    await runOwnerPayout({ now: new Date("2026-11-16T17:00:00Z"), enabled: true }, deps());
    assert.equal(rows[0].status, "FAILED");
    assert.equal(rows[0].error, "Account closed");
  });
});
