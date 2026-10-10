import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Deliberately dynamic Prisma/Stripe test doubles, never a live database.
type Row = Record<string, any>;

function harness() {
  let tables: Record<string, Row[]> = {
    user: [{ id: "dev", fundingBalanceCents: 5000 }, { id: "tester", walletBalanceCents: 0, stripeConnectAccountId: "acct_test" }],
    appCampaign: [{ id: "campaign", developerId: "dev", title: "Security fixture", fundingModel: "PREPAID", status: "PAUSED", cancelledAt: new Date(), expiresAt: new Date(0), totalSlots: 3, claimedSlots: 1, bountyPerTaskUsd: 10, platformFeeUsd: 0, refundedCents: 0, billingHoldCents: 0 }],
    balanceTopUp: [], slotCharge: [], walletTransaction: [], billingOperation: [], fundingReversal: [], fundingAllocation: [], submission: [],
    feeCredit: [], firstCohortBenefit: [], referralAudit: [], cohortPromoRedemption: [],
  };
  const remote = {
    refunds: [] as Row[], transfers: [] as Row[], disputes: [] as Row[],
    intents: new Map<string, Row>(), charges: new Map<string, Row>(),
    refundCreates: 0, transferCreates: 0, loseRefundResponse: false, loseTransferResponse: false,
    failRemoteIdWrite: false, failLedgerWrite: false,
    refundStatus: "succeeded",
  };
  const matches = (row: Row, where: Row = {}): boolean => Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((item: Row) => matches(row, item));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      return Object.entries(value).every(([operator, operand]) => {
        if (operator === "not") return row[key] !== operand;
        if (operator === "in") return (operand as unknown[]).includes(row[key]);
        if (operator === "gte") return Number(row[key]) >= Number(operand);
        if (operator === "gt") return Number(row[key]) > Number(operand);
        if (operator === "lte") return Number(row[key]) <= Number(operand);
        if (operator === "startsWith") return String(row[key]).startsWith(String(operand));
        return false;
      });
    }
    return row[key] === value;
  });
  const apply = (row: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && !(value instanceof Date) && ("increment" in value || "decrement" in value)) {
        row[key] = (row[key] ?? 0) + (value.increment ?? 0) - (value.decrement ?? 0);
      } else row[key] = value;
    }
    return structuredClone(row);
  };
  const db: Row = {};
  for (const name of Object.keys(tables)) {
    const read = (args: Row = {}) => {
      let rows = tables[name].filter((row) => matches(row, args.where));
      if (args.orderBy) for (const [key, direction] of Object.entries(args.orderBy)) rows = rows.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (direction === "desc" ? -1 : 1));
      return rows.map((row) => {
        const result = structuredClone(row);
        if (args.include?.campaign) result.campaign = structuredClone(tables.appCampaign.find((item) => item.id === row.campaignId));
        return result;
      });
    };
    db[name] = {
      findMany: async (args: Row) => read(args),
      findUnique: async (args: Row) => read(args)[0] ?? null,
      findFirst: async (args: Row) => read(args)[0] ?? null,
      findUniqueOrThrow: async (args: Row) => { const row = read(args)[0]; if (!row) throw new Error(`Missing ${name}`); return row; },
      count: async (args: Row) => read(args).length,
      create: async ({ data }: Row) => {
        if (name === "walletTransaction" && data.status === "COMPLETED" && data.type === "ESCROW_REFUND" && remote.failLedgerWrite) { remote.failLedgerWrite = false; throw new Error("Database interrupted during settlement"); }
        const row = { id: `${name}-${tables[name].length}`, createdAt: new Date(), firstAttemptAt: null, remoteId: null, stripePaymentId: null, state: "RESERVED", reversedCents: 0, appliedCents: 0, disputedCents: 0, refundedCents: 0, releasedCents: 0, ...structuredClone(data) };
        tables[name].push(row);
        return structuredClone(row);
      },
      upsert: async ({ where, create, update }: Row) => {
        const row = tables[name].find((item) => matches(item, where));
        return row ? apply(row, update) : db[name].create({ data: create });
      },
      update: async ({ where, data }: Row) => {
        if (name === "billingOperation" && data.remoteId && remote.failRemoteIdWrite) { remote.failRemoteIdWrite = false; throw new Error("Database interrupted after Stripe mutation"); }
        if (name === "walletTransaction" && data.status === "COMPLETED" && remote.failLedgerWrite) { remote.failLedgerWrite = false; throw new Error("Database interrupted during settlement"); }
        const row = tables[name].find((item) => matches(item, where));
        if (!row) throw new Error(`Missing update ${name}`);
        return apply(row, data);
      },
      updateMany: async ({ where, data }: Row) => {
        if (name === "walletTransaction" && data.status === "COMPLETED" && remote.failLedgerWrite) { remote.failLedgerWrite = false; throw new Error("Database interrupted during settlement"); }
        const rows = tables[name].filter((item) => matches(item, where));
        rows.forEach((row) => apply(row, data));
        return { count: rows.length };
      },
    };
  }
  db.billingProfile = { findUnique: async () => null };
  let queue = Promise.resolve();
  const serializable = <T>(work: (tx: Row) => Promise<T>): Promise<T> => {
    const run = queue.then(async () => {
      const before = structuredClone(tables);
      try { return await work(db); } catch (error) { tables = before; throw error; }
    });
    queue = run.then(() => undefined, () => undefined);
    return run;
  };
  db.$transaction = serializable;
  const stream = (rows: Row[]) => (async function* () { for (const row of structuredClone(rows)) yield row; })();
  const stripe = {
    paymentIntents: { retrieve: async (id: string) => { const intent = remote.intents.get(id); if (!intent) throw new Error("Missing fake intent"); return structuredClone(intent); } },
    charges: { retrieve: async (id: string) => structuredClone(remote.charges.get(id)) },
    accounts: { retrieve: async () => ({ payouts_enabled: true }) },
    disputes: {
      list: ({ charge }: Row) => stream(remote.disputes.filter((row) => row.charge === charge)),
      retrieve: async (id: string) => structuredClone(remote.disputes.find((row) => row.id === id)),
    },
    refunds: {
      list: ({ payment_intent }: Row) => stream(remote.refunds.filter((row) => row.payment_intent === payment_intent)),
      retrieve: async (id: string) => structuredClone(remote.refunds.find((row) => row.id === id)),
      create: async (data: Row, { idempotencyKey }: Row) => {
        const existing = remote.refunds.find((row) => row.key === idempotencyKey);
        if (existing) return structuredClone(existing);
        remote.refundCreates++;
        const row = { id: `re_${remote.refundCreates}`, key: idempotencyKey, status: remote.refundStatus, currency: "usd", charge: `ch_${data.payment_intent}`, ...structuredClone(data) };
        remote.refunds.push(row);
        if (remote.loseRefundResponse) { remote.loseRefundResponse = false; throw new Error("Lost Stripe refund response"); }
        return structuredClone(row);
      },
    },
    transfers: {
      list: (args: Row) => stream(remote.transfers.filter((row) => !args.transfer_group || row.transfer_group === args.transfer_group)),
      retrieve: async (id: string) => structuredClone(remote.transfers.find((row) => row.id === id)),
      create: async (data: Row, { idempotencyKey }: Row) => {
        const existing = remote.transfers.find((row) => row.key === idempotencyKey);
        if (existing) return structuredClone(existing);
        remote.transferCreates++;
        const row = { id: `tr_${remote.transferCreates}`, key: idempotencyKey, amount_reversed: 0, reversed: false, ...structuredClone(data) };
        remote.transfers.push(row);
        if (remote.loseTransferResponse) { remote.loseTransferResponse = false; throw new Error("Lost Stripe transfer response"); }
        return structuredClone(row);
      },
    },
  };
  function funding(paymentId: string, metadata: Row = {}) {
    remote.intents.set(paymentId, { id: paymentId, status: "succeeded", currency: "usd", latest_charge: `ch_${paymentId}`, metadata });
    remote.charges.set(`ch_${paymentId}`, { id: `ch_${paymentId}`, payment_intent: paymentId });
  }
  function topUp(status = "SUCCEEDED") {
    tables.balanceTopUp.push({ id: "topup", userId: "dev", status, creditCents: 5000, totalCents: 5000, processingFeeCents: 0, refundedCents: 0, stripePaymentIntentId: status === "PENDING" ? null : "pi_topup", createdAt: new Date(0) });
    funding("pi_topup", { type: "SEEDENV_BALANCE_TOPUP", topUpId: "topup" });
  }
  function prepaid() {
    funding("pi_prepaid");
    tables.walletTransaction.push({ id: "deposit", userId: "dev", campaignId: "campaign", type: "ESCROW_DEPOSIT", status: "COMPLETED", stripePaymentId: "pi_prepaid", amountCents: 3000, platformFeeCents: 0 });
  }
  function payout(legacy = false) {
    tables.walletTransaction.push({ id: "payout", userId: "tester", campaignId: "campaign", type: "BOUNTY_PAYOUT", status: "PENDING", amountCents: 1000 });
    if (!legacy) tables.billingOperation.push({ id: "seedenv-payout-payout", kind: "PAYOUT", resourceId: "payout", ledgerId: "payout", userId: "tester", campaignId: "campaign", destinationId: "acct_test", amountCents: 1000, state: "RESERVED", firstAttemptAt: null, remoteId: null });
  }
  return { db, serializable, stripe, remote, funding, topUp, prepaid, payout, rows: (name: string) => tables[name] };
}

