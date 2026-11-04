import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";

type Row = Record<string, unknown>;
const db = {
  receipts: new Map<string, Row>(),
  requests: new Map<string, Row>(),
  operations: new Map<string, Row>(),
  campaigns: new Map<string, Row>(),
  ledgerCreates: [] as Row[],
  balanceIncrements: [] as number[],
  topUpUpdates: [] as Row[],
  autoRefundedCents: 0,
  openAutoOps: 0,
};
const stripe = { refundable: 10_000, refundOutcome: "succeeded" as "succeeded" | "rejected" | "unknown" };
const calls = { emails: [] as Array<{ to: string; subject: string }>, refunds: [] as string[], reconciled: [] as string[] };
let seq = 0;

function matches(row: Row, where: Row = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "in" in (value as Row)) return ((value as { in: unknown[] }).in).includes(row[key]);
    if (value && typeof value === "object" && "not" in (value as Row)) return row[key] !== (value as { not: unknown }).not;
    if (value && typeof value === "object" && "gt" in (value as Row)) return true;
    return row[key] === value;
  });
}

const tx = {
  walletTransaction: {
    findUnique: async ({ where }: { where: { id: string } }) => db.receipts.get(where.id) ?? null,
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => db.receipts.get(where.id)!,
    create: async ({ data }: { data: Row }) => { db.ledgerCreates.push(data); return data; },
  },
  refundRequest: {
    count: async ({ where }: { where: Row }) => [...db.requests.values()].filter((row) => matches(row, where)).length,
    aggregate: async ({ where }: { where: Row }) => ({ _sum: { approvedCents: [...db.requests.values()].filter((row) => matches(row, where)).reduce((sum, row) => sum + Number(row.approvedCents ?? 0), 0) } }),
    create: async ({ data }: { data: Row }) => { const row = { id: `rr_${++seq}`, status: "OPEN", createdAt: new Date(), ...data }; db.requests.set(row.id as string, row); return row; },
    findUnique: async ({ where }: { where: { id: string } }) => db.requests.get(where.id) ?? null,
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => db.requests.get(where.id)!,
    update: async ({ where, data }: { where: { id: string }; data: Row }) => { const row = { ...db.requests.get(where.id)!, ...data }; db.requests.set(where.id, row); return row; },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const rows = [...db.requests.values()].filter((row) => matches(row, where));
      rows.forEach((row) => db.requests.set(row.id as string, { ...row, ...data }));
      return { count: rows.length };
    },
  },
  billingOperation: {
    aggregate: async () => ({ _sum: { amountCents: db.autoRefundedCents } }),
    count: async ({ where }: { where: Row }) => (where.kind && typeof where.kind === "object" ? db.openAutoOps : [...db.operations.values()].filter((row) => matches(row, where)).length),
    findUniqueOrThrow: async ({ where }: { where: { id: string } }) => db.operations.get(where.id)!,
    update: async ({ where, data }: { where: { id: string }; data: Row }) => { db.operations.set(where.id, { ...db.operations.get(where.id)!, ...data }); return db.operations.get(where.id); },
  },
  fundingReversal: { findUnique: async () => null },
  appCampaign: { findUnique: async ({ where }: { where: { id: string } }) => db.campaigns.get(where.id) ?? null },
  balanceTopUp: {
    findFirst: async () => ({ id: "top_1", creditCents: 5000, refundedCents: 0, stripePaymentIntentId: "pi_topup" }),
    updateMany: async (call: Row) => { db.topUpUpdates.push(call); return { count: 1 }; },
  },
  slotCharge: { count: async () => 0 },
  missionApplication: { count: async () => 0 },
  user: {
    update: async ({ data }: { data: { fundingBalanceCents: { increment: number } } }) => { db.balanceIncrements.push(data.fundingBalanceCents.increment); return {}; },
    findUnique: async () => ({ email: "dev@example.com" }),
  },
};

