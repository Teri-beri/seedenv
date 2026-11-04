import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, mock, test } from "node:test";

type UpdateCall = { where: Record<string, unknown>; data: Record<string, unknown> };
const state = {
  updates: [] as UpdateCall[],
  rowCount: 1,
  invoice: { id: "in_fixture", metadata: { seedenvInvoice: "1" } as Record<string, string>, hosted_invoice_url: "https://invoice.stripe.com/i/acct_x/live_fixture", invoice_pdf: "https://pay.stripe.com/invoice/acct_x/live_fixture/pdf" },
  payments: [{ status: "paid", payment: { type: "payment_intent", payment_intent: "pi_fixture" } }] as Array<{ status: string; payment: { type: string; payment_intent?: string } }>,
  retrieveFails: false,
};

const mocks = [
  mock.module("server-only", { namedExports: {} }),
  mock.module("@/lib/prisma", { namedExports: { prisma: { walletTransaction: {
    updateMany: async (call: UpdateCall) => { state.updates.push(call); return { count: state.rowCount }; },
    update: async (call: UpdateCall) => { state.updates.push(call); return {}; },
  } } } }),
  mock.module("@/lib/stripe", { namedExports: { getStripe: () => ({
    invoices: { retrieve: async (id: string) => { if (state.retrieveFails) throw new Error("Stripe offline"); return { ...state.invoice, id }; } },
    invoicePayments: { list: async () => ({ data: state.payments }) },
  }) } }),
];
after(() => mocks.forEach((item) => item.restore()));
beforeEach(() => {
  state.updates = [];
  state.rowCount = 1;
  state.retrieveFails = false;
  delete process.env.STRIPE_CHECKOUT_INVOICES;
  delete process.env.SEEDENV_LEGAL_ADDRESS;
});

let legal: typeof import("@/lib/legal-entity");
let invoicing: typeof import("@/lib/stripe/invoicing");
let billing: typeof import("@/lib/billing");
before(async () => {
  legal = await import("@/lib/legal-entity");
  invoicing = await import("@/lib/stripe/invoicing");
  billing = await import("@/lib/billing");
});

test("legal disclosures print the entity, configured address, and Florida registration", () => {
  assert.deepEqual(legal.legalAddressLines("  100 Main St\u0007 Suite 4 | Miami, FL 33101  | United States "), ["100 Main St Suite 4", "Miami, FL 33101", "United States"]);
  const lines = legal.legalDisclosureLines("100 Main St|Miami, FL 33101");
  assert.equal(lines[0], "TERIMUS LLC (d/b/a SeedEnv)");
  assert.deepEqual(lines.slice(1, 3), ["100 Main St", "Miami, FL 33101"]);
  assert.ok(lines.some((line) => line.includes(legal.SEEDENV_LEGAL_ENTITY.documentNumber)));
  assert.equal(legal.legalDisclosureLines("").length, 3, "no fabricated address when none is configured");
});

test("checkout invoice creation carries the legal footer and stays inside Stripe limits", () => {
  process.env.SEEDENV_LEGAL_ADDRESS = "100 Main St|Miami, FL 33101";
  const params = invoicing.checkoutInvoiceCreation({ description: "x".repeat(2000), metadata: { type: "SEEDENV_CAMPAIGN_ESCROW", campaignId: "c1" } });
  const invoice = params.invoice_creation!;
  assert.equal(invoice.enabled, true);
  assert.equal(invoice.invoice_data!.description!.length, 1500);
  assert.match(String(invoice.invoice_data!.footer), /TERIMUS LLC[\s\S]*100 Main St[\s\S]*L25000544505/);
  assert.deepEqual(invoice.invoice_data!.metadata, { type: "SEEDENV_CAMPAIGN_ESCROW", campaignId: "c1", seedenvInvoice: "1" });
  const fields = invoice.invoice_data!.custom_fields as Array<{ name: string; value: string }>;
  assert.ok(fields.length <= 4 && fields.every((field) => field.name.length <= 40 && field.value.length <= 140));
  process.env.STRIPE_CHECKOUT_INVOICES = "OFF";
  assert.deepEqual(invoicing.checkoutInvoiceCreation({ description: "d", metadata: {} }), {});
});

test("only https Stripe-owned invoice URLs are ever redirected to", () => {
  assert.equal(invoicing.safeStripeInvoiceUrl("https://invoice.stripe.com/i/x"), "https://invoice.stripe.com/i/x");
  assert.equal(invoicing.safeStripeInvoiceUrl("https://pay.stripe.com/invoice/x/pdf"), "https://pay.stripe.com/invoice/x/pdf");
  for (const bad of ["http://invoice.stripe.com/i/x", "https://stripe.com.evil.test/x", "https://evilstripe.com/x", "javascript:alert(1)", "not a url", null, undefined]) {
    assert.equal(invoicing.safeStripeInvoiceUrl(bad), null, String(bad));
  }
});