async function withHarness(work: (h: ReturnType<typeof harness>, modules: Row) => Promise<void>) {
  const h = harness();
  const mocks = [
    mock.module("../lib/ai/campaign-synthesis.ts", { namedExports: { synthesizeCampaign: async () => ({ status: "skipped" }) } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: h.db } }),
    mock.module("../lib/quest-ledger.ts", { namedExports: { serializable: h.serializable, awardQuestXp: async () => {}, qualifyReferral: async () => {} } }),
    mock.module("../lib/billing-transaction.ts", { namedExports: { billingTransaction: h.serializable } }),
    mock.module("../lib/stripe.ts", { namedExports: { getStripe: () => h.stripe } }),
    mock.module("../lib/notifications.ts", { namedExports: { notificationEnabled: () => false, sendNotificationEmail: async () => {} } }),
  ];
  const priorKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "test-double-only";
  try {
    const suffix = randomUUID();
    const operations = await import(`../lib/billing-operations.ts?test=${suffix}`);
    mocks.push(mock.module("../lib/billing-operations.ts", { namedExports: operations }));
    const reversals = await import(`../lib/funding-reversals.ts?test=${suffix}`);
    mocks.push(mock.module("../lib/funding-reversals.ts", { namedExports: reversals }));
    const balance = await import(`../lib/funding-balance.ts?test=${suffix}`);
    mocks.push(mock.module("../lib/funding-balance.ts", { namedExports: balance }));
    const slots = await import(`../lib/slot-funding.ts?test=${suffix}`);
    const payouts = await import(`../lib/submission-approval.ts?test=${suffix}`);
    await work(h, { operations, reversals, balance, slots, payouts });
  } finally {
    mocks.reverse().forEach((item) => item.restore());
    if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = priorKey;
  }
}

