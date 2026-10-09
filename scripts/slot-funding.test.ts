import test from "node:test";
import assert from "node:assert/strict";
import { cardProcessingFeeCents, projectPerTesterCharges, quoteSlotCharge, quoteTopUp, topUpForShortfall } from "../lib/pricing";
import { campaignHasEnded, prepaidRefundTargetCents, unusedPaidSlots } from "../lib/slot-funding";

test("processing gross-up leaves the platform whole after Stripe's 2.9% + 30¢", () => {
  for (const base of [100, 400, 1900, 12000, 99999]) {
    const fee = cardProcessingFeeCents(base);
    const charged = base + fee;
    const stripeTakes = Math.round(charged * 0.029) + 30;
    assert.ok(charged - stripeTakes >= base, `base ${base} nets ${charged - stripeTakes}`);
    assert.ok(charged - stripeTakes - base <= 2, `base ${base} over-collects`);
  }
});

test("first accepted tester carries the $15 floor; later testers pay 20% until the floor is covered", () => {
  const first = quoteSlotCharge(400, 0, 0);
  assert.equal(first.stipendCents, 400);
  assert.equal(first.platformFeeCents, 1500);
  assert.equal(first.totalCents, first.stipendCents + first.platformFeeCents);
  // 20% of $8 is below the floor already collected, so no extra fee yet.
  assert.equal(quoteSlotCharge(400, 400, 1500).platformFeeCents, 0);
  // Once cumulative 20% exceeds $15, each tester adds exactly 20%.
  assert.equal(quoteSlotCharge(400, 8000, 1600).platformFeeCents, 80);
});

test("full-cohort projection matches the advertised 25 × $4 example", () => {
  const projection = projectPerTesterCharges(25, 400);
  assert.equal(projection.stipendCents, 10000);
  assert.equal(projection.platformFeeCents, 2000);
  assert.equal(projection.firstCharge?.totalCents, 1900);
  assert.equal(projection.typicalCharge?.totalCents, 480);
  assert.equal(projection.maxTotalCents, 12000);
  assert.equal(projectPerTesterCharges(0, 400).maxTotalCents, 0);
  assert.equal(projectPerTesterCharges(5, -1).firstCharge, null);
});

test("top-ups are bounded and charge exactly the credit (no card surcharge)", () => {
  assert.deepEqual(quoteTopUp(5000), { creditCents: 5000, processingFeeCents: 0, totalCents: 5000 });
  assert.throws(() => quoteTopUp(999), /between/);
  assert.throws(() => quoteTopUp(500001), /between/);
  assert.equal(topUpForShortfall(1), 1000);
  assert.equal(topUpForShortfall(1901), 2000);
  assert.equal(topUpForShortfall(10_000_000), 500000);
});

test("refund gates only return money nobody is using", () => {
  assert.equal(unusedPaidSlots(5, 2, 1), 2);
  assert.equal(unusedPaidSlots(3, 3, 2), 0);
  assert.equal(unusedPaidSlots(2, -4, 0), 2);
  assert.equal(prepaidRefundTargetCents({ totalSlots: 20, claimedSlots: 5, bountyCents: 400, platformFeeCents: 11900, submissionsEver: 5 }), 6000);
  assert.equal(prepaidRefundTargetCents({ totalSlots: 20, claimedSlots: 0, bountyCents: 400, platformFeeCents: 11900, submissionsEver: 0 }), 19900);
  const now = new Date("2026-10-08T00:00:00Z");
  assert.equal(campaignHasEnded({ status: "ACTIVE", cancelledAt: null, expiresAt: new Date("2026-11-01T00:00:00Z") }, now), false);
  assert.equal(campaignHasEnded({ status: "PAUSED", cancelledAt: now, expiresAt: new Date("2026-11-01T00:00:00Z") }, now), true);
  assert.equal(campaignHasEnded({ status: "ACTIVE", cancelledAt: null, expiresAt: now }, now), true);
});

type Row = Record<string, unknown>;