const mocks = [
  mock.module("server-only", { namedExports: {} }),
  mock.module("@/lib/prisma", { namedExports: { prisma: tx } }),
  mock.module("@/lib/billing-transaction", { namedExports: { billingTransaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }),
  mock.module("@/lib/billing-operations", { namedExports: {
    reserveBillingOperation: async (_client: unknown, data: Row) => { const row = { state: "RESERVED", ...data }; db.operations.set(data.id as string, row); return row; },
    operationRefund: async (operation: Row) => {
      calls.refunds.push(operation.id as string);
      if (stripe.refundOutcome === "rejected") { db.operations.set(operation.id as string, { ...operation, state: "FAILED" }); throw new Error("charge_already_refunded"); }
      if (stripe.refundOutcome === "unknown") throw new Error("socket hang up");
      return { id: `re_${operation.id}`, amount: operation.amountCents, status: "succeeded" };
    },
    cancelFailedRefund: async (id: string) => { const row = db.operations.get(id)!; if (row.state !== "FAILED") return false; db.operations.set(id, { ...row, state: "CANCELLED" }); return true; },
  } }),
  mock.module("@/lib/funding-reversals", { namedExports: { reconcileFundingPayment: async () => undefined } }),
  mock.module("@/lib/notifications", { namedExports: { sendNotificationEmail: async (to: string, subject: string) => { calls.emails.push({ to, subject }); return true; } } }),
  mock.module("@/lib/slot-funding", { namedExports: {
    campaignHasEnded: (campaign: Row) => campaign.status === "COMPLETED",
    reconcileCampaignFunding: async (id: string) => { calls.reconciled.push(id); return { refundedCents: 0, finalized: true }; },
    unusedPaidSlots: () => 0,
  } }),
  mock.module("@/lib/stripe", { namedExports: { getStripe: () => ({ paymentIntents: { retrieve: async () => ({ latest_charge: { amount_captured: stripe.refundable, amount_refunded: 0 } }) } }) } }),
];
after(() => mocks.forEach((item) => item.restore()));

let refunds: typeof import("@/lib/refunds");
before(async () => { refunds = await import("@/lib/refunds"); });
beforeEach(() => {
  for (const key of ["receipts", "requests", "operations", "campaigns"] as const) db[key].clear();
  db.ledgerCreates = []; db.balanceIncrements = []; db.topUpUpdates = []; db.autoRefundedCents = 0; db.openAutoOps = 0;
  stripe.refundable = 10_000; stripe.refundOutcome = "succeeded";
  calls.emails = []; calls.refunds = []; calls.reconciled = [];
  db.receipts.set("wt_cohort", { id: "wt_cohort", userId: "dev_1", type: "ESCROW_DEPOSIT", status: "COMPLETED", amountCents: 9600, campaignId: "camp_1", stripePaymentId: "pi_cohort" });
  db.receipts.set("wt_topup", { id: "wt_topup", userId: "dev_1", type: "BALANCE_TOPUP", status: "COMPLETED", amountCents: 5000, campaignId: null, stripePaymentId: "pi_topup" });
  db.receipts.set("wt_balance", { id: "wt_balance", userId: "dev_1", type: "ESCROW_DEPOSIT", status: "COMPLETED", amountCents: 1200, campaignId: "camp_1", stripePaymentId: null });
  db.campaigns.set("camp_1", { id: "camp_1", status: "COMPLETED", fundingModel: "PREPAID", claimedSlots: 4 });
});

const ask = (receiptId = "wt_cohort", amountCents = 2000) => refunds.createRefundRequest("dev_1", { receiptId, reason: "TESTER_QUALITY", details: "Four testers submitted blank recordings that were auto-approved.", amountCents });

test("developers can only request refunds on their own completed payments, within what remains", async () => {
  await assert.rejects(refunds.createRefundRequest("dev_2", { receiptId: "wt_cohort", reason: "OTHER", details: "x".repeat(40), amountCents: 500 }), /completed payment/);
  db.autoRefundedCents = 8000;
  await assert.rejects(ask("wt_cohort", 2000), /up to \$16\.00/);
  db.autoRefundedCents = 0;
  const request = await ask();
  assert.equal(request.status, "OPEN");
  assert.equal(calls.emails[0].to, "terimus@seedenv.com");
  await assert.rejects(ask(), /already has a refund request/);
});

test("approving balance credit increments the balance and records a support credit", async () => {
  const request = await ask("wt_balance", 1200);
  const approved = await refunds.approveRefundRequest(request.id as string, "admin_1", { resolution: "CREDIT", amountCents: 1200, note: "" });
  assert.equal(approved.status, "APPROVED");
  assert.deepEqual(db.balanceIncrements, [1200]);
  assert.equal(db.ledgerCreates[0].type, "SUPPORT_CREDIT");
  assert.equal(calls.refunds.length, 0);
  assert.ok(calls.emails.some((email) => email.to === "dev@example.com"));
  await assert.rejects(refunds.approveRefundRequest(request.id as string, "admin_1", { resolution: "CREDIT", amountCents: 1, note: "" }), /already been decided/);
});

test("balance-funded receipts cannot be refunded to a card", async () => {
  const request = await ask("wt_balance", 1200);
  await assert.rejects(refunds.approveRefundRequest(request.id as string, "admin_1", { resolution: "CARD", amountCents: 1200, note: "" }), /balance credit/);
  assert.equal(db.requests.get(request.id as string)!.status, "OPEN");
});

test("card refunds wait for the cohort to end and settle automatic refunds first", async () => {
  db.campaigns.set("camp_1", { id: "camp_1", status: "ACTIVE", fundingModel: "PREPAID", claimedSlots: 4 });
  const request = await ask();
  await assert.rejects(refunds.approveRefundRequest(request.id as string, "admin_1", { resolution: "CARD", amountCents: 2000, note: "" }), /after the cohort ends/);
  assert.equal(db.operations.size, 0);
  db.campaigns.set("camp_1", { id: "camp_1", status: "COMPLETED", fundingModel: "PREPAID", claimedSlots: 4 });
  db.openAutoOps = 1;
  await assert.rejects(refunds.approveRefundRequest(request.id as string, "admin_1", { resolution: "CARD", amountCents: 2000, note: "" }), /automatic refund in progress/);
  assert.ok(calls.reconciled.length >= 1 && calls.reconciled.every((id) => id === "camp_1"), "automatic refunds are settled before a card refund");
});

test("an approved card refund is idempotent, settled, and ledgered", async () => {
  const request = await ask();
  const approved = await refunds.approveRefundRequest(request.id as string, "admin_1", { resolution: "CARD", amountCents: 1500, note: "Blank recordings confirmed." });
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.approvedCents, 1500);
  const [operation] = [...db.operations.values()];
  assert.equal(operation.kind, "SUPPORT_REFUND");
  assert.equal(operation.paymentId, "pi_cohort");
  assert.equal(operation.state, "SETTLED");
  assert.equal(db.ledgerCreates[0].type, "SUPPORT_REFUND");
  assert.equal(db.balanceIncrements.length, 0, "card refunds never also credit the balance");
});