test("partial top-up reversals replay exactly once, create funding debt, and won disputes restore only disputed backing", async () => {
  await withHarness(async (h, { reversals }) => {
    h.topUp();
    h.rows("appCampaign")[0].fundingModel = "PAY_PER_TESTER";
    h.rows("user")[0].fundingBalanceCents = 1000;
    h.remote.refunds.push({ id: "external", payment_intent: "pi_topup", amount: 1500, status: "succeeded", metadata: {} });
    await reversals.handleFundingReversal("charge.refunded", "ch_pi_topup");
    await reversals.handleFundingReversal("charge.refunded", "ch_pi_topup");
    assert.equal(h.rows("user")[0].fundingBalanceCents, -500);
    assert.equal(h.rows("walletTransaction").length, 1);
    await assert.rejects(h.serializable((tx) => reversals.assertCampaignFunding(tx, "campaign")), /Funding debt/);
    h.remote.disputes.push({ id: "dp_test", charge: "ch_pi_topup", amount: 1000, status: "needs_response" });
    await reversals.handleFundingReversal("charge.dispute.created", "dp_test");
    assert.equal(h.rows("user")[0].fundingBalanceCents, -1500);
    h.remote.disputes[0].status = "won";
    // Deliver the older created event after Stripe has already closed the dispute.
    await reversals.handleFundingReversal("charge.dispute.created", "dp_test");
    await reversals.handleFundingReversal("charge.dispute.closed", "dp_test");
    assert.equal(h.rows("user")[0].fundingBalanceCents, -500);
    assert.equal(h.rows("walletTransaction").filter((row) => row.type === "FUNDING_RESTORATION").length, 1);
  });
});