function fundingHarness(options: { balance: number; autoReload?: number; paid?: number; card?: "succeeded" | "declined" | "network"; refundFails?: boolean; topUps?: Row[]; campaign?: Partial<Row>; taxAddress?: { country: string; region: string } }) {
  const state = {
    user: { id: "dev", fundingBalanceCents: options.balance, autoReloadCents: options.autoReload ?? 0, stripeCustomerId: "cus_1" },
    application: { id: "app-1", status: "PENDING", campaignId: "c-1", startBy: null as Date | null },
    campaign: { id: "c-1", title: "Cohort", developerId: "dev", status: "ACTIVE", fundingModel: "PAY_PER_TESTER", cancelledAt: null as Date | null, expiresAt: new Date(Date.now() + 86400000), claimedSlots: 0, totalSlots: 3, bountyPerTaskUsd: 4, refundedCents: 0, ...options.campaign },
    charges: Array.from({ length: options.paid ?? 0 }, (_, index) => ({ id: `paid-${index}`, campaignId: "c-1", status: "SUCCEEDED", stipendCents: 400, platformFeeCents: index === 0 ? 1500 : 0, stripePaymentIntentId: null, applicationId: null as string | null, createdAt: new Date(Date.now() - (10 - index) * 1000) })) as Row[],
    topUps: (options.topUps ?? []) as Row[],
    transactions: [] as Row[],
    operations: [] as Row[],
    allocations: [] as Row[],
    intents: 0,
    refunds: [] as Array<{ payment_intent: string; amount: number }>,
  };
  const match = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      const condition = value as { gte?: number; not?: unknown; in?: unknown[]; startsWith?: string };
      if ("startsWith" in condition) return String(row[key]).startsWith(condition.startsWith!);
      if ("gte" in condition) return Number(row[key]) >= Number(condition.gte);
      if ("not" in condition) return row[key] !== condition.not;
      if ("in" in condition) return condition.in!.includes(row[key]);
      return true;
    }
    return row[key] === value;
  });
  const applyData = (row: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && !(value instanceof Date)) {
        const op = value as { increment?: number; decrement?: number };
        row[key] = Number(row[key] ?? 0) + (op.increment ?? 0) - (op.decrement ?? 0);
      } else row[key] = value;
    }
    return row;
  };
  const db = {
    missionApplication: {
      findUnique: async () => ({ ...state.application, campaign: state.campaign }),
      count: async () => 0,
      update: async ({ data }: { data: Row }) => applyData(state.application as unknown as Row, data),
    },
    appCampaign: {
      findUnique: async () => state.campaign,
      findUniqueOrThrow: async () => state.campaign,
      findFirst: async () => null,
      update: async ({ data }: { data: Row }) => applyData(state.campaign as unknown as Row, data),
      updateMany: async ({ data }: { data: Row }) => { applyData(state.campaign as unknown as Row, data); return { count: 1 }; },
    },
    submission: { count: async () => 0 },
    slotCharge: {
      count: async ({ where }: { where: Row }) => state.charges.filter((charge) => match(charge, where)).length,
      findMany: async ({ where }: { where: Row }) => state.charges.filter((charge) => match(charge, where)).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)),
      findUnique: async ({ where }: { where: { id: string } }) => { const row = state.charges.find((charge) => charge.id === where.id); return row ? { ...row, campaign: state.campaign } : null; },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => { const row = state.charges.find((charge) => charge.id === where.id); if (!row) throw new Error("Missing fake slot charge"); return { ...row, campaign: state.campaign }; },
      create: async ({ data }: { data: Row }) => { const row = { id: `charge-${state.charges.length}`, createdAt: new Date(), ...data }; state.charges.push(row); return row; },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => { const rows = state.charges.filter((charge) => match(charge, where)); rows.forEach((row) => applyData(row, data)); return { count: rows.length }; },
    },
    balanceTopUp: {
      create: async ({ data }: { data: Row }) => { const row = { id: `topup-${state.topUps.length}`, status: "PENDING", refundedCents: 0, createdAt: new Date(), updatedAt: new Date(), ...data }; state.topUps.push(row); return row; },
      findUnique: async ({ where }: { where: { id: string } }) => state.topUps.find((row) => row.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => state.topUps.find((row) => row.id === where.id)!,
      findMany: async ({ where }: { where: Row }) => state.topUps.filter((row) => match(row, where)).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)),
      update: async ({ where, data }: { where: { id: string }; data: Row }) => applyData(state.topUps.find((row) => row.id === where.id)!, data),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => { const rows = state.topUps.filter((row) => match(row, where)); rows.forEach((row) => applyData(row, data)); return { count: rows.length }; },
    },
    billingProfile: { findUnique: async () => options.taxAddress ?? null },
    walletTransaction: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }: { data: Row }) => { const row = { id: `tx-${state.transactions.length}`, ...data }; state.transactions.push(row); return row; },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => applyData(state.transactions.find((row) => row.id === where.id)!, data),
    },
    user: {
      findUnique: async () => ({ ...state.user }),
      findUniqueOrThrow: async () => ({ ...state.user }),
      update: async ({ data }: { data: Row }) => applyData(state.user as unknown as Row, data),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => { if (!match(state.user as unknown as Row, where)) return { count: 0 }; applyData(state.user as unknown as Row, data); return { count: 1 }; },
    },
    billingOperation: {
      findUnique: async ({ where }: { where: Row }) => state.operations.find((row) => match(row, where)) ?? null,
      findUniqueOrThrow: async ({ where }: { where: Row }) => state.operations.find((row) => match(row, where))!,
      findFirst: async ({ where }: { where: Row }) => state.operations.find((row) => match(row, where)) ?? null,
      findMany: async ({ where }: { where: Row }) => state.operations.filter((row) => match(row, where)),
      count: async ({ where }: { where: Row }) => state.operations.filter((row) => match(row, where)).length,
      upsert: async ({ where, create }: { where: Row; create: Row }) => {
        const existing = state.operations.find((row) => match(row, where));
        if (existing) return existing;
        const row = { state: "RESERVED", firstAttemptAt: null, remoteId: null, createdAt: new Date(), ...create };
        state.operations.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => applyData(state.operations.find((row) => match(row, where))!, data),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => { const rows = state.operations.filter((row) => match(row, where)); rows.forEach((row) => applyData(row, data)); return { count: rows.length }; },
    },
    fundingAllocation: {
      findMany: async ({ where }: { where: Row }) => state.allocations.filter((row) => match(row, where)),
      create: async ({ data }: { data: Row }) => { const row = { id: `allocation-${state.allocations.length}`, releasedCents: 0, ...data }; state.allocations.push(row); return row; },
      update: async ({ where, data }: { where: Row; data: Row }) => applyData(state.allocations.find((row) => match(row, where))!, data),
    },
    fundingReversal: { findUnique: async () => null },
  };
  const stripe = {
    customers: { retrieve: async () => ({ deleted: false, invoice_settings: { default_payment_method: "pm_1" } }) },
    paymentIntents: {
      retrieve: async () => ({ latest_charge: null, metadata: {} }),
      create: async () => {
        state.intents += 1;
        if (options.card === "declined") throw Object.assign(new Error("Your card was declined."), { type: "StripeCardError", code: "card_declined" });
        if (options.card === "network") throw Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" });
        return { id: `pi_reload_${state.intents}`, status: "succeeded" };
      },
      cancel: async () => ({}),
    },
    refunds: {
      list: () => (async function* () { /* Empty remote ledger before a refund. */ })(),
      create: async (input: { payment_intent: string; amount: number }) => {
        if (options.refundFails) throw new Error("refund failed");
        state.refunds.push(input);
        return { id: `re_${state.refunds.length}`, payment_intent: input.payment_intent, amount: input.amount, currency: "usd", status: "succeeded" };
      },
    },
  };
  return { state, db, stripe };
}