test("card refunds cannot exceed what Stripe can still refund", async () => {
  stripe.refundable = 1000;
  const request = await ask();
  await assert.rejects(refunds.approveRefundRequest(request.id as string, "admin_1", { resolution: "CARD", amountCents: 2000, note: "" }), /Only \$10\.00 can still go back/);
  assert.equal(db.operations.size, 0);
});

test("top-up card refunds reduce the top-up's refundable amount", async () => {
  const request = await ask("wt_topup", 3000);
  await refunds.approveRefundRequest(request.id as string, "admin_1", { resolution: "CARD", amountCents: 3000, note: "" });
  assert.equal(db.topUpUpdates.length, 1);
  assert.deepEqual((db.topUpUpdates[0] as { data: Row }).data, { refundedCents: { increment: 3000 } });
});

test("a rejected card refund returns the request to the queue; an unknown outcome stays processing", async () => {
  stripe.refundOutcome = "rejected";
  const request = await ask();
  await assert.rejects(refunds.approveRefundRequest(request.id as string, "admin_1", { resolution: "CARD", amountCents: 2000, note: "" }), /Stripe rejected/);
  assert.equal(db.requests.get(request.id as string)!.status, "OPEN");
  assert.equal(db.requests.get(request.id as string)!.billingOperationId, null);

  stripe.refundOutcome = "unknown";
  await assert.rejects(refunds.approveRefundRequest(request.id as string, "admin_1", { resolution: "CARD", amountCents: 2000, note: "" }), /not confirmed yet/);
  assert.equal(db.requests.get(request.id as string)!.status, "PROCESSING");
  const pendingOperation = db.requests.get(request.id as string)!.billingOperationId;
  assert.match(String(pendingOperation), /-1$/, "a retry after rejection uses a new operation id");

  stripe.refundOutcome = "succeeded";
  const approved = await refunds.approveRefundRequest(request.id as string, "admin_1", { resolution: "CARD", amountCents: 2000, note: "" });
  assert.equal(approved.status, "APPROVED");
  assert.equal(calls.refunds.at(-1), pendingOperation, "the retry resumes the same Stripe operation");
});

test("only open requests can be declined", async () => {
  const request = await ask();
  const denied = await refunds.denyRefundRequest(request.id as string, "admin_1", "Work met the posted directions.");
  assert.equal(denied.status, "DENIED");
  await assert.rejects(refunds.denyRefundRequest(request.id as string, "admin_1", "Again please."), /Only open/);
});
