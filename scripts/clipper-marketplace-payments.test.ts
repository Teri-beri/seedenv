import assert from "node:assert/strict";
import { after, before, beforeEach, mock, test } from "node:test";

type State = {
  status: string; profileStatus: string; atomicProfileStatus: string; consent: Date | null;
  checkoutId: string | null; attempt: number; sessionStatus: string; paymentStatus: string;
  writes: number; creates: number; expires: number; retrievals: number; race: string;
};
function defaults(): State {
  return { status: "ACCEPTED", profileStatus: "APPROVED", atomicProfileStatus: "APPROVED", consent: new Date(), checkoutId: null, attempt: 1, sessionStatus: "open", paymentStatus: "unpaid", writes: 0, creates: 0, expires: 0, retrievals: 0, race: "" };
}
let state = defaults();
const campaign = { developerId: "developer", title: "Original mobile app story", platform: "TIKTOK", minimumRep: 0 };
function agreement(atomic = false) {
  return {
    id: "agreement", campaignId: "campaign", campaign, status: state.status, termsAcceptedAt: state.consent,
    checkoutId: state.checkoutId, fundingAttempt: state.attempt, fundedAt: null, feeCents: 5000, chargeCents: 5953,
    creator: { emailVerified: new Date(), xpPoints: 100, stripeConnectAccountId: "acct_fixture", clipProfile: { status: atomic ? state.atomicProfileStatus : state.profileStatus, socialUrl: "https://www.tiktok.com/@creator" } },
  };
}
const tx = { clipEngagement: {
  findUniqueOrThrow: async () => agreement(true),
  update: async ({ data }: { data: { status: string; checkoutId?: string | null; fundingAttempt?: { increment: number } } }) => {
    state.writes++;
    state.status = data.status;
    if ("checkoutId" in data) state.checkoutId = data.checkoutId ?? null;
    if (data.fundingAttempt) state.attempt += data.fundingAttempt.increment;
    return agreement();
  },
} };
const mocks = [
  mock.module("server-only", { namedExports: {} }),
  mock.module("@/lib/prisma", { namedExports: { prisma: { clipEngagement: {
    findUnique: async () => agreement(),
    updateMany: async ({ where, data }: { where: { status: string; fundingAttempt: number }; data: { checkoutId: string } }) => {
      assert.equal(where.status, "FUNDING");
      assert.equal(where.fundingAttempt, state.attempt);
      state.checkoutId = data.checkoutId;
      return { count: 1 };
    },
  } } } }),
  mock.module("@/lib/quest-ledger", { namedExports: { serializable: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }),
  mock.module("@/lib/stripe", { namedExports: { getStripe: () => ({
    accounts: { retrieve: async () => ({ payouts_enabled: true, capabilities: { transfers: "active" } }) },
    checkout: { sessions: {
      retrieve: async () => { state.retrievals++; return { id: "cs_fixture", status: state.sessionStatus, payment_status: state.paymentStatus, url: "https://checkout.stripe.invalid/fixture" }; },
      create: async (input: { line_items: Array<{ price_data: { unit_amount: number } }>; metadata: { fundingAttempt: string } }, options: { idempotencyKey: string }) => {
        state.creates++;
        assert.equal(input.line_items[0].price_data.unit_amount, 5953);
        assert.equal(input.metadata.fundingAttempt, String(state.attempt));
        assert.equal(options.idempotencyKey, `clip-checkout-agreement-${state.attempt}`);
        return { id: "cs_fixture", url: "https://checkout.stripe.invalid/fixture" };
      },
      expire: async (id: string, _input: object, options: { idempotencyKey: string }) => {
        assert.equal(id, "cs_fixture");
        assert.equal(options.idempotencyKey, `clip-expire-agreement-${state.attempt}`);
        state.expires++;
        if (state.race === "new-attempt") state.attempt++;
        if (state.race === "webhook") { state.status = "ACCEPTED"; state.checkoutId = null; }
        return { status: "expired", payment_status: "unpaid" };
      },
    } },
  }) } }),
];
const previousOrigin = process.env.NEXT_PUBLIC_APP_URL;
process.env.NEXT_PUBLIC_APP_URL = "https://seedenv.invalid";
let fundClipAgreement: typeof import("../lib/clipper-payments").fundClipAgreement;
let cancelUnpaidClipCheckout: typeof import("../lib/clipper-payments").cancelUnpaidClipCheckout;
before(async () => { ({ fundClipAgreement, cancelUnpaidClipCheckout } = await import("../lib/clipper-payments")); });
beforeEach(() => { state = defaults(); });
after(() => {
  for (const mockedModule of mocks) mockedModule.restore();
  if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = previousOrigin;
});

test("funding requires creator consent before any checkout is created", async () => {
  state.consent = null;
  await assert.rejects(fundClipAgreement("agreement", "developer"), /accept.*terms/);
  assert.equal(state.creates, 0);
  assert.equal(state.writes, 0);
});

test("atomic funding guard rejects a profile edited or suspended after preflight", async () => {
  for (const status of ["DRAFT", "SUSPENDED"]) {
    state.atomicProfileStatus = status;
    await assert.rejects(fundClipAgreement("agreement", "developer"), /approved/);
  }
  assert.equal(state.creates, 0);
  assert.equal(state.writes, 0);
});

test("funding preserves accepted cents and reserves exactly one attempt", async () => {
  assert.equal(await fundClipAgreement("agreement", "developer"), "https://checkout.stripe.invalid/fixture");
  assert.equal(state.status, "FUNDING");
  assert.equal(state.attempt, 2);
  assert.equal(state.checkoutId, "cs_fixture");
  assert.equal(state.creates, 1);
  assert.equal(await fundClipAgreement("agreement", "developer"), "https://checkout.stripe.invalid/fixture");
  assert.equal(state.creates, 1);
  assert.equal(state.attempt, 2);
});

test("checkout cancellation verifies developer ownership before Stripe access", async () => {
  state.status = "FUNDING";
  state.checkoutId = "cs_fixture";
  await assert.rejects(cancelUnpaidClipCheckout("agreement", "stranger"), /your campaign/);
  assert.equal(state.retrievals, 0);
});

test("paid or processing checkouts cannot be cancelled", async () => {
  state.status = "FUNDING";
  state.checkoutId = "cs_fixture";
  for (const [status, payment] of [["complete", "unpaid"], ["open", "paid"]]) {
    state.sessionStatus = status;
    state.paymentStatus = payment;
    await assert.rejects(cancelUnpaidClipCheckout("agreement", "developer"), /paid or is processing/);
  }
  assert.equal(state.expires, 0);
  assert.equal(state.writes, 0);
});

test("an authenticated expired-unpaid Stripe response restores unfunded acceptance", async () => {
  state.status = "FUNDING";
  state.checkoutId = "cs_fixture";
  assert.match(await cancelUnpaidClipCheckout("agreement", "developer"), /Unpaid checkout cancelled/);
  assert.equal(state.status, "ACCEPTED");
  assert.equal(state.checkoutId, null);
  assert.equal(state.attempt, 1);
  assert.equal(state.expires, 1);
});

test("a stale checkout cancellation cannot overwrite a newer funding attempt", async () => {
  state.status = "FUNDING";
  state.checkoutId = "cs_fixture";
  state.race = "new-attempt";
  await assert.rejects(cancelUnpaidClipCheckout("agreement", "developer"), /funding state changed/);
  assert.equal(state.writes, 0);
});

test("the expiry webhook winning the cancellation race is an idempotent success", async () => {
  state.status = "FUNDING";
  state.checkoutId = "cs_fixture";
  state.race = "webhook";
  assert.match(await cancelUnpaidClipCheckout("agreement", "developer"), /Unpaid checkout cancelled/);
  assert.equal(state.writes, 0);
});