async function withMocks<T>(harness: ReturnType<typeof fundingHarness>, work: (modules: { slot: typeof import("../lib/slot-funding"); balance: typeof import("../lib/funding-balance") }) => Promise<T>) {
  const { mock } = await import("node:test");
  const { randomUUID } = await import("node:crypto");
  const mocks = [
    mock.module("../lib/ai/campaign-synthesis.ts", { namedExports: { synthesizeCampaign: async () => ({ status: "skipped" }) } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: harness.db } }),
    mock.module("../lib/quest-ledger.ts", { namedExports: { serializable: (work: (tx: typeof harness.db) => Promise<unknown>) => work(harness.db) } }),
    mock.module("../lib/billing-transaction.ts", { namedExports: { billingTransaction: (work: (tx: typeof harness.db) => Promise<unknown>) => work(harness.db) } }),
    mock.module("../lib/stripe.ts", { namedExports: { getStripe: () => harness.stripe } }),
    mock.module("../lib/stripe-customer.ts", { namedExports: { ensureStripeCustomer: async () => "cus_1" } }),
  ];
  const priorKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "mocked";
  try {
    const id = randomUUID();
    const operations = await import(`../lib/billing-operations.ts?t=${id}`);
    mocks.push(mock.module("../lib/billing-operations.ts", { namedExports: operations }));
    const reversals = await import(`../lib/funding-reversals.ts?t=${id}`);
    mocks.push(mock.module("../lib/funding-reversals.ts", { namedExports: reversals }));
    const balance = await import(`../lib/funding-balance.ts?t=${id}`);
    mocks.push(mock.module("../lib/funding-balance.ts", { namedExports: balance }));
    const slot = await import(`../lib/slot-funding.ts?t=${id}`);
    return await work({ slot, balance });
  } finally {
    for (const item of mocks.reverse()) item.restore();
    if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = priorKey;
  }
}

