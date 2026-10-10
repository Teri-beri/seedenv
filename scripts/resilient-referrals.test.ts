import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type User } from "@prisma/client";
import { REFERRAL_RULES, referralStackDiscountPercent } from "../lib/config/referral";
import { isTestFlightUrl, testFlightJoinToken } from "../lib/services/testflight-ownership.service";
import type { CampaignInput } from "../app/actions/campaignActions";
import { queueReferralCredit, vestCampaignReferralCredits } from "../lib/services/referral.service";
import { attachDeveloperReferral } from "../lib/developer-referrals";

test("new referral stacks retain a platform-fee floor and normalize only genuine TestFlight join URLs", () => {
  assert.deepEqual([0, 1, 2, 3, 100].map(referralStackDiscountPercent), [0, 50, 75, 75, 75]);
  assert.equal(REFERRAL_RULES.MIN_QUALIFYING_ESCROW_CENTS, 5000);
  assert.throws(() => referralStackDiscountPercent(-1));
  assert.equal(testFlightJoinToken("https://TESTFLIGHT.APPLE.COM/join/Abcd1234/?utm_source=ref#test"), "Abcd1234");
  assert.equal(isTestFlightUrl("https://testflight.apple.com/join/Abcd1234"), true);
  assert.equal(isTestFlightUrl("https://example.invalid"), false);
  for (const url of ["https://example.invalid/join/Abcd1234", "http://testflight.apple.com/join/Abcd1234", "https://testflight.apple.com.evil.invalid/join/Abcd1234", "https://testflight.apple.com@evil.invalid/join/Abcd1234", "https://testflight.apple.com/join/Abcd1234/another", "https://testflight.apple.com/join/short", "https://testflight.apple.com:444/join/Abcd1234"]) assert.throws(() => testFlightJoinToken(url));
});

test("qualification uses exact funded escrow and vesting requires real, eligible testing at the 50% boundary", async () => {
  const db = new PrismaClient();
  const delegates = { appCampaign: { ...db.appCampaign }, user: { ...db.user }, developerReferral: { ...db.developerReferral }, walletTransaction: { ...db.walletTransaction }, feeCredit: { ...db.feeCredit }, submission: { ...db.submission } };
  const tx = new Proxy(db, { get: (target, property, receiver) => property in delegates ? Reflect.get(delegates, property) : Reflect.get(target, property, receiver) });
  let escrow = 4999;
  let started = 49;
  let cancelled = false;
  let status = "ACTIVE";
  let minted = 0;
  let vested = 0;
  const now = new Date("2026-10-25T12:00:00Z");
  const mocks = [
    mock.method(tx.appCampaign, "findUniqueOrThrow", async () => ({ id: "source", developerId: "referee", totalSlots: 100, bountyPerTaskUsd: 1, status, cancelledAt: cancelled ? now : null, billingHoldCents: 0, refundedCents: 0 })),
    mock.method(tx.user, "findUniqueOrThrow", async () => ({ id: "referee", referredById: "inviter", fundingBalanceCents: 0 })),
    mock.method(tx.developerReferral, "findUnique", async () => ({ inviterId: "inviter", qualifiedAt: null })),
    mock.method(tx.walletTransaction, "findMany", async () => [{ amountCents: escrow + 1500, platformFeeCents: 1500 }]),
    mock.method(tx.feeCredit, "upsert", async () => { minted++; return {}; }),
    mock.method(tx.submission, "count", async (input: { where: Record<string, unknown> }) => {
      assert.deepEqual(input.where.testerId, { not: "referee" });
      assert.equal(input.where.denialReviewPending, false);
      assert.deepEqual(input.where.hardwareStatus, { not: "EMULATOR_FLAGGED" });
      assert.deepEqual(input.where.OR, [{ status: "APPROVED" }, { status: "PENDING", OR: [{ expiresAt: { gt: now } }, { submittedAt: { not: null } }] }]);
      return started;
    }),
    mock.method(tx.feeCredit, "updateMany", async (input: { data: { expiresAt: Date; vestedAt: Date; status: string } }) => {
      assert.equal(input.data.status, "VESTED");
      assert.equal(input.data.expiresAt.getTime() - input.data.vestedAt.getTime(), 90 * 86400000);
      vested++;
      return { count: 1 };
    }),
    mock.method(tx.developerReferral, "updateMany", async () => ({ count: 1 })),
  ];
  try {
    await queueReferralCredit(tx, "source");
    assert.equal(minted, 0, "$49.99 in actual tester escrow is insufficient even with a paid servicing fee.");
    escrow = 5000;
    await queueReferralCredit(tx, "source");
    assert.equal(minted, 1, "$50.00 in actual tester escrow qualifies.");
    await vestCampaignReferralCredits(tx, "source", now);
    assert.equal(vested, 0, "49 of 100 genuine starts do not vest.");
    started = 50;
    await vestCampaignReferralCredits(tx, "source", now);
    assert.equal(vested, 1, "50 of 100 genuine starts vest.");
    cancelled = true; status = "COMPLETED";
    await vestCampaignReferralCredits(tx, "source", now);
    assert.equal(vested, 1, "Cancelled COMPLETED campaigns never vest.");
    await queueReferralCredit(tx, "source");
    assert.equal(minted, 1, "Cancelled funding cannot mint a credit.");
  } finally {
    mocks.reverse().forEach(item => item.mock.restore());
    await db.$disconnect();
  }
});

