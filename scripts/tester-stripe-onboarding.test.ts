import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { randomUUID } from "node:crypto";
import type Stripe from "stripe";

test("new tester Stripe accounts are individuals; existing accounts keep their identity and destination", async () => {
  const priorKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "test-double-only";
  let linkedAccount: string | null = null;
  const creations: Stripe.AccountCreateParams[] = [];
  const links: Stripe.AccountLinkCreateParams[] = [];
  const modules = [
    mock.module("../lib/auth.ts", { namedExports: { getCurrentUser: async () => ({
      id: "tester", email: "tester@example.invalid", role: "TESTER", stripeConnectAccountId: linkedAccount,
    }) } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: { user: { update: async ({ data }: { data: { stripeConnectAccountId: string } }) => {
      linkedAccount = data.stripeConnectAccountId;
    } } } } }),
    mock.module("../lib/stripe.ts", { namedExports: { getStripe: () => ({
      accounts: {
        create: async (params: Stripe.AccountCreateParams) => { creations.push(params); return { id: "acct_individual" }; },
        retrieve: async () => ({ country: "US", business_type: "company" }),
      },
      accountLinks: { create: async (params: Stripe.AccountLinkCreateParams) => {
        links.push(params); return { url: "https://connect.stripe.com/setup/test" };
      } },
    }) } }),
  ];
  try {
    const { createStripeConnectOnboardingLink } = await import(`../app/actions/accountActions.ts?onboarding=${randomUUID()}`);
    const fresh = await createStripeConnectOnboardingLink("US");
    assert.equal(fresh.ok, true);
    assert.equal(creations.length, 1);
    assert.equal(creations[0].business_type, "individual");
    assert.deepEqual(creations[0].capabilities, { transfers: { requested: true } });
    assert.match(creations[0].business_profile?.product_description ?? "", /software testing/);
    assert.equal(linkedAccount, "acct_individual");

    assert.equal((await createStripeConnectOnboardingLink("US")).ok, true);
    assert.equal(creations.length, 1, "existing business accounts must never be recreated or converted");
    assert.equal(links[1].account, "acct_individual");
    assert.equal((await createStripeConnectOnboardingLink("CA")).ok, false);
    assert.equal((await createStripeConnectOnboardingLink("invalid")).ok, false);
    assert.equal(links.length, 2);
  } finally {
    modules.reverse().forEach((item) => item.restore());
    if (priorKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = priorKey;
  }
});
