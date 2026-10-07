import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { billingDetailsSchema, invoiceSnapshotSchema, invoiceTotalMatches, payoutScheduleLabel, supportRequestSchema } from "../lib/enterprise-rules";
import { generateInvoicePdf } from "../lib/invoice-pdf";

const company = { companyName: "Société QA", taxId: "FR123456789", billingEmail: "billing@example.fr", addressLine1: "10 Rue du Test", addressLine2: "", city: "Paris", region: "", postalCode: "75001", country: "FR" };
const snapshot = { version: 1 as const, cohortId: "cohort-test", cohortTitle: "TestFlight QA", rewardPoolCents: 10000, platformFeeCents: 500, company };

test("billing details, invoice totals, support metadata, and schedules remain bounded and truthful", () => {
  assert.equal(billingDetailsSchema.parse({ ...company, country: "fr" }).country, "FR");
  assert.equal(billingDetailsSchema.safeParse({ ...company, companyName: "" }).success, false);
  assert.equal(invoiceSnapshotSchema.safeParse(snapshot).success, true);
  assert.equal(invoiceTotalMatches(snapshot, 10500), true);
  assert.equal(invoiceTotalMatches(snapshot, 10501), false);
  assert.equal(invoiceTotalMatches(snapshot, -1), false);
  assert.equal(supportRequestSchema.safeParse({ category: "Technical Bug", subject: "A bug", message: "A reproducible bug with enough detail.", route: "/console?token=secret" }).success, false);
  assert.equal(payoutScheduleLabel(undefined), "Schedule unavailable");
  assert.equal(payoutScheduleLabel({ interval: "weekly", weekly_anchor: "friday", delay_days: 2 }), "Weekly on friday / 2-day availability delay");
  assert.equal(payoutScheduleLabel({ interval: "manual" }), "Manual bank payouts");
});

test("PDF receipts embed Unicode billing details and produce valid bounded pages", async () => {
  const bytes = await generateInvoicePdf({ id: "receipt-test", date: new Date("2026-10-05T12:00:00Z"), amountCents: 10500, paymentReference: "pi_test", snapshot });
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getTitle(), "SeedEnv receipt INV-2026-PTTEST");
  assert.ok(pdf.getPageCount() >= 1);
  assert.equal(pdf.getPage(0).getWidth(), 595);
  assert.ok(bytes.length > 1000);
});

test("invoice route rejects anonymous, foreign, pending, and inconsistent payments", async () => {
  let signedIn = false;
  let present = true;
  let amount = 10500;
  const queries: Array<Record<string, unknown>> = [];
  const modules = [
    mock.module("../app/api/auth/[...nextauth]/route.ts", { namedExports: { authOptions: {} } }),
    mock.module("next-auth", { namedExports: { getServerSession: async () => signedIn ? { user: { id: "owner" } } : null } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: { walletTransaction: { findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      queries.push(where);
      return present ? { id: "receipt-test", amountCents: amount, createdAt: new Date("2026-10-05"), stripePaymentId: "pi_test", invoiceSnapshot: snapshot } : null;
    } } } } }),
  ];
  try {
    const { GET } = await import(`../app/api/billing/invoices/[id]/route.ts?enterprise=${randomUUID()}`);
    const params = { params: Promise.resolve({ id: "receipt-test" }) };
    assert.equal((await GET(new Request("http://localhost/api/billing/invoices/receipt-test"), params)).status, 401);
    assert.equal(queries.length, 0);
    signedIn = true;
    present = false;
    assert.equal((await GET(new Request("http://localhost/api/billing/invoices/receipt-test"), params)).status, 404);
    assert.deepEqual(queries[0], { id: "receipt-test", userId: "owner", type: { in: ["ESCROW_DEPOSIT", "BALANCE_TOPUP"] }, status: "COMPLETED" });
    present = true;
    amount = 1;
    assert.equal((await GET(new Request("http://localhost/api/billing/invoices/receipt-test"), params)).status, 409);
    amount = 10500;
    const receipt = await GET(new Request("http://localhost/api/billing/invoices/receipt-test"), params);
    assert.equal(receipt.status, 200);
    assert.equal(receipt.headers.get("cache-control"), "private, no-store");
    assert.equal(receipt.headers.get("content-type"), "application/pdf");
    assert.equal(Buffer.from(await receipt.arrayBuffer()).subarray(0, 5).toString(), "%PDF-");
  } finally { for (const item of modules.reverse()) item.restore(); }
});