test("a reversal delivered before checkout credit is applied when the top-up is credited; credit replay cannot resurrect it", async () => {
  await withHarness(async (h, { reversals, balance }) => {
    h.topUp("PENDING");
    h.rows("user")[0].fundingBalanceCents = 0;
    h.remote.refunds.push({ id: "external", payment_intent: "pi_topup", amount: 2000, status: "succeeded", metadata: {} });
    await reversals.handleFundingReversal("charge.refunded", "ch_pi_topup");
    assert.equal(h.rows("user")[0].fundingBalanceCents, 0);
    await h.serializable((tx) => balance.creditTopUp(tx, "topup", "pi_topup"));
    await h.serializable((tx) => balance.creditTopUp(tx, "topup", "pi_topup"));
    assert.equal(h.rows("user")[0].fundingBalanceCents, 3000);
    assert.equal(h.rows("walletTransaction").filter((row) => row.type === "BALANCE_TOPUP").length, 1);
  });
});

test("prepaid reversals hold payouts, permit replacement backing, and do not double-credit a won dispute", async () => {
  await withHarness(async (h, { reversals }) => {
    h.prepaid();
    h.remote.disputes.push({ id: "dp_prepaid", charge: "ch_pi_prepaid", amount: 1200, status: "needs_response" });
    await reversals.handleFundingReversal("charge.dispute.created", "dp_prepaid");
    await assert.rejects(h.serializable((tx) => reversals.assertCampaignFunding(tx, "campaign")), /missing escrow/);
    await reversals.replaceCampaignFunding("dev", "campaign");
    assert.equal(h.rows("appCampaign")[0].billingHoldCents, 0);
    assert.equal(h.rows("user")[0].fundingBalanceCents, 3800);
    h.remote.disputes[0].status = "won";
    await reversals.handleFundingReversal("charge.dispute.closed", "dp_prepaid");
    await reversals.handleFundingReversal("charge.dispute.closed", "dp_prepaid");
    assert.equal(h.rows("appCampaign")[0].billingHoldCents, 0);
    assert.equal(h.rows("user")[0].fundingBalanceCents, 5000);
  });
});

test("replacement escrow keeps card-lot provenance and its top-up reversal holds the prepaid campaign too", async () => {
  await withHarness(async (h, { reversals }) => {
    h.topUp();
    h.prepaid();
    h.remote.refunds.push({ id: "external_prepaid", payment_intent: "pi_prepaid", amount: 2000, status: "succeeded", metadata: {} });
    await reversals.handleFundingReversal("charge.refunded", "ch_pi_prepaid");
    await reversals.replaceCampaignFunding("dev", "campaign");
    assert.equal(h.rows("fundingAllocation")[0].amountCents, 2000);
    h.remote.refunds.push({ id: "external_topup", payment_intent: "pi_topup", amount: 5000, status: "succeeded", metadata: {} });
    await reversals.handleFundingReversal("charge.refunded", "ch_pi_topup");
    assert.equal(h.rows("user")[0].fundingBalanceCents, -2000);
    await assert.rejects(h.serializable((tx) => reversals.assertCampaignFunding(tx, "campaign")), /Funding debt/);
  });
});

