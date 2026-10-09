import test, { mock } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  floridaServiceTaxAudit, storedValueTaxAudit, taxAuditSchema,
  STORED_VALUE_TAX_CODE, QA_SERVICE_TAX_CODE,
  TAX_POLICY_VERSION,
} from "../lib/billing/tax-policy";
import { storedValueCheckoutTax, validateStoredValueCheckout, validateServiceCheckout } from "../lib/stripe/billing";
import { redemptionLineItems, bountyReleaseTaxFields } from "../lib/billing/ledger";
import { invoiceSnapshotSchema, invoiceTotalMatches } from "../lib/enterprise-rules";

test("Florida policy is opt-in and unconfigured jurisdictions cannot become exempt receipts", () => {
  const previous = process.env.SEEDENV_FLORIDA_QA_TAX_POLICY_CONFIRMED;
  try {
    process.env.SEEDENV_FLORIDA_QA_TAX_POLICY_CONFIRMED = "0";
    assert.throws(() => floridaServiceTaxAudit({ country: "US", region: "FL" }), /not been approved/);
    process.env.SEEDENV_FLORIDA_QA_TAX_POLICY_CONFIRMED = "1";
    for (const address of [null, { country: "US", region: "CA" }, { country: "US", region: null }, { country: "GB", region: "FL" }]) {
      assert.throws(() => floridaServiceTaxAudit(address), /only configured for Florida/);
    }
    const tax = floridaServiceTaxAudit({ country: "us", region: "Florida" });
    const serviceSession: Parameters<typeof validateServiceCheckout>[0] = {
      id: "cs_service", metadata: { seedenvServiceTax: "1", terimus_llc_business_unit: "seedenv", tax_policy_version: TAX_POLICY_VERSION },
      automatic_tax: { enabled: true, status: "complete", liability: null, provider: "stripe" },
      total_details: { amount_tax: 0, amount_discount: 0, amount_shipping: 0 },
      customer_details: { address: { country: "US", state: "FL", city: "Miami", line1: "Test address", line2: null, postal_code: "33101" }, email: null, name: null, business_name: null, individual_name: null, phone: null, tax_exempt: "none", tax_ids: null },
    };
    process.env.SEEDENV_FLORIDA_QA_TAX_POLICY_CONFIRMED = "0";
    assert.equal(validateServiceCheckout(serviceSession, tax)?.addressSource, "STRIPE_CHECKOUT", "paid settlements use the approved snapshot, not today's flag");
    assert.throws(() => validateServiceCheckout({ ...serviceSession, customer_details: null }, tax), /outside/);
    assert.throws(() => validateServiceCheckout(serviceSession, null), /does not match/);
    assert.throws(() => validateServiceCheckout({ ...serviceSession, total_details: { ...serviceSession.total_details!, amount_tax: 1 } }, tax), /reconciliation/);
    assert.equal(tax.taxAmountCents, 0);
    assert.equal(tax.taxCode, QA_SERVICE_TAX_CODE);
    const items = redemptionLineItems(1000, 200, tax);
    assert.equal(items.reduce((sum, row) => sum + row.amountCents, 0), 1200);
    assert.equal(items[2].description, "Tax Collected");
    assert.equal(items[2].amountCents, 0);
    assert.throws(() => redemptionLineItems(-1, 200, tax), /nonnegative/);
    const payout = bountyReleaseTaxFields(tax);
    assert.equal(payout.taxAudit?.stage, "BOUNTY_RELEASE");
    assert.throws(() => bountyReleaseTaxFields(storedValueTaxAudit()), /service-redemption/);
    const snapshot = invoiceSnapshotSchema.parse({
      version: 1, kind: "SLOT", cohortId: "campaign", cohortTitle: "QA",
      rewardPoolCents: 1000, platformFeeCents: 200, company: null, tax,
    });
    assert.equal(invoiceTotalMatches(snapshot, 1200), true);
    assert.equal(invoiceTotalMatches(snapshot, 1201), false);
    assert.equal(taxAuditSchema.safeParse({ ...tax, taxAmountCents: 1 }).success, false);
  } finally {
    if (previous === undefined) delete process.env.SEEDENV_FLORIDA_QA_TAX_POLICY_CONFIRMED;
    else process.env.SEEDENV_FLORIDA_QA_TAX_POLICY_CONFIRMED = previous;
  }
});