test("a refunded launch top-up does not reopen referral attachment eligibility", async () => {
  const db = new PrismaClient();
  const delegates = { user: { ...db.user }, developerReferral: { ...db.developerReferral }, walletTransaction: { ...db.walletTransaction }, balanceTopUp: { ...db.balanceTopUp } };
  const tx = new Proxy(db, { get: (target, property, receiver) => property in delegates ? Reflect.get(delegates, property) : Reflect.get(target, property, receiver) });
  const mocks = [
    mock.method(tx.user, "findUniqueOrThrow", async () => ({ id: "referee", role: "DEVELOPER", referredById: null })),
    mock.method(tx.user, "findUnique", async () => ({ id: "inviter", role: "DEVELOPER", emailVerified: new Date() })),
    mock.method(tx.developerReferral, "findUnique", async () => null),
    mock.method(tx.developerReferral, "findFirst", async () => null),
    mock.method(tx.walletTransaction, "findFirst", async () => null),
    mock.method(tx.balanceTopUp, "findFirst", async (input: { where: { status: { in: string[] } } }) => {
      assert.deepEqual(input.where.status.in, ["SUCCEEDED", "REFUNDED"]);
      return { id: "paid-then-refunded", status: "REFUNDED" };
    }),
  ];
  try { await assert.rejects(attachDeveloperReferral(tx, "referee", "DEV_INVITER"), /before your first paid cohort/); }
  finally { mocks.reverse().forEach(item => item.mock.restore()); await db.$disconnect(); }
});