test("different concurrent prepaid refund targets share a reserved operation before Stripe, then account only the remaining delta", async () => {
  await withHarness(async (h, { slots }) => {
    h.prepaid();
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const create = h.stripe.refunds.create;
    h.stripe.refunds.create = async (...args: Parameters<typeof create>) => { entered(); await waiting; return create(...args); };
    const first = slots.reconcileCampaignFunding("campaign");
    await started;
    assert.equal(h.rows("billingOperation")[0].amountCents, 2000);
    // A tester slot is released while the first target is still in flight.
    h.rows("appCampaign")[0].claimedSlots = 0;
    const second = slots.reconcileCampaignFunding("campaign");
    release();
    await Promise.all([first, second]);
    assert.equal(h.remote.refundCreates, 2);
    assert.equal(h.remote.refunds.reduce((sum, row) => sum + row.amount, 0), 3000);
    assert.equal(h.rows("appCampaign")[0].refundedCents, 3000);
    assert.equal(h.rows("walletTransaction").filter((row) => row.type === "ESCROW_REFUND").length, 2);
  });
});

test("refund settlement interruption resumes the same remote refund after the Stripe idempotency window", async () => {
  await withHarness(async (h, { slots }) => {
    h.prepaid();
    h.remote.failLedgerWrite = true;
    await assert.rejects(slots.reconcileCampaignFunding("campaign"), /interrupted during settlement/);
    assert.equal(h.rows("appCampaign")[0].refundedCents, 0);
    h.rows("billingOperation")[0].firstAttemptAt = new Date(Date.now() - 48 * 3600000);
    await slots.reconcileCampaignFunding("campaign");
    assert.equal(h.remote.refundCreates, 1);
    assert.equal(h.rows("appCampaign")[0].refundedCents, 2000);
  });
});

test("partial external prepaid reversal plus replacement returns only remaining card backing and the replacement balance", async () => {
  await withHarness(async (h, { slots, reversals }) => {
    h.topUp();
    h.prepaid();
    h.rows("appCampaign")[0].claimedSlots = 0;
    h.remote.refunds.push({ id: "external", payment_intent: "pi_prepaid", amount: 1000, status: "succeeded", metadata: {} });
    await reversals.handleFundingReversal("charge.refunded", "ch_pi_prepaid");
    await reversals.replaceCampaignFunding("dev", "campaign");
    assert.equal(h.rows("user")[0].fundingBalanceCents, 4000);
    await slots.reconcileCampaignFunding("campaign");
    assert.equal(h.remote.refundCreates, 1);
    assert.equal(h.remote.refunds.filter((row) => row.metadata.seedenvOperationId).reduce((sum, row) => sum + row.amount, 0), 2000);
    assert.equal(h.rows("appCampaign")[0].refundedCents, 3000);
    assert.equal(h.rows("user")[0].fundingBalanceCents, 5000);
    assert.equal(h.rows("fundingAllocation")[0].releasedCents, 1000);
    await reversals.handleFundingReversal("charge.refunded", "ch_pi_prepaid");
    assert.equal(h.rows("appCampaign")[0].billingHoldCents, 0);
  });
});

test("withdrawal lost-response retry uses its reserved card provenance and never restores an ambiguous refund to spendable balance", async () => {
  await withHarness(async (h, { balance }) => {
    h.topUp();
    h.remote.loseRefundResponse = true;
    await assert.rejects(balance.withdrawBalance("dev"), /Lost Stripe refund response/);
    assert.equal(h.rows("user")[0].fundingBalanceCents, 0);
    assert.equal(h.rows("balanceTopUp")[0].refundedCents, 0);
    h.rows("billingOperation").forEach((row) => { if (row.firstAttemptAt) row.firstAttemptAt = new Date(Date.now() - 48 * 3600000); });
    await balance.withdrawBalance("dev");
    assert.equal(h.remote.refundCreates, 1);
    assert.equal(h.rows("balanceTopUp")[0].refundedCents, 5000);
    assert.equal(h.rows("walletTransaction")[0].status, "COMPLETED");
  });
});