test("support identity is server-derived, rate-limited, durable, and admin-resolvable", async () => {
  let role = "TESTER";
  let signedIn = true;
  let recent = 0;
  let writes = 0;
  let emailAvailable = true;
  const recipients: string[] = [];
  let recorded: Record<string, unknown> = {};
  const queue = { count: async () => recent, create: async ({ data }: { data: Record<string, unknown> }) => { recorded = data; writes++; return { id: "support-test" }; }, update: async () => { writes++; return { id: "support-test" }; } };
  const modules = [
    mock.module("../lib/member.ts", { namedExports: { requireMember: async (required?: string) => { if (!signedIn || required && role !== required) throw new Error("Access denied."); return { id: "real-owner", role }; } } }),
    mock.module("../lib/notifications.ts", { namedExports: { sendNotificationEmail: async (to: string) => { recipients.push(to); return emailAvailable; } } }),
    mock.module("next/headers", { namedExports: { headers: async () => new Headers({ "user-agent": "Server browser / macOS" }) } }),
    mock.module("next/cache", { namedExports: { revalidatePath: () => undefined } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: { supportTicket: queue, billingProfile: { upsert: async () => { writes++; } } } } }),
    mock.module("../lib/quest-ledger.ts", { namedExports: { serializable: async (work: (tx: { supportTicket: typeof queue }) => Promise<unknown>) => work({ supportTicket: queue }) } }),
  ];
  try {
    const actions = await import(`../app/actions/enterpriseActions.ts?support=${randomUUID()}`);
    const payload = { category: "Technical Bug", subject: "Checkout issue", message: "Steps to reproduce a checkout problem safely.", route: "/console", userId: "spoofed-owner", role: "ADMIN", userAgent: "spoofed browser" };
    assert.equal((await actions.submitSupportRequest(payload)).ok, true);
    assert.equal(recorded.userId, "real-owner");
    assert.equal(recorded.role, "TESTER");
    assert.equal(recorded.userAgent, "Server browser / macOS");
    assert.deepEqual(recipients, ["terimus@seedenv.com"]);
    recent = 5;
    assert.equal((await actions.submitSupportRequest(payload)).ok, false);
    assert.equal(writes, 1);
    assert.equal((await actions.resolveSupportTicket("support-test")).ok, false);
    role = "ADMIN";
    assert.equal((await actions.resolveSupportTicket("support-test")).ok, true);
    signedIn = false;
    assert.equal((await actions.submitSupportRequest(payload)).ok, false);
    assert.equal(writes, 2);
    signedIn = true;
    role = "TESTER";
    assert.equal((await actions.saveCompanyBillingDetails(company)).ok, false);
    role = "DEVELOPER";
    assert.equal((await actions.saveCompanyBillingDetails(company)).ok, true);
    recent = 0;
    emailAvailable = false;
    const savedWithoutEmail = await actions.submitSupportRequest(payload);
    assert.equal(savedWithoutEmail.ok, true);
    assert.equal(savedWithoutEmail.emailNotified, false);
  } finally { for (const item of modules.reverse()) item.restore(); }
});

async function launchCustom(balanceCents: number, topUpCents?: number) {
  const priorKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "mocked-provider-config";
  const seen = { created: {} as Record<string, unknown>, deposits: 0, topUps: [] as Array<Record<string, unknown>>, checkout: null as null | { line_items: Array<{ price_data: { unit_amount: number } }>; metadata: Record<string, string>; cancel_url: string } };
  const modules = [
    mock.module("next/cache", { namedExports: { revalidatePath: () => undefined } }),
    mock.module("../lib/auth.ts", { namedExports: { getCurrentUser: async () => ({ id: "owner", role: "DEVELOPER", email: "dev@example.invalid", name: "Dev", username: "dev", stripeCustomerId: "cus_test", fundingBalanceCents: balanceCents }) } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: {
      billingProfile: { findUnique: async () => ({ ...company }) },
      appCampaign: { create: async ({ data }: { data: Record<string, unknown> }) => { seen.created = data; return { id: "cohort-test", ...data }; }, updateMany: async () => ({ count: 1 }) },
      walletTransaction: { create: async () => { seen.deposits += 1; return { id: "deposit-test" }; } },
      balanceTopUp: {
        create: async ({ data }: { data: Record<string, unknown> }) => { seen.topUps.push(data); return { id: "topup-test", ...data }; },
        update: async () => ({}),
        updateMany: async () => ({ count: 0 }),
      },
    } } }),
    mock.module("../lib/stripe.ts", { namedExports: { getStripe: () => ({
      customers: { retrieve: async () => ({ deleted: false, invoice_settings: { default_payment_method: null } }) },
      checkout: { sessions: { create: async (args: NonNullable<typeof seen.checkout>) => { seen.checkout = args; return { id: "cs_test", url: "https://checkout.stripe.com/mock" }; } } },
    }) } }),
  ];
  try {
    modules.push(mock.module("../lib/stripe-customer.ts", { namedExports: { ensureStripeCustomer: async () => "cus_test" } }));
    const balance = await import(`../lib/funding-balance.ts?custom=${randomUUID()}`);
    modules.push(mock.module("../lib/funding-balance.ts", { namedExports: balance }));
    const { createCampaignWithEscrow } = await import(`../app/actions/campaignActions.ts?custom=${randomUUID()}`);
    const result = await createCampaignWithEscrow({ title: "TestFlight QA", platform: "TESTFLIGHT", appUrl: "https://example.invalid", targetVibe: "Developer Tools", description: "A safe test of company invoice details at checkout.", totalSlots: 25, bountyPerTaskUsd: 4, instructions: [{ instructionTitle: "Onboarding", instructionDetail: "Follow signup and record any confusing steps.", proofType: "SCREENSHOT", minimumRep: 0 }], discoveryAllowed: false, discoveryMinRep: 0 }, undefined, topUpCents ? { topUpCents } : undefined);
    return { result, seen };
  } finally {
    for (const item of modules.reverse()) item.restore();
    if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = priorKey;
  }
}