test("checkout settlement links the Stripe invoice to the completed receipt and caches its links", async () => {
  const result = await invoicing.linkCheckoutInvoice({ invoice: "in_fixture" }, "pi_fixture");
  assert.deepEqual(result, { linked: 1 });
  const [link, cache] = state.updates;
  assert.equal(link.where.stripePaymentId, "pi_fixture");
  assert.equal(link.where.status, "COMPLETED");
  assert.deepEqual(link.data, { stripeInvoiceId: "in_fixture" });
  assert.deepEqual(cache.data, { hostedInvoiceUrl: state.invoice.hosted_invoice_url, invoicePdfUrl: state.invoice.invoice_pdf });
});

test("invoice linking never blocks settlement and skips sessions without invoices", async () => {
  assert.deepEqual(await invoicing.linkCheckoutInvoice({ invoice: null }, "pi_fixture"), { linked: 0 });
  state.retrieveFails = true;
  assert.deepEqual(await invoicing.linkCheckoutInvoice({ invoice: "in_fixture" }, "pi_fixture"), { linked: 1 });
  assert.equal(state.updates.length, 1, "invoice ID is still stored when link caching fails");
});

test("invoice webhooks link late-finalized SeedEnv invoices through their paid payment intent only", async () => {
  assert.deepEqual(await invoicing.handleInvoiceEvent("in_fixture"), { invoiceLinked: 1 });
  assert.deepEqual((state.updates[0].where.stripePaymentId as { in: string[] }).in, ["pi_fixture"]);
  state.invoice.metadata = {};
  assert.deepEqual(await invoicing.handleInvoiceEvent("in_other"), { ignored: true });
  state.invoice.metadata = { seedenvInvoice: "1" };
  state.payments = [{ status: "open", payment: { type: "payment_intent", payment_intent: "pi_open" } }];
  assert.deepEqual(await invoicing.handleInvoiceEvent("in_fixture"), { awaitingPayment: true });
});

test("hosted invoice redirects refresh from Stripe and fall back to the cached link", async () => {
  const row = { id: "tx", stripeInvoiceId: "in_fixture", hostedInvoiceUrl: "https://invoice.stripe.com/i/old", invoicePdfUrl: null };
  assert.deepEqual(await invoicing.resolveStripeInvoiceUrl(row, "pdf"), { url: state.invoice.invoice_pdf, fresh: true });
  state.retrieveFails = true;
  assert.deepEqual(await invoicing.resolveStripeInvoiceUrl(row, "hosted"), { url: "https://invoice.stripe.com/i/old", fresh: false });
});

test("receipt rows expose Stripe invoice links only for completed, linked payments", () => {
  const base = { id: "tx", amountCents: 1000, platformFeeCents: 0, invoiceSnapshot: null, campaignId: null, createdAt: new Date("2026-11-01"), campaign: null };
  assert.equal(billing.buildInvoiceLedgerRow({ ...base, status: "COMPLETED", stripeInvoiceId: "in_1" }).stripeInvoice, true);
  assert.equal(billing.buildInvoiceLedgerRow({ ...base, status: "PENDING", stripeInvoiceId: "in_1" }).stripeInvoice, false);
  assert.equal(billing.buildInvoiceLedgerRow({ ...base, status: "COMPLETED", stripeInvoiceId: null }).stripeInvoice, false);
});

test("receipt font is a static face so pdf-lib subsetting keeps every glyph", () => {
  const font = readFileSync(new URL("../assets/fonts/NotoSans.ttf", import.meta.url));
  const tables = Array.from({ length: font.readUInt16BE(4) }, (_, index) => font.toString("latin1", 12 + index * 16, 16 + index * 16));
  assert.ok(tables.includes("glyf") && tables.includes("cmap"));
  assert.ok(!tables.includes("fvar") && !tables.includes("gvar"), "variable fonts render as missing glyphs after subsetting");
});

test("funding checkouts, webhook, and download route are wired to Stripe invoices", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.match(read("app/actions/campaignActions.ts"), /checkoutInvoiceCreation\(\{[\s\S]*SEEDENV_CAMPAIGN_ESCROW/);
  assert.match(read("lib/funding-balance.ts"), /checkoutInvoiceCreation\(\{[\s\S]*SEEDENV_BALANCE_TOPUP/);
  const webhook = read("lib/campaign-payments.ts");
  assert.match(webhook, /invoice\.finalized[\s\S]*invoice\.paid[\s\S]*handleInvoiceEvent/);
  assert.equal(webhook.match(/linkCheckoutInvoice\(session/g)?.length, 2);
  const route = read("app/api/billing/invoices/[id]/stripe/route.ts");
  assert.match(route, /userId: session\.user\.id/);
  assert.match(route, /status: 303/);
  assert.match(read("components/billing/invoice-table.tsx"), /\/stripe\?view=hosted[\s\S]*rel="noopener noreferrer"[\s\S]*\/stripe\?view=pdf/);
  assert.match(read("lib/invoice-pdf.ts"), /legalDisclosureLines\(\)/);
});