test("tax-aware credit Checkout validates complete zero tax before exactly-once balance credit", async () => {
  const previous = process.env.SEEDENV_STRIPE_TAX_ENABLED;
  process.env.SEEDENV_STRIPE_TAX_ENABLED = "1";
  let checkout: Stripe.Checkout.SessionCreateParams | null = null;
  let credited = 0;
  let receipt: { taxAmountCents?: number; taxAudit?: unknown; invoiceSnapshot?: unknown } | null = null;
  const topUp = {
    id: "topup-fixture", userId: "dev", status: "PENDING", source: "CHECKOUT",
    creditCents: 10000, processingFeeCents: 0, totalCents: 10000,
    stripePaymentIntentId: null as string | null, campaignId: null,
  };
  const db = {
    balanceTopUp: {
      create: async ({ data }: { data: { creditCents: number; totalCents: number } }) => {
        topUp.creditCents = data.creditCents; topUp.totalCents = data.totalCents;
        return topUp;
      },
      update: async ({ data }: { data: { status?: string; stripePaymentIntentId?: string } }) => {
        if (data.status) topUp.status = data.status;
        if (data.stripePaymentIntentId) topUp.stripePaymentIntentId = data.stripePaymentIntentId;
        return topUp;
      },
      updateMany: async () => ({ count: 1 }),
      findUnique: async () => topUp,
    },
    billingProfile: { findUnique: async () => null },
    walletTransaction: { create: async ({ data }: { data: typeof receipt }) => { receipt = data; return { id: "receipt" }; } },
    user: { update: async ({ data }: { data: { fundingBalanceCents: { increment: number } } }) => {
      credited += data.fundingBalanceCents.increment; return {};
    } },
  };
  const modules = [
    mock.module("../lib/prisma.ts", { namedExports: { prisma: db } }),
    mock.module("../lib/billing-transaction.ts", { namedExports: { billingTransaction: (work: (tx: typeof db) => Promise<unknown>) => work(db) } }),
    mock.module("../lib/funding-reversals.ts", { namedExports: { reconcileFundingPayment: async () => undefined } }),
    mock.module("../lib/stripe-customer.ts", { namedExports: { ensureStripeCustomer: async () => "cus_dev" } }),
    mock.module("../lib/stripe.ts", { namedExports: { getStripe: () => ({
      checkout: { sessions: { create: async (params: Stripe.Checkout.SessionCreateParams) => { checkout = params; return { id: "cs_fixture", url: "https://checkout.stripe.com/fixture" }; } } },
      customers: { retrieve: async () => ({ invoice_settings: { default_payment_method: "pm_fixture" } }) },
    }) } }),
  ];
  try {
    const { createTopUpCheckout, handleTopUpCheckout } = await import("../lib/funding-balance");
    const member = { id: "dev", email: "dev@example.invalid", name: null, username: "dev", stripeCustomerId: "cus_dev" };
    for (const creditCents of [10000, 50000]) {
      await createTopUpCheckout(member, creditCents, { successPath: "/console", cancelPath: "/console" });
      const captured = checkout as Stripe.Checkout.SessionCreateParams | null;
      assert.ok(captured);
      assert.equal(captured.automatic_tax?.enabled, true);
      assert.equal(captured.billing_address_collection, "required");
      assert.equal(captured.customer_update?.address, "auto");
      assert.equal(captured.line_items?.[0].price_data?.product_data?.tax_code, STORED_VALUE_TAX_CODE);
      assert.equal(captured.line_items?.[0].price_data?.unit_amount, creditCents);
      assert.equal(captured.metadata?.terimus_llc_business_unit, "seedenv");
    }
    const session: Parameters<typeof handleTopUpCheckout>[0] = {
      id: "cs_fixture", mode: "payment", status: "complete", payment_status: "paid",
      currency: "usd", amount_total: 50000, payment_intent: "pi_fixture", customer: "cus_dev",
      metadata: { topUpId: topUp.id, seedenvUserId: "dev", seedenvAutomaticTax: "1", terimus_llc_business_unit: "seedenv", tax_policy_version: TAX_POLICY_VERSION },
      automatic_tax: { enabled: true, status: "complete", liability: null, provider: "stripe" },
      total_details: { amount_tax: 0, amount_discount: 0, amount_shipping: 0 },
    };
    await assert.rejects(handleTopUpCheckout({ ...session, total_details: { ...session.total_details!, amount_tax: 100 } }), /amount|tax/);
    await assert.rejects(handleTopUpCheckout({ ...session, automatic_tax: { enabled: true, status: "requires_location_inputs", liability: null, provider: "stripe" } }), /incomplete/);
    await assert.rejects(handleTopUpCheckout({ ...session, amount_total: 49999 }), /amount/);
    assert.equal(credited, 0);
    await handleTopUpCheckout(session);
    await handleTopUpCheckout(session);
    assert.equal(credited, 50000, "webhook replay must not credit twice");
    const stored = receipt as { taxAmountCents?: number; taxAudit?: unknown; invoiceSnapshot?: unknown } | null;
    assert.ok(stored);
    assert.equal(stored.taxAmountCents, 0);
    assert.equal(taxAuditSchema.parse(stored.taxAudit).stage, "CREDIT_PURCHASE");
    assert.equal(invoiceSnapshotSchema.parse(stored.invoiceSnapshot).tax?.taxCode, STORED_VALUE_TAX_CODE);
    process.env.SEEDENV_STRIPE_TAX_ENABLED = "0";
    assert.deepEqual(storedValueCheckoutTax(), {});
    assert.equal(validateStoredValueCheckout({ id: "legacy", metadata: {} }), null);
    assert.throws(() => validateStoredValueCheckout({ ...session, automatic_tax: undefined }), /incomplete/);
  } finally {
    for (const mockedModule of modules.reverse()) mockedModule.restore();
    if (previous === undefined) delete process.env.SEEDENV_STRIPE_TAX_ENABLED;
    else process.env.SEEDENV_STRIPE_TAX_ENABLED = previous;
  }
});