test("custom drops launch straight to live when the prepaid balance covers the first tester", async () => {
  const { result, seen } = await launchCustom(1900);
  assert.equal(result.launched, true);
  assert.equal(result.checkoutUrl, null);
  assert.equal(seen.created.status, "ACTIVE");
  assert.equal(seen.created.fundingModel, "PAY_PER_TESTER");
  assert.equal(seen.deposits, 0);
  assert.equal(seen.checkout, null);
});

test("custom drops without enough balance wait for one top-up checkout, with no saved card required", async () => {
  const { result, seen } = await launchCustom(500, 5000);
  assert.equal(result.checkoutUrl, "https://checkout.stripe.com/mock");
  assert.equal(seen.created.status, "ESCROW_PENDING");
  assert.equal(seen.deposits, 0);
  assert.equal(seen.topUps[0].creditCents, 5000);
  assert.equal(seen.topUps[0].campaignId, "cohort-test");
  assert.deepEqual(seen.checkout?.line_items.map((item) => item.price_data.unit_amount), [5000]);
  assert.equal(seen.checkout?.metadata.type, "SEEDENV_BALANCE_TOPUP");
  // A tiny requested top-up is raised to cover the first tester's shortfall.
  const small = await launchCustom(500, 100);
  assert.equal(small.seen.topUps[0].creditCents, 1400);
});

test("balance-funded slot receipts total reward + fee, and top-up receipts include processing", () => {
  const slot = { ...snapshot, kind: "SLOT", rewardPoolCents: 400, platformFeeCents: 1500, processingFeeCents: 0 };
  assert.equal(invoiceTotalMatches(invoiceSnapshotSchema.parse(slot), 1900), true);
  const topUp = { ...snapshot, kind: "TOP_UP", rewardPoolCents: 5000, platformFeeCents: 0, processingFeeCents: 181 };
  assert.equal(invoiceSnapshotSchema.safeParse(topUp).success, true);
  assert.equal(invoiceTotalMatches(invoiceSnapshotSchema.parse(topUp), 5181), true);
  assert.equal(invoiceTotalMatches(invoiceSnapshotSchema.parse(topUp), 5000), false);
});

test("flat bundles override client slots, rewards, and platform at checkout", async () => {
  const priorKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "mocked-provider-config";
  let campaign: Record<string, unknown> = {};
  let written: Record<string, unknown> = {};
  let line = "";
  const modules = [
    mock.module("../lib/auth.ts", { namedExports: { getCurrentUser: async () => ({ id: "owner", role: "DEVELOPER", stripeCustomerId: "cus_test" }) } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: {
      billingProfile: { findUnique: async () => null },
      appCampaign: { create: async ({ data }: { data: Record<string, unknown> }) => { campaign = data; return { id: "bundle-test", ...data }; } },
      walletTransaction: { create: async ({ data }: { data: Record<string, unknown> }) => { written = data; return { id: "deposit-bundle" }; } },
    } } }),
    mock.module("../lib/stripe.ts", { namedExports: { getStripe: () => ({ customers: { retrieve: async () => ({ deleted: false, invoice_settings: { default_payment_method: "pm_test" } }) }, checkout: { sessions: { create: async (args: { line_items: Array<{ price_data: { product_data: { description: string } } }> }) => { line = args.line_items[0].price_data.product_data.description; return { url: "https://checkout.stripe.com/mock" }; } } } }) } }),
  ];
  try {
    const { createCampaignWithEscrow } = await import(`../app/actions/campaignActions.ts?bundle=${randomUUID()}`);
    await createCampaignWithEscrow({ title: "Play closed test", platform: "WEB_STAGING", appUrl: "https://example.invalid", targetVibe: "Android", description: "Bundle checkout must ignore tampered client values.", totalSlots: 5, bountyPerTaskUsd: 1, instructions: [{ instructionTitle: "Opt in", instructionDetail: "Join the closed test and keep the app installed.", proofType: "SCREENSHOT", minimumRep: 0 }], discoveryAllowed: false, discoveryMinRep: 0, cohortType: "GOOGLE_PLAY_14_DAY" });
    assert.equal(campaign.totalSlots, 20);
    assert.equal(campaign.bountyPerTaskUsd, 4);
    assert.equal(campaign.platform, "PLAY_STORE");
    assert.equal(campaign.guaranteedDays, 14);
    assert.equal(campaign.totalBudgetUsd, 199);
    assert.equal(written.amountCents, 19900);
    assert.equal(written.platformFeeCents, 11900);
    assert.equal(invoiceTotalMatches(invoiceSnapshotSchema.parse(written.invoiceSnapshot), 19900), true);
    assert.match(line, /flat \$119\.00 platform fee/);
  } finally {
    for (const item of modules.reverse()) item.restore();
    if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = priorKey;
  }
});
