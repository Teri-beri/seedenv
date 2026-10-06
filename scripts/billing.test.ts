import assert from "node:assert/strict";
import test from "node:test";
import { buildInvoiceLedgerRow, escrowStatusFor, invoiceNumber, lockedEscrowCents, platformTag } from "../lib/billing";
import { billingDetailsSchema } from "../lib/enterprise-rules";

const base = { companyName: "TERIMUS LLC", taxId: "", addressLine1: "1 Main St", addressLine2: "", city: "Miami", region: "FL", postalCode: "33101", country: "us" };

test("billing contact email is optional but validated, and legacy snapshots still parse", () => {
  assert.equal(billingDetailsSchema.parse(base).billingEmail, "");
  assert.equal(billingDetailsSchema.safeParse({ ...base, billingEmail: "billing@terimus.com" }).success, true);
  assert.equal(billingDetailsSchema.safeParse({ ...base, billingEmail: "not-an-email" }).success, false);
});

test("invoice numbers are stable and derived from the transaction", () => {
  assert.equal(invoiceNumber("cmabc123xyz9", new Date("2026-10-02T12:00:00Z")), "INV-2026-23XYZ9");
  assert.equal(platformTag("TESTFLIGHT"), "iOS");
  assert.equal(platformTag(null), null);
});

test("escrow status reflects payment and cohort state", () => {
  assert.equal(escrowStatusFor("PENDING", "ESCROW_PENDING"), "AWAITING_PAYMENT");
  assert.equal(escrowStatusFor("FAILED", "ACTIVE"), "FAILED");
  assert.equal(escrowStatusFor("COMPLETED", "ACTIVE"), "ESCROW_ACTIVE");
  assert.equal(escrowStatusFor("COMPLETED", "COMPLETED"), "SETTLED");
});

test("ledger rows only allow PDF download for confirmed, consistent receipts", () => {
  const snapshot = { version: 1, cohortId: "c1", cohortTitle: "Beta", rewardPoolCents: 10000, platformFeeCents: 500, company: null };
  const row = (status: "COMPLETED" | "PENDING", amountCents: number) => buildInvoiceLedgerRow({ id: "tx_1", amountCents, status, platformFeeCents: 500, invoiceSnapshot: snapshot, campaignId: "c1", createdAt: new Date("2026-10-01"), campaign: { id: "c1", title: "Beta", platform: "PLAY_STORE", status: "ACTIVE" } });
  assert.equal(row("COMPLETED", 10500).downloadable, true);
  assert.equal(row("PENDING", 10500).downloadable, false);
  assert.equal(row("COMPLETED", 9999).downloadable, false);
  assert.deepEqual([row("COMPLETED", 10500).testerPoolCents, row("COMPLETED", 10500).feeCents, row("COMPLETED", 10500).platform], [10000, 500, "Android"]);
});

test("locked escrow excludes the platform fee and released payouts", () => {
  assert.equal(lockedEscrowCents([{ totalBudgetUsd: 105, platformFeeUsd: 5, approvedPayoutCents: 3000 }, { totalBudgetUsd: 21, platformFeeUsd: 1, approvedPayoutCents: 5000 }]), 7000);
});