const accept = (harness: ReturnType<typeof fundingHarness>) => withMocks(harness, ({ slot }) => slot.acceptApplicationWithFunding("dev", "app-1").then((value) => ({ value, error: null as Error | null }), (error: Error) => ({ value: null, error })));

test("accepting the first tester draws reward + floor fee from the balance with no card charge", async () => {
  const harness = fundingHarness({ balance: 5000 });
  const { value, error } = await accept(harness);
  assert.equal(error, null);
  assert.equal(value?.accepted, true);
  assert.equal(harness.state.intents, 0);
  assert.equal(harness.state.user.fundingBalanceCents, 3100);
  assert.equal(harness.state.application.status, "ACCEPTED");
  assert.equal(harness.state.charges[0].status, "SUCCEEDED");
  assert.equal(harness.state.charges[0].totalCents, 1900);
  assert.equal(harness.state.charges[0].processingFeeCents, 0);
  assert.equal(harness.state.transactions[0].type, "ESCROW_DEPOSIT");
  assert.equal(harness.state.transactions[0].stripePaymentId, undefined);
});

test("Florida tax gating blocks unsupported redemption before any debit or auto-reload", async () => {
  const enabled = process.env.SEEDENV_STRIPE_TAX_ENABLED;
  const confirmed = process.env.SEEDENV_FLORIDA_QA_TAX_POLICY_CONFIRMED;
  process.env.SEEDENV_STRIPE_TAX_ENABLED = "1";
  process.env.SEEDENV_FLORIDA_QA_TAX_POLICY_CONFIRMED = "1";
  try {
    for (const paid of [0, 1]) {
      const blocked = fundingHarness({ balance: 5000, autoReload: 5000, paid, taxAddress: { country: "US", region: "CA" } });
      const { error } = await accept(blocked);
      assert.match(error?.message ?? "", /only configured for Florida/);
      assert.equal(blocked.state.user.fundingBalanceCents, 5000);
      assert.equal(blocked.state.application.status, "PENDING");
      assert.equal(blocked.state.intents, 0);
      assert.equal(blocked.state.transactions.length, 0);
    }
    const missing = fundingHarness({ balance: 5000 });
    assert.match((await accept(missing)).error?.message ?? "", /only configured for Florida/);
    const allowed = fundingHarness({ balance: 5000, taxAddress: { country: "US", region: "FL" } });
    assert.equal((await accept(allowed)).value?.accepted, true);
    assert.equal(allowed.state.user.fundingBalanceCents, 3100);
    assert.equal(allowed.state.transactions[0].taxAmountCents, 0);
    assert.equal(allowed.state.transactions[0].taxCode, "txcd_20030000");
  } finally {
    if (enabled === undefined) delete process.env.SEEDENV_STRIPE_TAX_ENABLED;
    else process.env.SEEDENV_STRIPE_TAX_ENABLED = enabled;
    if (confirmed === undefined) delete process.env.SEEDENV_FLORIDA_QA_TAX_POLICY_CONFIRMED;
    else process.env.SEEDENV_FLORIDA_QA_TAX_POLICY_CONFIRMED = confirmed;
  }
});

test("a freed paid place is reused without drawing from the balance", async () => {
  const harness = fundingHarness({ balance: 0, paid: 1 });
  const { value } = await accept(harness);
  assert.equal(value?.charged, null);
  assert.equal(value?.accepted, true);
  assert.equal(harness.state.user.fundingBalanceCents, 0);
});

test("a short balance without auto-reload leaves the tester pending and the balance untouched", async () => {
  const harness = fundingHarness({ balance: 500 });
  const { value, error } = await accept(harness);
  assert.equal(error, null);
  assert.equal(value?.accepted, false);
  assert.match(String(value?.message), /Add funds/);
  assert.equal(harness.state.user.fundingBalanceCents, 500);
  assert.equal(harness.state.application.status, "PENDING");
  assert.equal(harness.state.charges.length, 0);
  assert.equal(harness.state.intents, 0);
});

