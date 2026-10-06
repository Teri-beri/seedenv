import test from "node:test";
import assert from "node:assert/strict";
import { cardProcessingFeeCents, projectPerTesterCharges, quoteSlotCharge } from "../lib/pricing";
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
  assert.equal(first.totalCents, first.stipendCents + first.platformFeeCents + first.processingFeeCents);
  // 20% of $8 is below the floor already collected, so no extra fee yet.
  assert.equal(quoteSlotCharge(400, 400, 1500).platformFeeCents, 0);
  // Once cumulative 20% exceeds $15, each tester adds exactly 20%.
  assert.equal(quoteSlotCharge(400, 8000, 1600).platformFeeCents, 80);
});

test("full-cohort projection matches the advertised 25 × $4 example", () => {
  const projection = projectPerTesterCharges(25, 400);
  assert.equal(projection.stipendCents, 10000);
  assert.equal(projection.platformFeeCents, 2000);
  assert.equal(projection.firstCharge?.totalCents, 1988);
  assert.equal(projection.typicalCharge?.totalCents, 526);
  assert.equal(projection.maxTotalCents, projection.stipendCents + projection.platformFeeCents + projection.processingFeeCents);
  assert.equal(projectPerTesterCharges(0, 400).maxTotalCents, 0);
  assert.equal(projectPerTesterCharges(5, -1).firstCharge, null);
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

async function acceptHarness(options: { paid: number; chargeStatus: "succeeded" | "declined" }) {
  const { mock } = await import("node:test");
  const { randomUUID } = await import("node:crypto");
  const state = {
    application: { id: "app-1", status: "PENDING", campaignId: "c-1", startBy: null as Date | null },
    campaign: { id: "c-1", title: "Cohort", developerId: "dev", status: "ACTIVE", fundingModel: "PAY_PER_TESTER", cancelledAt: null, expiresAt: new Date(Date.now() + 86400000), claimedSlots: 0, totalSlots: 3, bountyPerTaskUsd: 4 },
    charges: Array.from({ length: options.paid }, (_, index) => ({ id: `paid-${index}`, status: "SUCCEEDED", stipendCents: 400, platformFeeCents: index === 0 ? 1500 : 0, applicationId: null as string | null })) as Array<Record<string, unknown>>,
    deposits: 0,
    intents: 0,
  };
  const db = {
    missionApplication: {
      findUnique: async () => ({ ...state.application, campaign: state.campaign }),
      count: async () => 0,
      update: async ({ data }: { data: { status: string; startBy: Date } }) => Object.assign(state.application, data),
    },
    slotCharge: {
      findMany: async ({ where }: { where: { status: string } }) => state.charges.filter((charge) => charge.status === where.status),
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: "new-charge", status: "PENDING", ...data }; state.charges.push(row); return row; },
      findUnique: async ({ where }: { where: { id: string } }) => { const row = state.charges.find((charge) => charge.id === where.id); return row ? { ...row, campaign: state.campaign } : null; },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(state.charges.find((charge) => charge.id === where.id)!, data),
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) => { const row = state.charges.find((charge) => charge.id === where.id && charge.status === where.status); if (row) Object.assign(row, data); return { count: row ? 1 : 0 }; },
    },
    billingProfile: { findUnique: async () => null },
    walletTransaction: { create: async () => { state.deposits += 1; return { id: "tx-1" }; } },
    user: { findUnique: async () => ({ stripeCustomerId: "cus_1" }) },
  };
  const modules = [
    mock.module("../lib/prisma.ts", { namedExports: { prisma: db } }),
    mock.module("../lib/quest-ledger.ts", { namedExports: { serializable: (work: (tx: typeof db) => Promise<unknown>) => work(db) } }),
    mock.module("../lib/stripe.ts", { namedExports: { getStripe: () => ({
      customers: { retrieve: async () => ({ deleted: false, invoice_settings: { default_payment_method: "pm_1" } }) },
      paymentIntents: {
        create: async () => {
          state.intents += 1;
          if (options.chargeStatus === "declined") throw Object.assign(new Error("declined"), { code: "card_declined" });
          return { id: "pi_1", status: "succeeded" };
        },
        cancel: async () => ({}),
      },
    }) } }),
  ];
  const priorKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "mocked";
  try {
    const { acceptApplicationWithFunding } = await import(`../lib/slot-funding.ts?accept=${randomUUID()}`);
    const outcome = await acceptApplicationWithFunding("dev", "app-1").then((value: unknown) => ({ value, error: null }), (error: Error) => ({ value: null, error }));
    return { ...outcome, state };
  } finally {
    for (const item of modules.reverse()) item.restore();
    if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = priorKey;
  }
}

test("accepting the first tester charges the card once and records a receipt", async () => {
  const { value, error, state } = await acceptHarness({ paid: 0, chargeStatus: "succeeded" });
  assert.equal(error, null);
  assert.equal((value as { accepted: boolean }).accepted, true);
  assert.equal(state.intents, 1);
  assert.equal(state.deposits, 1);
  assert.equal(state.application.status, "ACCEPTED");
  assert.equal(state.charges[0].status, "SUCCEEDED");
  assert.equal(state.charges[0].totalCents, 1988);
});

test("a freed paid slot is reused without charging again", async () => {
  const { value, state } = await acceptHarness({ paid: 1, chargeStatus: "succeeded" });
  assert.equal((value as { charged: unknown }).charged, null);
  assert.equal(state.intents, 0);
  assert.equal(state.application.status, "ACCEPTED");
});

test("a declined card blocks acceptance and marks the charge failed", async () => {
  const { error, state } = await acceptHarness({ paid: 0, chargeStatus: "declined" });
  assert.match(String(error?.message), /declined/);
  assert.equal(state.application.status, "PENDING");
  assert.equal(state.deposits, 0);
  assert.equal(state.charges[0].status, "FAILED");
});