test("Stripe-confirmed failed withdrawals return reserved funds exactly once and allow a new refund attempt", async () => {
  await withHarness(async (h, { balance }) => {
    h.topUp();
    h.remote.refundStatus = "failed";
    const failed = await balance.withdrawBalance("dev");
    assert.equal(failed.refundedCents, 0);
    assert.equal(h.rows("user")[0].fundingBalanceCents, 5000);
    assert.equal(h.rows("walletTransaction")[0].status, "FAILED");
    assert.equal(h.rows("billingOperation").filter((row) => row.kind === "WITHDRAWAL_REFUND")[0].state, "CANCELLED");
    h.remote.refundStatus = "succeeded";
    const retried = await balance.withdrawBalance("dev");
    assert.equal(retried.refundedCents, 5000);
    assert.equal(h.rows("user")[0].fundingBalanceCents, 0);
    assert.equal(h.remote.refundCreates, 2);
  });
});

test("concurrent payout retries reconcile a lost response after 48 hours without a second transfer or wallet credit", async () => {
  await withHarness(async (h, { payouts }) => {
    h.payout();
    h.remote.loseTransferResponse = true;
    await assert.rejects(payouts.transferTesterPayout("tester", "payout"), /Lost Stripe transfer response/);
    h.rows("billingOperation")[0].firstAttemptAt = new Date(Date.now() - 48 * 3600000);
    await Promise.all([payouts.transferTesterPayout("tester", "payout"), payouts.transferTesterPayout("tester", "payout")]);
    assert.equal(h.remote.transferCreates, 1);
    assert.equal(h.rows("user")[1].walletBalanceCents, 1000);
    assert.equal(h.rows("walletTransaction")[0].status, "COMPLETED");
  });
});

test("payout database failure before remote identity persistence still discovers the existing transfer on delayed retry", async () => {
  await withHarness(async (h, { payouts }) => {
    h.payout();
    h.remote.failRemoteIdWrite = true;
    await assert.rejects(payouts.transferTesterPayout("tester", "payout"), /Database interrupted/);
    assert.equal(h.rows("billingOperation")[0].remoteId, null);
    h.rows("billingOperation")[0].firstAttemptAt = new Date(Date.now() - 48 * 3600000);
    await payouts.transferTesterPayout("tester", "payout");
    assert.equal(h.remote.transferCreates, 1);
    assert.equal(h.rows("user")[1].walletBalanceCents, 1000);
  });
});

test("payout ledger settlement failure rolls back wallet credit and safely settles the existing remote transfer", async () => {
  await withHarness(async (h, { payouts }) => {
    h.payout();
    h.remote.failLedgerWrite = true;
    await assert.rejects(payouts.transferTesterPayout("tester", "payout"), /Database interrupted/);
    assert.equal(h.rows("user")[1].walletBalanceCents, 0);
    assert.equal(h.rows("walletTransaction")[0].status, "PENDING");
    h.rows("billingOperation")[0].firstAttemptAt = new Date(Date.now() - 48 * 3600000);
    await payouts.transferTesterPayout("tester", "payout");
    assert.equal(h.remote.transferCreates, 1);
    assert.equal(h.rows("user")[1].walletBalanceCents, 1000);
  });
});

test("legacy payout reconciliation discovers old ledger metadata without relying on an expired idempotency key", async () => {
  await withHarness(async (h, { payouts }) => {
    h.payout(true);
    h.remote.transfers.push({ id: "tr_legacy", amount: 1000, currency: "usd", destination: "acct_test", amount_reversed: 0, reversed: false, metadata: { seedenvUserId: "tester", seedenvLedgerTransactionId: "payout" } });
    await payouts.transferTesterPayout("tester", "payout");
    assert.equal(h.remote.transferCreates, 0);
    assert.equal(h.rows("walletTransaction")[0].stripePaymentId, "tr_legacy");
    assert.equal(h.rows("user")[1].walletBalanceCents, 1000);
  });
});

test("expired unknown payouts and legacy pending payouts with no remote evidence require explicit reconciliation, not a new transfer", async () => {
  await withHarness(async (h, { payouts }) => {
    h.payout();
    h.rows("billingOperation")[0].firstAttemptAt = new Date(Date.now() - 48 * 3600000);
    await assert.rejects(payouts.transferTesterPayout("tester", "payout"), /unknown beyond/);
    assert.equal(h.remote.transferCreates, 0);
    h.rows("billingOperation").splice(0);
    await assert.rejects(payouts.transferTesterPayout("tester", "payout"), /Legacy payout/);
    assert.equal(h.remote.transferCreates, 0);
  });
});