test("auto-reload tops up once off-session, then accepts from the balance", async () => {
  const harness = fundingHarness({ balance: 500, autoReload: 2500, card: "succeeded" });
  const { value, error } = await accept(harness);
  assert.equal(error, null);
  assert.equal(value?.accepted, true);
  assert.equal(harness.state.intents, 1);
  assert.equal(harness.state.topUps[0].status, "SUCCEEDED");
  assert.equal(harness.state.topUps[0].source, "AUTO_RELOAD");
  assert.equal(harness.state.user.fundingBalanceCents, 500 + 2500 - 1900);
  assert.deepEqual(harness.state.transactions.map((row) => row.type), ["BALANCE_TOPUP", "ESCROW_DEPOSIT"]);
});

test("a declined auto-reload blocks acceptance without touching the balance", async () => {
  const harness = fundingHarness({ balance: 500, autoReload: 2500, card: "declined" });
  const { error } = await accept(harness);
  assert.match(String(error?.message), /declined/);
  assert.equal(harness.state.application.status, "PENDING");
  assert.equal(harness.state.user.fundingBalanceCents, 500);
  assert.equal(harness.state.topUps[0].status, "FAILED");
});

test("an ambiguous Stripe error leaves the reload pending for the sweep instead of failing it", async () => {
  const harness = fundingHarness({ balance: 500, autoReload: 2500, card: "network" });
  const { error } = await accept(harness);
  assert.match(String(error?.message), /couldn't confirm/);
  assert.equal(harness.state.topUps[0].status, "PENDING");
  assert.equal(harness.state.user.fundingBalanceCents, 500);
  assert.equal(harness.state.application.status, "PENDING");
});

test("a reload already in flight for the same tester is not charged twice", async () => {
  const harness = fundingHarness({ balance: 500, autoReload: 2500, card: "succeeded", topUps: [{ id: "reload_app-1_0", userId: "dev", status: "PENDING", source: "AUTO_RELOAD", creditCents: 2500, refundedCents: 0, createdAt: new Date(), updatedAt: new Date() }] });
  const { error } = await accept(harness);
  assert.match(String(error?.message), /already in progress/);
  assert.equal(harness.state.intents, 0);
});

test("ending a cohort credits unused places back to the balance, newest first, without Stripe", async () => {
  const harness = fundingHarness({ balance: 0, paid: 2, campaign: { cancelledAt: new Date(), status: "PAUSED" } });
  const result = await withMocks(harness, ({ slot }) => slot.reconcileCampaignFunding("c-1"));
  assert.equal(result.refundedCents, 1900 + 400);
  assert.equal(harness.state.user.fundingBalanceCents, 2300);
  assert.equal(harness.state.refunds.length, 0);
  assert.ok(harness.state.charges.every((charge) => charge.status === "REFUNDED"));
  assert.equal(harness.state.campaign.refundedCents, 2300);
});

test("refunding the balance returns it to the newest top-ups first", async () => {
  const topUps = [
    { id: "old", userId: "dev", status: "SUCCEEDED", creditCents: 2000, refundedCents: 0, stripePaymentIntentId: "pi_old", createdAt: new Date("2026-10-01") },
    { id: "new", userId: "dev", status: "SUCCEEDED", creditCents: 2000, refundedCents: 500, stripePaymentIntentId: "pi_new", createdAt: new Date("2026-10-05") },
  ];
  const harness = fundingHarness({ balance: 3000, topUps });
  const result = await withMocks(harness, ({ balance }) => balance.withdrawBalance("dev"));
  assert.deepEqual(result, { refundedCents: 3000, keptCents: 0 });
  assert.deepEqual(harness.state.refunds.map((row) => [row.payment_intent, row.amount]), [["pi_new", 1500], ["pi_old", 1500]]);
  assert.equal(harness.state.user.fundingBalanceCents, 0);
  assert.equal(harness.state.transactions[0].status, "COMPLETED");
});

test("an unknown balance refund outcome keeps money reserved and surfaces the error", async () => {
  const harness = fundingHarness({ balance: 1000, refundFails: true, topUps: [{ id: "t", userId: "dev", status: "SUCCEEDED", creditCents: 2000, refundedCents: 0, stripePaymentIntentId: "pi_t", createdAt: new Date() }] });
  await assert.rejects(withMocks(harness, ({ balance }) => balance.withdrawBalance("dev")), /refund failed/);
  assert.equal(harness.state.user.fundingBalanceCents, 0);
  assert.equal(harness.state.transactions[0].status, "PENDING");
  assert.equal(harness.state.operations.find((row) => row.kind === "WITHDRAWAL_REFUND")?.state, "SUBMITTED");
});