test("resilient referral DAG, dust rejection, escrow milestones, concurrent redemption, first-cohort and refund clawbacks (sandbox PostgreSQL)", { skip: process.env.RUN_RESILIENT_REFERRAL_DB_TESTS !== "1" }, async () => {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(url.hostname.startsWith("dpg-db4khrcs728c73flrip0-a") && url.pathname === "/seedenv_staging_db", "Only the guarded sandbox may be used.");
  const db = new PrismaClient();
  const marker = `rr-${randomUUID()}`;
  const ids: string[] = [];
  let memberId = "";
  let sequence = 0;
  let lastLines: number[] = [];
  const sessions = new Map<string, { id: string; mode: string; status: string; payment_status: string; currency: string; amount_total: number; payment_intent: string; metadata: Record<string, string> }>();
  const oldStripe = process.env.STRIPE_SECRET_KEY;
  const oldTax = process.env.SEEDENV_STRIPE_TAX_ENABLED;
  process.env.STRIPE_SECRET_KEY = "sk_test_unit_no_external_calls";
  process.env.SEEDENV_STRIPE_TAX_ENABLED = "0";
  const modules = [
    mock.module("../lib/prisma.ts", { namedExports: { prisma: db } }),
    mock.module("../lib/auth.ts", { namedExports: { getCurrentUser: async () => db.user.findUniqueOrThrow({ where: { id: memberId } }) } }),
    mock.module("../lib/member.ts", { namedExports: { requireMember: async (role?: string) => {
      const user = await db.user.findUniqueOrThrow({ where: { id: memberId } });
      if (role && user.role !== role && user.role !== "ADMIN") throw new Error("Wrong workspace.");
      return user;
    } } }),
    mock.module("../lib/social-connections.ts", { namedExports: { queueFollowerEmails: async () => undefined } }),
    mock.module("next/cache", { namedExports: { revalidatePath: () => undefined } }),
    mock.module("../lib/stripe.ts", { namedExports: { getStripe: () => ({
      customers: { retrieve: async () => ({ deleted: false, invoice_settings: { default_payment_method: "pm_mock" } }) },
      paymentIntents: { retrieve: async () => ({ latest_charge: null }) },
      checkout: { sessions: {
        create: async (input: { metadata: Record<string, string>; line_items: Array<{ price_data: { unit_amount: number } }> }) => {
          lastLines = input.line_items.map(line => line.price_data.unit_amount);
          const id = `cs_mock_resilient_${sessions.size}`;
          sessions.set(id, { id, mode: "payment", status: "complete", payment_status: "paid", currency: "usd", amount_total: lastLines.reduce((sum, cents) => sum + cents, 0), payment_intent: `pi_${id}`, metadata: input.metadata });
          return { id, url: "https://checkout.stripe.com/mock-resilient" };
        },
        retrieve: async (id: string) => { const session = sessions.get(id); assert.ok(session); return session; },
      } },
    }) } }),
  ];
  const createUser = async (role: User["role"] = "DEVELOPER", balance = 100000) => {
    const user = await db.user.create({ data: { email: `${marker}-${sequence++}@example.invalid`, username: `${marker}-${sequence}`, role, emailVerified: new Date(), fundingBalanceCents: balance, stripeCustomerId: "cus_mock", developerWorkspaceEnabled: role === "DEVELOPER", developerReferralCode: `DEV_${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}` } });
    ids.push(user.id);
    return user;
  };
  try {
    const { billingTransaction } = await import("../lib/billing-transaction");
    const { attachDeveloperReferral } = await import("../lib/developer-referrals");
    const { reserveAutomaticFeeBenefits, recordCampaignFeeBenefits, releaseUnfundedFeeBenefits } = await import("../lib/services/billing.service");
    const { queueReferralCredit, vestCampaignReferralCredits, revokeCampaignReferralCredits } = await import("../lib/services/referral.service");
    const { assertTestFlightOwner } = await import("../lib/services/testflight-ownership.service");
    const { createCampaignWithEscrow } = await import("../app/actions/campaignActions");
    const { acceptApplicationWithFunding } = await import("../lib/slot-funding");
    const { claimTaskSlot } = await import("../app/actions/submissionActions");
    const { handleStripeWebhook } = await import("../lib/campaign-payments");
    const a = await createUser();
    const b = await createUser();
    const c = await createUser();
    assert.ok(a.referralCode && b.referralCode && a.referralCode !== b.referralCode);
    await assert.rejects(billingTransaction(tx => attachDeveloperReferral(tx, a.id, a.developerReferralCode!)), /refer yourself/);
    await billingTransaction(tx => attachDeveloperReferral(tx, b.id, a.developerReferralCode!));
    await billingTransaction(tx => attachDeveloperReferral(tx, c.id, b.developerReferralCode!));
    await assert.rejects(billingTransaction(tx => attachDeveloperReferral(tx, a.id, c.developerReferralCode!)), /Circular|reciprocal/);
    await assert.rejects(billingTransaction(tx => attachDeveloperReferral(tx, b.id, c.developerReferralCode!)), /already/);
    await assert.rejects(db.user.update({ where: { id: b.id }, data: { referredById: c.id } }), /immutable/);
    await assert.rejects(db.developerReferral.update({ where: { developerId: b.id }, data: { inviterId: c.id } }), /immutable/);
    const cycleUsers = await Promise.all([createUser(), createUser(), createUser()]);
    const directCycle = await Promise.allSettled(cycleUsers.map((user, index) => db.user.update({ where: { id: user.id }, data: { referredById: cycleUsers[(index + 1) % cycleUsers.length].id } })));
    assert.equal(directCycle.filter(result => result.status === "rejected").length, 1, "Concurrent direct PostgreSQL writes cannot create a three-node cycle.");
    const reciprocalUsers = await Promise.all([createUser(), createUser()]);
    const reciprocal = await Promise.allSettled(reciprocalUsers.map((user, index) => billingTransaction(tx => attachDeveloperReferral(tx, user.id, reciprocalUsers[1 - index].developerReferralCode!))));
    assert.equal(reciprocal.filter(result => result.status === "fulfilled").length, 1, "Concurrent reciprocal attachments cannot both commit.");
    const input = { title: "Resilient referral testing", platform: "WEB_STAGING" as const, appUrl: "https://example.invalid", targetVibe: "Navigation", description: "Verify escrow and testing milestones with deterministic isolated fixtures.", totalSlots: 20, bountyPerTaskUsd: 5, instructions: [{ instructionTitle: "Navigation review", instructionDetail: "Follow navigation and report reproducible usability issues.", proofType: "TEXT_FEEDBACK" as const, minimumRep: 0 }], discoveryAllowed: false, discoveryMinRep: 0, cohortType: "STANDARD_QA" as const, hardwareStrict: true };
    const launch = async (data: CampaignInput = input) => {
      const result = await createCampaignWithEscrow(data);
      assert.ok(!("promoError" in result), "promoError" in result ? result.promoError : "");
      return result;
    };
    memberId = b.id;
    const source = await launch();
    const sourceCampaign = await db.appCampaign.findUniqueOrThrow({ where: { id: source.campaignId } });
    assert.equal(sourceCampaign.firstCohortFeeWaived, true);
    assert.equal(sourceCampaign.totalBudgetUsd, 100);
    assert.equal(sourceCampaign.platformFeeUsd, 0);
    assert.equal(await db.feeCredit.count({ where: { userId: a.id } }), 0);
    const testers: User[] = [];
    for (let index = 0; index < 10; index++) {
      const tester = await createUser("TESTER");
      testers.push(tester);
      const application = await db.missionApplication.create({ data: { campaignId: source.campaignId, testerId: tester.id, note: "Isolated tester acceptance" } });
      assert.equal((await acceptApplicationWithFunding(b.id, application.id)).charged?.totalCents, 500);
      if (index < 9) assert.equal(await db.feeCredit.count({ where: { userId: a.id } }), 0, "Less than $50 actual escrow cannot qualify.");
    }
    const credit = await db.feeCredit.findUniqueOrThrow({ where: { sourceReferralId: b.id } });
    assert.equal(credit.status, "PENDING");
    assert.equal(credit.expiresAt, null);
    await billingTransaction(tx => vestCampaignReferralCredits(tx, source.campaignId));
    assert.equal((await db.feeCredit.findUniqueOrThrow({ where: { id: credit.id } })).status, "PENDING", "Accepted holds are not genuine starts.");
    for (let index = 0; index < testers.length; index++) {
      memberId = testers[index].id;
      await claimTaskSlot(source.campaignId);
      assert.equal((await db.feeCredit.findUniqueOrThrow({ where: { id: credit.id } })).status, index < 9 ? "PENDING" : "VESTED");
    }
    const vested = await db.feeCredit.findUniqueOrThrow({ where: { id: credit.id } });
    assert.equal(vested.expiresAt!.getTime() - vested.vestedAt!.getTime(), 90 * 86400000);
    memberId = b.id;
    const subsequent = await launch();
    assert.equal((await db.appCampaign.findUniqueOrThrow({ where: { id: subsequent.campaignId } })).firstCohortFeeWaived, false, "Prior funded cohort never re-earns the first waiver.");
    // A distinct $5 cohort, even if fully paid, cannot mint a new inviter credit.
    const dustDeveloper = await createUser();
    await billingTransaction(tx => attachDeveloperReferral(tx, dustDeveloper.id, a.developerReferralCode!));
    memberId = dustDeveloper.id;
    const dust = await launch({ ...input, totalSlots: 5, bountyPerTaskUsd: 1 });
    const dustTester = await createUser("TESTER");
    const dustApplication = await db.missionApplication.create({ data: { campaignId: dust.campaignId, testerId: dustTester.id, note: "Dust fixture" } });
    await acceptApplicationWithFunding(dustDeveloper.id, dustApplication.id);
    await billingTransaction(tx => queueReferralCredit(tx, dust.campaignId));
    assert.equal(await db.feeCredit.count({ where: { sourceReferralId: dustDeveloper.id } }), 0);
    // Seed an older funded cohort and another earned credit to exercise redemption
    // independently of the first-cohort benefit.
    await db.walletTransaction.create({ data: { userId: a.id, amountCents: 10000, platformFeeCents: 0, type: "ESCROW_DEPOSIT", status: "COMPLETED", description: "Older paid cohort fixture" } });
    const extraSource = await createUser();
    const extra = await db.feeCredit.create({ data: { userId: a.id, sourceReferralId: extraSource.id, qualifyingDropId: source.campaignId, status: "VESTED", vestedAt: new Date(), expiresAt: new Date(Date.now() + 90 * 86400000) } });
    const thirdSource = await createUser();
    const third = await db.feeCredit.create({ data: { userId: a.id, sourceReferralId: thirdSource.id, qualifyingDropId: source.campaignId, status: "VESTED", vestedAt: new Date(), expiresAt: new Date(Date.now() + 90 * 86400000) } });
    memberId = a.id;
    const launches = await Promise.all([launch(), launch()]);
    const launchRows = await db.appCampaign.findMany({ where: { id: { in: launches.map(item => item.campaignId) } } });
    assert.deepEqual(launchRows.map(item => item.referralDiscountPercent).sort((x, y) => x - y), [50, 75], "Concurrent tabs cannot reuse the same vouchers.");
    const discounted = launchRows.find(item => item.referralDiscountPercent === 75)!;
    assert.equal(discounted.platformFeeUsd, 5);
    const consumerTester = await createUser("TESTER");
    const consumerApplication = await db.missionApplication.create({ data: { campaignId: discounted.id, testerId: consumerTester.id, note: "Redemption fixture" } });
    assert.equal((await acceptApplicationWithFunding(a.id, consumerApplication.id)).charged?.platformFeeCents, 375);
    const redeemed = await db.feeCredit.findMany({ where: { redeemedDropId: discounted.id } });
    assert.equal(redeemed.length, 2);
    assert.equal(redeemed.reduce((sum, item) => sum + item.redeemedDiscountCents, 0), 1125);
    const before = await db.user.update({ where: { id: a.id }, data: { fundingBalanceCents: 500 } });
    await Promise.all([billingTransaction(tx => revokeCampaignReferralCredits(tx, source.campaignId, "Mock source refund")), billingTransaction(tx => revokeCampaignReferralCredits(tx, source.campaignId, "Mock replay refund"))]);
    const after = await db.user.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(before.fundingBalanceCents - after.fundingBalanceCents, 1125);
    assert.equal(after.fundingBalanceCents, -625, "Already redeemed savings become explicit funding debt, never tester deductions.");
    assert.equal(await db.referralAudit.count({ where: { userId: a.id } }), 2);
    assert.equal((await db.feeCredit.findUniqueOrThrow({ where: { id: extra.id } })).status, "REVOKED");
    assert.equal((await db.feeCredit.findUniqueOrThrow({ where: { id: third.id } })).status, "REVOKED");
    await billingTransaction(tx => recordCampaignFeeBenefits(tx, discounted.id));
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: a.id } })).fundingBalanceCents, after.fundingBalanceCents, "Replaying benefit accounting does not duplicate debt.");
    const lateConsumer = launchRows.find(item => item.referralDiscountPercent === 50)!;
    const lateTester = await createUser("TESTER");
    const lateApplication = await db.missionApplication.create({ data: { campaignId: lateConsumer.id, testerId: lateTester.id, note: "Late revoked reservation fixture" } });
    const repaid = await db.user.update({ where: { id: a.id }, data: { fundingBalanceCents: 100000 } });
    const lateDebit = await acceptApplicationWithFunding(a.id, lateApplication.id);
    assert.equal(lateDebit.charged?.totalCents, 1250);
    assert.equal(repaid.fundingBalanceCents - (await db.user.findUniqueOrThrow({ where: { id: a.id } })).fundingBalanceCents, 2000, "Funding a pre-existing revoked reservation also recovers its $7.50 savings.");
    assert.equal(await db.referralAudit.count({ where: { userId: a.id } }), 3);
    const owner = await createUser();
    const thief = await createUser();
    const token = randomUUID().replaceAll("-", "").slice(0, 8);
    await billingTransaction(tx => assertTestFlightOwner(tx, owner.id, `https://testflight.apple.com/join/${token}`, undefined, true));
    await assert.rejects(billingTransaction(tx => assertTestFlightOwner(tx, thief.id, `https://TESTFLIGHT.APPLE.COM/join/${token}/?ref=new`)), /original developer/);
    assert.equal(await billingTransaction(tx => assertTestFlightOwner(tx, owner.id, `https://testflight.apple.com/join/${token}#again`, undefined, true)), `https://testflight.apple.com/join/${token}`);
    memberId = thief.id;
    const spoofed = await createCampaignWithEscrow({ ...input, platform: "WEB_STAGING", appUrl: `https://testflight.apple.com/join/${token}` });
    assert.ok("promoError" in spoofed);
    assert.match(spoofed.promoError, /original developer/);
    assert.equal(await db.appCampaign.count({ where: { developerId: thief.id } }), 0, "Ownership denial rolls back the cohort and fee reservations.");
    const firstTabOwner = await createUser();
    memberId = firstTabOwner.id;
    const firstTabs = await Promise.all([launch(), launch()]);
    assert.equal(await db.appCampaign.count({ where: { id: { in: firstTabs.map(item => item.campaignId) }, firstCohortFeeWaived: true } }), 1);
    const waived = await db.appCampaign.findFirstOrThrow({ where: { developerId: firstTabOwner.id, firstCohortFeeWaived: true } });
    await billingTransaction(tx => releaseUnfundedFeeBenefits(tx, waived.id));
    assert.equal(await db.firstCohortBenefit.count({ where: { userId: firstTabOwner.id } }), 0, "A definitely unfunded attempt can release its reservation.");
    const stale = await createCampaignWithEscrow(input, undefined, { expectedPlatformFeeCents: 123 });
    assert.ok("promoError" in stale);
    assert.match(stale.promoError, /no payment was created/);
    assert.equal(await db.appCampaign.count({ where: { developerId: firstTabOwner.id } }), 2, "A stale tab's quote cannot create another cohort.");
    const abandonedOwner = await createUser();
    memberId = abandonedOwner.id;
    const abandoned = await launch({ ...input, cohortType: "GOOGLE_PLAY_14_DAY" });
    const abandonedSession = [...sessions.values()].at(-1)!;
    abandonedSession.status = "expired";
    abandonedSession.payment_status = "unpaid";
    assert.equal((await db.appCampaign.findUniqueOrThrow({ where: { id: abandoned.campaignId } })).fundingCheckoutSessionId, abandonedSession.id);
    await handleStripeWebhook({ type: "checkout.session.expired", data: { object: { id: abandonedSession.id } } });
    await handleStripeWebhook({ type: "checkout.session.expired", data: { object: { id: abandonedSession.id } } });
    assert.equal((await db.appCampaign.findUniqueOrThrow({ where: { id: abandoned.campaignId } })).status, "DRAFT");
    assert.equal(await db.firstCohortBenefit.count({ where: { userId: abandonedOwner.id } }), 0, "Confirmed abandoned checkouts release the first-cohort benefit.");
    const retry = await launch({ ...input, cohortType: "GOOGLE_PLAY_14_DAY" });
    assert.equal((await db.appCampaign.findUniqueOrThrow({ where: { id: retry.campaignId } })).firstCohortFeeWaived, true);
    const bundleOwner = await createUser();
    memberId = bundleOwner.id;
    const bundle = await launch({ ...input, cohortType: "GOOGLE_PLAY_14_DAY" });
    assert.deepEqual(lastLines, [8000], "First bundle isolates tester rewards and omits the waived fee.");
    const session = [...sessions.values()].at(-1)!;
    await handleStripeWebhook({ type: "checkout.session.completed", data: { object: { id: session.id } } });
    await handleStripeWebhook({ type: "checkout.session.completed", data: { object: { id: session.id } } });
    assert.ok((await db.firstCohortBenefit.findUniqueOrThrow({ where: { userId: bundleOwner.id } })).fundedAt);
    assert.equal((await db.appCampaign.findUniqueOrThrow({ where: { id: bundle.campaignId } })).status, "ACTIVE");
    await billingTransaction(tx => releaseUnfundedFeeBenefits(tx, bundle.campaignId));
    assert.equal(await db.firstCohortBenefit.count({ where: { userId: bundleOwner.id } }), 1, "Refunds cannot reset a consumed first benefit.");
    const promoOwner = await createUser();
    await db.walletTransaction.create({ data: { userId: promoOwner.id, amountCents: 100, type: "ESCROW_DEPOSIT", status: "COMPLETED", description: "Prior funding" } });
    const consumer = await db.appCampaign.create({ data: { developerId: promoOwner.id, title: "No credits fixture", platform: "WEB_STAGING", appUrl: "https://example.invalid", targetVibe: "QA", description: "No credits fixture", totalBudgetUsd: 120, platformFeeUsd: 20, bountyPerTaskUsd: 5, totalSlots: 20, status: "DRAFT", expiresAt: new Date(Date.now() + 86400000) } });
    const normal = await billingTransaction(tx => reserveAutomaticFeeBenefits(tx, promoOwner.id, consumer.id, false, 0));
    assert.equal(normal.effectiveDiscountPercent, 0);
    const expiredSource = await createUser();
    await db.feeCredit.create({ data: { userId: promoOwner.id, sourceReferralId: expiredSource.id, qualifyingDropId: source.campaignId, status: "VESTED", vestedAt: new Date(0), expiresAt: new Date(1) } });
    const expiredQuote = await billingTransaction(tx => reserveAutomaticFeeBenefits(tx, promoOwner.id, consumer.id, false, 0));
    assert.equal(expiredQuote.effectiveDiscountPercent, 0, "Expired vouchers cannot be reserved.");
  } finally {
    await db.testFlightBuild.deleteMany({ where: { developerId: { in: ids } } });
    await db.firstCohortBenefit.deleteMany({ where: { userId: { in: ids } } });
    await db.feeCredit.deleteMany({ where: { userId: { in: ids } } });
    await db.referralAudit.deleteMany({ where: { userId: { in: ids } } });
    await db.billingOperation.deleteMany({ where: { userId: { in: ids } } });
    await db.cohortPromoRedemption.deleteMany({ where: { developerId: { in: ids } } });
    await db.developerReferral.deleteMany({ where: { developerId: { in: ids } } });
    const remaining = new Set(ids);
    while (remaining.size) {
      const users = await db.user.findMany({ where: { id: { in: [...remaining] } }, select: { id: true, referredById: true } });
      const parents = new Set(users.map(user => user.referredById));
      const leaves = users.filter(user => !parents.has(user.id)).map(user => user.id);
      assert.ok(leaves.length, "Fixture cleanup found a circular graph.");
      await db.user.deleteMany({ where: { id: { in: leaves } } });
      leaves.forEach(id => remaining.delete(id));
    }
    await db.$disconnect();
    modules.reverse().forEach(module => module.restore());
    if (oldStripe === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = oldStripe;
    if (oldTax === undefined) delete process.env.SEEDENV_STRIPE_TAX_ENABLED; else process.env.SEEDENV_STRIPE_TAX_ENABLED = oldTax;
  }
});
