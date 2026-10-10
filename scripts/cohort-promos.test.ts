import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type User } from "@prisma/client";
import Stripe from "stripe";
import { discountedPlatformFeeCents, projectPerTesterCharges, quoteCampaignFunding, quoteClipperFunding, quoteSlotCharge, quoteTopUp } from "../lib/pricing";

test("promo pricing discounts only platform fees, including the cumulative minimum", () => {
  assert.equal(quoteSlotCharge(400, 0, 0, false, 50).totalCents, 1150);
  assert.equal(quoteSlotCharge(400, 400, 750, false, 50).platformFeeCents, 0);
  assert.equal(quoteSlotCharge(400, 8000, 800, false, 50).platformFeeCents, 40);
  assert.equal(discountedPlatformFeeCents(11900, 33), 7973);
  for (const percent of [0, 1, 33, 50, 100]) {
    const projection = projectPerTesterCharges(25, 401, false, percent);
    const campaign = quoteCampaignFunding(100.25, "STANDARD_QA", false, percent);
    assert.equal(projection.stipendCents, 10025);
    assert.equal(projection.maxTotalCents, campaign.escrowTotalCents);
    assert.equal(quoteCampaignFunding(999, "GOOGLE_PLAY_14_DAY", false, percent).payoutPoolUsd, 80);
    assert.equal(quoteCampaignFunding(999, "LIVE_STRESS_DROP", false, percent).payoutPoolUsd, 175);
  }
  assert.equal(quoteCampaignFunding(0, "GOOGLE_PLAY_14_DAY", false, 50).escrowTotalCents, 8800);
  assert.equal(quoteCampaignFunding(0, "LIVE_STRESS_DROP", false, 100).escrowTotalCents, 17500);
  assert.equal(quoteCampaignFunding(100, "STANDARD_QA", true, 50).platformFeeUsd, 0);
  assert.equal(quoteCampaignFunding(0, "GOOGLE_PLAY_14_DAY").escrowTotalCents, 9600);
  assert.equal(quoteClipperFunding(50), 5250);
  assert.equal(quoteTopUp(5000).totalCents, 5000);
  for (const value of [-1, 101, 0.5, NaN]) assert.throws(() => discountedPlatformFeeCents(1500, value));
});

test("promo launch, paid consumption, retries, access and concurrent caps (isolated PostgreSQL)", {
  skip: process.env.RUN_COHORT_PROMO_DB_TESTS !== "1",
}, async () => {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(url.hostname.startsWith("dpg-db4khrcs728c73flrip0-a") && url.pathname === "/seedenv_staging_db", "Only the isolated sandbox database is allowed.");
  const db = new PrismaClient();
  const marker = `PROMO${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
  const ids: string[] = [];
  let userSequence = 0;
  const codeIds: string[] = [];
  let member: User;
  const sessions = new Map<string, {
    id: string; url: string; mode: string; status: string; payment_status: string;
    currency: string; amount_total: number; payment_intent: string; customer: string;
    metadata: Record<string, string>;
  }>();
  const refunds = new Map<string, { id: string; payment_intent: string; amount: number; metadata: Record<string, string>; currency: string; status: string }>();
  let failCheckout: false | "invalid" | "unknown" = false;
  const stripe = {
    customers: { retrieve: async () => ({ deleted: false, invoice_settings: { default_payment_method: "pm_mock" } }) },
    paymentIntents: { retrieve: async () => ({ latest_charge: null }) },
    refunds: {
      list: ({ payment_intent }: { payment_intent: string }) => [...refunds.values()].filter((refund) => refund.payment_intent === payment_intent),
      retrieve: async (id: string) => { const refund = refunds.get(id); assert.ok(refund); return refund; },
      create: async (input: { payment_intent: string; amount: number; metadata: Record<string, string> }) => {
        const refund = { ...input, id: `re_mock_${marker}_${refunds.size}`, currency: "usd", status: "succeeded" };
        refunds.set(refund.id, refund);
        return refund;
      },
    },
    checkout: { sessions: {
      create: async (input: { mode: string; customer: string; metadata: Record<string, string>; line_items: Array<{ price_data: { unit_amount: number } }> }) => {
        if (failCheckout === "invalid") {
          throw new Stripe.errors.StripeInvalidRequestError({ message: "Mock invalid checkout request.", type: "invalid_request_error" });
        }
        const id = `cs_mock_${sessions.size}`;
        const session = { id, url: `https://checkout.stripe.com/mock/${id}`, mode: input.mode, status: "open", payment_status: "unpaid", currency: "usd", amount_total: input.line_items.reduce((sum, item) => sum + item.price_data.unit_amount, 0), payment_intent: `pi_${id}`, customer: input.customer, metadata: input.metadata };
        sessions.set(id, session);
        if (failCheckout === "unknown") throw new Error("Mock connection lost after Stripe created Checkout.");
        return session;
      },
      retrieve: async (id: string) => {
        const session = sessions.get(id);
        assert.ok(session, "Only mock Checkout sessions may be retrieved.");
        return session;
      },
      expire: async (id: string) => {
        const session = sessions.get(id);
        assert.ok(session);
        assert.equal(session.status, "open");
        session.status = "expired";
        return session;
      },
    } },
  };
  const mocks = [
    mock.module("../lib/prisma.ts", { namedExports: { prisma: db } }),
    mock.module("../lib/member.ts", { namedExports: { requireMember: async (role?: string) => {
      if (role && member.role !== role && member.role !== "ADMIN") throw new Error("Wrong workspace.");
      return member;
    } } }),
    mock.module("../lib/auth.ts", { namedExports: { getCurrentUser: async () => member } }),
    mock.module("../lib/stripe.ts", { namedExports: { getStripe: () => stripe } }),
    mock.module("../lib/notifications.ts", { namedExports: { notificationEnabled: () => false, sendNotificationEmail: async () => assert.fail("No emails may be sent.") } }),
    mock.module("next/cache", { namedExports: { revalidatePath: () => {} } }),
  ];
  const previousKey = process.env.STRIPE_SECRET_KEY;
  const previousTax = process.env.SEEDENV_STRIPE_TAX_ENABLED;
  process.env.STRIPE_SECRET_KEY = "sk_test_mock_no_network";
  process.env.SEEDENV_STRIPE_TAX_ENABLED = "0";
  try {
    const { promoCodeSchema, promoSettingsSchema, canManageCohortPromos, eligibleCohortPromo, reserveCohortPromo, consumeCohortPromo } = await import("../lib/cohort-promos");
    const { billingTransaction } = await import("../lib/billing-transaction");
    const { createCohortPromo, previewCohortPromo, setCohortPromoEnabled } = await import("../app/actions/cohortPromoActions");
    const { createCampaignWithEscrow } = await import("../app/actions/campaignActions");
    const { handleStripeWebhook } = await import("../lib/campaign-payments");
    const { acceptApplicationWithFunding, cancelCohort, reconcileCampaignFunding } = await import("../lib/slot-funding");
    const { attachDeveloperReferral, createReferralCredit } = await import("../lib/developer-referrals");
    const { rejectProof, confirmProofDenial, assertProofEditable, requestProofRevision } = await import("../lib/submission-lifecycle");
    const { approvePendingSubmission } = await import("../lib/submission-approval");
    const { isAutoApprovalDue } = await import("../lib/auto-approval-window");
    const { resolveProofDenial } = await import("../app/actions/proofReviewActions");
    const validPreview = async (rawCode: string, draftId?: string) => {
      const result = await previewCohortPromo(rawCode, draftId);
      assert.ok(result.ok, result.ok ? "" : result.error);
      return result;
    };
    const previewError = async (pattern: RegExp) => {
      const result = await previewCohortPromo(marker);
      assert.ok(!result.ok);
      assert.match(result.error, pattern);
    };
    const launchError = async (pattern: RegExp) => {
      const result = await createCampaignWithEscrow(input);
      assert.ok("promoError" in result);
      assert.match(result.promoError, pattern);
    };
    const successfulLaunch = async (data: Parameters<typeof createCampaignWithEscrow>[0], draftId?: string) => {
      const result = await createCampaignWithEscrow(data, draftId);
      assert.ok(!("promoError" in result));
      return result;
    };
    assert.equal(promoCodeSchema.parse(" build50 "), "BUILD50");
    assert.equal(canManageCohortPromos({ id: "stranger", role: "DEVELOPER" }), false);
    assert.equal(canManageCohortPromos({ id: "cmtuw6sak0000fk5lkk0ceot9", role: "DEVELOPER" }), true);
    assert.throws(() => promoSettingsSchema.parse({ code: "OK50", discountPercent: 50, maxRedemptions: 1, expiresAt: new Date(0) }));
    const createUser = async (role: "DEVELOPER" | "TESTER" | "ADMIN", balance = 10000, previouslyFunded = true) => {
      const sequence = userSequence++;
      const user = await db.user.create({ data: { email: `${marker}-${sequence}@example.invalid`, role, emailVerified: new Date(), fundingBalanceCents: balance, stripeCustomerId: `cus_mock_${sequence}` } });
      ids.push(user.id);
      if (role === "DEVELOPER" && previouslyFunded) await db.walletTransaction.create({ data: { userId: user.id, type: "ESCROW_DEPOSIT", status: "COMPLETED", amountCents: 100, description: "Prior funded legacy promotion fixture" } });
      return user;
    };
    const developer = await createUser("DEVELOPER");
    member = developer;
    const settings = { code: marker, discountPercent: 50, maxRedemptions: 10, expiresAt: new Date(Date.now() + 86400000).toISOString() };
    await assert.rejects(createCohortPromo(settings), /Only SeedEnv/);
    await assert.rejects(setCohortPromoEnabled("missing", true), /Only SeedEnv/);
    member = await createUser("ADMIN");
    assert.ok((await createCohortPromo(settings)).ok);
    const code = await db.cohortPromoCode.findUniqueOrThrow({ where: { code: marker } });
    codeIds.push(code.id);
    member = developer;
    assert.equal((await validPreview(` ${marker.toLowerCase()} `)).discountPercent, 50);
    const malformed = await previewCohortPromo("!");
    assert.ok(!malformed.ok);
    assert.match(malformed.error, /3-40/);
    assert.equal(await db.cohortPromoRedemption.count({ where: { promoCodeId: code.id } }), 0, "Preview never redeems.");
    const input = {
      title: "Promo integration cohort", platform: "WEB_STAGING" as const, appUrl: "https://example.invalid",
      targetVibe: "Test", description: "A test cohort with actionable mobile app feedback.",
      totalSlots: 25, bountyPerTaskUsd: 4, instructions: [{ instructionTitle: "Test navigation", instructionDetail: "Explore navigation and report reproducible failures.", proofType: "TEXT_FEEDBACK" as const, minimumRep: 0 }],
      discoveryAllowed: false, discoveryMinRep: 0, cohortType: "STANDARD_QA" as const, hardwareStrict: true, promoCode: marker,
    };
    const first = await successfulLaunch(input);
    assert.ok(first.launched);
    const saved = await db.appCampaign.findUniqueOrThrow({ where: { id: first.campaignId } });
    assert.equal(saved.platformFeeDiscountPercent, 50);
    assert.equal(saved.platformFeeUsd, 10);
    assert.equal(saved.totalBudgetUsd, 110);
    assert.equal(saved.bountyPerTaskUsd, 4);
    assert.equal((await db.cohortPromoRedemption.findFirstOrThrow({ where: { campaignId: saved.id } })).consumedAt, null);
    const second = await successfulLaunch(input);
    assert.equal((await db.appCampaign.findUniqueOrThrow({ where: { id: first.campaignId } })).status, "DRAFT");
    assert.equal((await db.appCampaign.findUniqueOrThrow({ where: { id: first.campaignId } })).platformFeeDiscountPercent, 0);
    assert.equal((await db.cohortPromoCode.findUniqueOrThrow({ where: { id: code.id } })).reservedCount, 1);
    const tester = await createUser("TESTER");
    const application = await db.missionApplication.create({ data: { campaignId: second.campaignId, testerId: tester.id, note: "Mock application." } });
    const accepted = await acceptApplicationWithFunding(developer.id, application.id);
    assert.equal(accepted.charged?.stipendCents, 400);
    assert.equal(accepted.charged?.platformFeeCents, 750);
    assert.ok((await db.cohortPromoRedemption.findFirstOrThrow({ where: { campaignId: second.campaignId } })).consumedAt);
    await previewError(/already used/);
    await launchError(/already used/);

    const unpaidDeveloper = await createUser("DEVELOPER", 0);
    member = unpaidDeveloper;
    const unpaid = await successfulLaunch(input);
    assert.ok(unpaid.checkoutUrl);
    const retry = await successfulLaunch(input);
    assert.equal(sessions.get("cs_mock_0")?.status, "expired", "Moving closes unpaid Checkout.");
    assert.equal((await db.appCampaign.findUniqueOrThrow({ where: { id: unpaid.campaignId } })).status, "DRAFT");
    const paidTopUp = sessions.get("cs_mock_1")!;
    paidTopUp.status = "complete"; paidTopUp.payment_status = "paid";
    await handleStripeWebhook({ type: "checkout.session.completed", data: { object: { id: paidTopUp.id } } });
    assert.ok((await db.cohortPromoRedemption.findFirstOrThrow({ where: { campaignId: retry.campaignId } })).consumedAt);
    await launchError(/already used/);

    const bundleDeveloper = await createUser("DEVELOPER");
    member = bundleDeveloper;
    const bundle = await successfulLaunch({ ...input, cohortType: "GOOGLE_PLAY_14_DAY" });
    assert.equal(bundle.escrowTotalCents, 8800);
    const bundleSession = [...sessions.values()].at(-1)!;
    bundleSession.status = "complete"; bundleSession.payment_status = "paid";
    await handleStripeWebhook({ type: "checkout.session.completed", data: { object: { id: bundleSession.id } } });
    await handleStripeWebhook({ type: "checkout.session.completed", data: { object: { id: bundleSession.id } } });
    assert.ok((await db.cohortPromoRedemption.findFirstOrThrow({ where: { campaignId: bundle.campaignId } })).consumedAt);
    const receipt = await db.walletTransaction.findFirstOrThrow({ where: { campaignId: bundle.campaignId, status: "COMPLETED" } });
    assert.equal(receipt.platformFeeCents, 800);
    assert.equal(receipt.amountCents, 8800);

    member = await createUser("DEVELOPER");
    failCheckout = "invalid";
    await assert.rejects(createCampaignWithEscrow({ ...input, cohortType: "GOOGLE_PLAY_14_DAY" }), /Mock invalid/);
    const failed = await db.appCampaign.findFirstOrThrow({ where: { developerId: member.id }, include: { promoRedemptions: true } });
    assert.equal(failed.promoRedemptions[0]?.consumedAt, null);
    assert.equal(failed.promoRedemptions[0]?.paymentPending, false);
    failCheckout = false;
    const moved = await successfulLaunch({ ...input, cohortType: "GOOGLE_PLAY_14_DAY" });
    const movedSession = [...sessions.values()].at(-1)!;
    movedSession.status = "expired";
    // Retry the same campaign: the failed/expired deposit must not poison its new receipt.
    await db.appCampaign.update({ where: { id: moved.campaignId }, data: { status: "DRAFT" } });
    const resumed = await successfulLaunch({ ...input, cohortType: "GOOGLE_PLAY_14_DAY" }, moved.campaignId);
    const resumedSession = [...sessions.values()].at(-1)!;
    resumedSession.status = "complete"; resumedSession.payment_status = "paid";
    await handleStripeWebhook({ type: "checkout.session.completed", data: { object: { id: resumedSession.id } } });
    assert.equal(resumed.campaignId, moved.campaignId);

    member = await createUser("DEVELOPER");
    failCheckout = "unknown";
    const unknownLog = mock.method(console, "error", () => {});
    try {
      const result = await createCampaignWithEscrow({ ...input, cohortType: "GOOGLE_PLAY_14_DAY" });
      assert.ok("promoError" in result);
      assert.match(result.promoError, /could not be confirmed/);
    } finally {
      unknownLog.mock.restore();
    }
    failCheckout = false;
    await launchError(/still being prepared/);
    const lateSession = [...sessions.values()].at(-1)!;
    lateSession.status = "complete"; lateSession.payment_status = "paid";
    await handleStripeWebhook({ type: "checkout.session.completed", data: { object: { id: lateSession.id } } });
    const lateCampaignId = lateSession.metadata.campaignId;
    assert.ok((await db.cohortPromoRedemption.findFirstOrThrow({ where: { campaignId: lateCampaignId } })).consumedAt);
    await launchError(/already used/);

    member = await createUser("DEVELOPER");
    delete process.env.STRIPE_SECRET_KEY;
    const setupDraft = await successfulLaunch(input);
    assert.ok(setupDraft.requiresPaymentSetup);
    assert.equal((await db.appCampaign.findUniqueOrThrow({ where: { id: setupDraft.campaignId } })).promoCodeDraft, marker);
    assert.equal(await db.cohortPromoRedemption.count({ where: { developerId: member.id } }), 0, "Payment setup alone cannot reserve a code.");
    process.env.STRIPE_SECRET_KEY = "sk_test_mock_no_network";
    const reservedDraft = await successfulLaunch(input, setupDraft.campaignId);
    await db.appCampaign.update({ where: { id: reservedDraft.campaignId }, data: { status: "DRAFT" } });
    await db.cohortPromoCode.update({ where: { id: code.id }, data: { enabled: false, expiresAt: new Date(0) } });
    assert.equal((await validPreview(marker, reservedDraft.campaignId)).discountPercent, 50);
    await launchError(/expired/);
    const kept = await successfulLaunch(input, reservedDraft.campaignId);
    assert.equal((await db.appCampaign.findUniqueOrThrow({ where: { id: kept.campaignId } })).platformFeeDiscountPercent, 50);
    await db.cohortPromoCode.update({ where: { id: code.id }, data: { enabled: true, expiresAt: new Date(Date.now() + 86400000) } });
    member = await db.user.update({ where: { id: member.id }, data: { platformFeeWaived: true } });
    await previewError(/permanent full fee waiver/);
    await launchError(/full fee waiver/);

    const cap = await db.cohortPromoCode.create({ data: { code: `${marker}CAP`, discountPercent: 100, maxRedemptions: 1, expiresAt: new Date(Date.now() + 86400000) } });
    codeIds.push(cap.id);
    const contenders = await Promise.all([createUser("DEVELOPER"), createUser("DEVELOPER")]);
    const results = await Promise.allSettled(contenders.map((user) => billingTransaction(async (tx) => {
      const campaign = await tx.appCampaign.create({ data: {
        developerId: user.id, title: "Concurrent promo cap test", platform: "WEB_STAGING",
        appUrl: "https://example.invalid", targetVibe: "Test", description: "Concurrent cap test.",
        totalBudgetUsd: 20, bountyPerTaskUsd: 4, platformFeeUsd: 0, totalSlots: 5,
        expiresAt: new Date(Date.now() + 86400000),
      } });
      await reserveCohortPromo(tx, user.id, campaign.id, cap.code);
    })));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(await db.appCampaign.count({ where: { developerId: { in: contenders.map((user) => user.id) } } }), 1, "A rejected reservation rolls back its campaign.");
    assert.equal((await db.cohortPromoCode.findUniqueOrThrow({ where: { id: cap.id } })).reservedCount, 1);
    const holder = await db.cohortPromoRedemption.findFirstOrThrow({ where: { promoCodeId: cap.id } });
    await billingTransaction((tx) => consumeCohortPromo(tx, holder.campaignId));
    await assert.rejects(billingTransaction((tx) => eligibleCohortPromo(tx, holder.developerId, cap.code)), /already used/);
    member = contenders[0];
    await db.cohortPromoCode.update({ where: { id: code.id }, data: { enabled: false } });
    await previewError(/disabled/);
    await db.cohortPromoCode.update({ where: { id: code.id }, data: { enabled: true, expiresAt: new Date(0) } });
    await previewError(/expired/);
    await db.cohortPromoCode.update({ where: { id: code.id }, data: { expiresAt: new Date(Date.now() + 86400000) } });
    const inviter = await createUser("DEVELOPER");
    await db.user.update({ where: { id: inviter.id }, data: { developerReferralCode: `${marker}DEV` } });
    await assert.rejects(billingTransaction((tx) => attachDeveloperReferral(tx, inviter.id, `${marker}DEV`)), /refer yourself/);
    const referred = await createUser("DEVELOPER", 10000, false);
    await assert.rejects(billingTransaction((tx) => attachDeveloperReferral(tx, referred.id, "invalid code")), /valid developer referral/);
    const referral = await billingTransaction((tx) => attachDeveloperReferral(tx, referred.id, `${marker}DEV`));
    await assert.rejects(billingTransaction((tx) => attachDeveloperReferral(tx, referred.id, `${marker}DEV`)), /permanently linked/);
    assert.equal(await db.cohortPromoCode.count({ where: { ownerId: referred.id } }), 0, "New signups do not mint legacy welcome codes.");
    const welcome = await billingTransaction(tx => createReferralCredit(tx, referred.id, referral.id, "WELCOME"));
    await db.walletTransaction.create({ data: { userId: referred.id, type: "ESCROW_DEPOSIT", status: "COMPLETED", amountCents: 100, description: "Historical funding for grandfathered credit fixture" } });
    assert.equal(welcome.expiresAt, null);
    assert.equal(await db.cohortPromoCode.count({ where: { ownerId: inviter.id } }), 0, "Signup does not reward the inviter.");
    member = referred;
    const stackedPreview = await validPreview(`${marker},${welcome.code}`);
    assert.equal(stackedPreview.discountPercent, 100);
    const stacked = await successfulLaunch({ ...input, promoCode: `${marker},${welcome.code}` });
    const stackedCampaign = await db.appCampaign.findUniqueOrThrow({ where: { id: stacked.campaignId } });
    assert.equal(stackedCampaign.platformFeeDiscountPercent, 100);
    assert.equal(stackedCampaign.platformFeeUsd, 0);
    assert.equal(stackedCampaign.totalBudgetUsd, 100);
    assert.equal(await db.cohortPromoCode.count({ where: { ownerId: inviter.id } }), 0, "Launching with existing balance alone is not a paid tester debit.");
    const stackedApp = await db.missionApplication.create({ data: { campaignId: stacked.campaignId, testerId: tester.id, note: "Referral test." } });
    assert.equal((await acceptApplicationWithFunding(referred.id, stackedApp.id)).charged?.totalCents, 400);
    assert.equal(await db.feeCredit.count({ where: { sourceReferralId: referred.id } }), 0, "One $4 tester debit cannot qualify a new referral.");
    const match = await billingTransaction(tx => createReferralCredit(tx, inviter.id, referral.id, "MATCH"));
    assert.equal(match.expiresAt, null);
    assert.equal(match.discountPercent, 50);
    assert.equal((await db.developerReferral.findUniqueOrThrow({ where: { id: referral.id } })).qualifiedAt, null);
    await billingTransaction((tx) => consumeCohortPromo(tx, stacked.campaignId));
    assert.equal(await db.cohortPromoCode.count({ where: { ownerId: inviter.id } }), 1, "Payment replay does not duplicate matching credits.");
    member = contenders[1];
    const stolen = await previewCohortPromo(match.code);
    assert.ok(!stolen.ok);
    const secondReferred = await createUser("DEVELOPER", 10000, false);
    const secondReferral = await billingTransaction((tx) => attachDeveloperReferral(tx, secondReferred.id, `${marker}DEV`));
    const secondWelcome = await billingTransaction(tx => createReferralCredit(tx, secondReferred.id, secondReferral.id, "WELCOME"));
    await db.walletTransaction.create({ data: { userId: secondReferred.id, type: "ESCROW_DEPOSIT", status: "COMPLETED", amountCents: 100, description: "Historical funding for second grandfathered credit fixture" } });
    member = secondReferred;
    const fundedBundle = await successfulLaunch({ ...input, cohortType: "GOOGLE_PLAY_14_DAY", promoCode: secondWelcome.code });
    const referralBundleSession = [...sessions.values()].at(-1)!;
    referralBundleSession.status = "complete"; referralBundleSession.payment_status = "paid";
    await handleStripeWebhook({ type: "checkout.session.completed", data: { object: { id: referralBundleSession.id } } });
    assert.equal((await db.feeCredit.findUniqueOrThrow({ where: { sourceReferralId: secondReferred.id } })).status, "PENDING", "Funding alone cannot vest a new referral.");
    await billingTransaction(tx => createReferralCredit(tx, inviter.id, secondReferral.id, "MATCH"));
    assert.equal(await db.cohortPromoCode.count({ where: { ownerId: inviter.id } }), 2, "Previously issued matched credits preserve grandfathered stacking.");
    assert.equal((await db.developerReferral.findUniqueOrThrow({ where: { id: secondReferral.id } })).qualifiedAt, null);
    member = inviter;
    const matchingCodes = await db.cohortPromoCode.findMany({ where: { ownerId: inviter.id } });
    assert.equal((await validPreview(matchingCodes.map((entry) => entry.code).join(","))).discountPercent, 100);
    const inviterStack = await successfulLaunch({ ...input, promoCode: matchingCodes.map((entry) => entry.code).join(",") });
    const movedStack = await successfulLaunch({ ...input, promoCode: matchingCodes.map((entry) => entry.code).reverse().join(",") });
    assert.equal(await db.cohortPromoRedemption.count({ where: { campaignId: inviterStack.campaignId } }), 0);
    assert.equal(await db.cohortPromoRedemption.count({ where: { campaignId: movedStack.campaignId } }), 2, "Both unpaid credits transfer as one stack.");
    for (const credit of matchingCodes) assert.equal((await db.cohortPromoCode.findUniqueOrThrow({ where: { id: credit.id } })).reservedCount, 1);
    const movedCredit = await successfulLaunch({ ...input, promoCode: match.code });
    assert.equal((await db.appCampaign.findUniqueOrThrow({ where: { id: inviterStack.campaignId } })).status, "DRAFT");
    assert.equal((await db.appCampaign.findUniqueOrThrow({ where: { id: inviterStack.campaignId } })).platformFeeDiscountPercent, 0);
    assert.equal(await db.cohortPromoRedemption.count({ where: { campaignId: inviterStack.campaignId } }), 0);
    assert.equal((await db.cohortPromoRedemption.findFirstOrThrow({ where: { promoCodeId: match.id } })).campaignId, movedCredit.campaignId);
    const unusedCompanion = matchingCodes.find((entry) => entry.id !== match.id)!;
    assert.equal((await db.cohortPromoCode.findUniqueOrThrow({ where: { id: unusedCompanion.id } })).reservedCount, 0);
    const fullPlusReferral = await previewCohortPromo(`${cap.code},${match.code}`);
    assert.ok(!fullPlusReferral.ok);
    assert.ok(fundedBundle.escrowTotalCents > 0);

    const proof = await db.submission.create({ data: { campaignId: stacked.campaignId, testerId: tester.id, feedbackText: "Evidence is preserved during manual denial review.", payoutCents: 400, submittedAt: new Date(Date.now() - 72 * 3600000), expiresAt: new Date(Date.now() - 3600000) } });
    const held = await billingTransaction((tx) => rejectProof(tx, referred.id, false, proof.id, "Required participation period not completed"));
    assert.ok(held.heldForReview);
    const heldRow = await db.submission.findUniqueOrThrow({ where: { id: proof.id } });
    assert.equal(heldRow.status, "PENDING");
    assert.equal(heldRow.feedbackText, proof.feedbackText);
    assert.equal(isAutoApprovalDue(heldRow, new Date()), false);
    assert.throws(() => assertProofEditable(heldRow), /held/);
    await assert.rejects(billingTransaction((tx) => requestProofRevision(tx, referred.id, false, proof.id, "Please change the original proof.")), /held/);
    await assert.rejects(billingTransaction((tx) => approvePendingSubmission(tx, proof.id, { kind: "reviewer", id: referred.id, admin: false })), /held/);
    member = referred;
    await assert.rejects(resolveProofDenial(proof.id, "deny", "The evidence does not meet the participation period."), /Only SeedEnv/);
    await db.appCampaign.update({ where: { id: stacked.campaignId }, data: { claimedSlots: 1 } });
    const beforeDenial = await db.user.findUniqueOrThrow({ where: { id: referred.id } });
    const cancelledHeld = await cancelCohort(referred.id, stacked.campaignId);
    assert.equal(cancelledHeld.inProgress, 1);
    assert.equal(cancelledHeld.refundedCents, 0, "Cancellation cannot refund the held reward.");
    assert.equal((await reconcileCampaignFunding(stacked.campaignId)).finalized, false);
    assert.equal((await db.slotCharge.findFirstOrThrow({ where: { campaignId: stacked.campaignId } })).status, "SUCCEEDED", "The paid place stays unavailable for reuse/refund during review.");
    await billingTransaction((tx) => confirmProofDenial(tx, inviter.id, proof.id, "Manual evidence check confirms the disclosed period was not completed."));
    assert.equal((await db.submission.findUniqueOrThrow({ where: { id: proof.id } })).status, "REJECTED");
    assert.equal((await db.appCampaign.findUniqueOrThrow({ where: { id: stacked.campaignId } })).claimedSlots, 0);
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: referred.id } })).fundingBalanceCents, beforeDenial.fundingBalanceCents, "Denial does not create a payout or change balances.");
    await assert.rejects(billingTransaction((tx) => confirmProofDenial(tx, inviter.id, proof.id, "Cannot resolve this case twice.")), /held denial/);
    const approvedProof = await db.submission.create({ data: { campaignId: fundedBundle.campaignId, testerId: tester.id, feedbackText: "Complete evidence supplied by tester.", payoutCents: 400, submittedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) } });
    await db.appCampaign.update({ where: { id: fundedBundle.campaignId }, data: { claimedSlots: 1 } });
    await billingTransaction((tx) => rejectProof(tx, secondReferred.id, false, approvedProof.id, "Low Effort"));
    const prepaidHeld = await cancelCohort(secondReferred.id, fundedBundle.campaignId);
    assert.equal(prepaidHeld.refundedCents, 7600, "A bundle returns only unused rewards, excluding the one held reward and earned fee.");
    assert.equal((await reconcileCampaignFunding(fundedBundle.campaignId)).finalized, false);
    member = await createUser("ADMIN");
    delete process.env.STRIPE_SECRET_KEY;
    const resolutions = await Promise.all([
      resolveProofDenial(approvedProof.id, "approve", "Original instructions and evidence meet the published standards."),
      resolveProofDenial(approvedProof.id, "approve", "A duplicate approval must not release this reward twice."),
    ]);
    assert.equal(resolutions.filter((result) => result.ok).length, 1);
    process.env.STRIPE_SECRET_KEY = "sk_test_mock_no_network";
    const resolvedProof = await db.submission.findUniqueOrThrow({ where: { id: approvedProof.id } });
    const approvedRewards = await db.walletTransaction.findMany({ where: { campaignId: fundedBundle.campaignId, userId: tester.id, type: "BOUNTY_PAYOUT" } });
    assert.equal(resolvedProof.status, "APPROVED");
    assert.equal(approvedRewards.length, 1);
    assert.equal(approvedRewards[0].amountCents, 400);
    assert.equal(approvedRewards[0].status, "PENDING", "No money is sent without configured Stripe.");
    assert.equal((await resolveProofDenial(approvedProof.id, "deny", "A later denial must not override the recorded approval.")).ok, false);
  } finally {
    await db.$transaction(async (tx) => {
      await tx.billingOperation.deleteMany({ where: { userId: { in: ids } } });
      await tx.feeCredit.deleteMany({ where: { userId: { in: ids } } });
      await tx.firstCohortBenefit.deleteMany({ where: { userId: { in: ids } } });
      await tx.testFlightBuild.deleteMany({ where: { developerId: { in: ids } } });
      await tx.referralAudit.deleteMany({ where: { userId: { in: ids } } });
      await tx.cohortPromoRedemption.deleteMany({ where: { developerId: { in: ids } } });
      await tx.developerReferral.deleteMany({ where: { developerId: { in: ids } } });
      await tx.cohortPromoCode.deleteMany({ where: { OR: [{ id: { in: codeIds } }, { ownerId: { in: ids } }] } });
      await tx.user.deleteMany({ where: { id: { in: ids }, referredById: { not: null } } });
      await tx.user.deleteMany({ where: { id: { in: ids } } });
    });
    await db.$disconnect();
    for (const item of mocks.reverse()) item.restore();
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = previousKey;
    if (previousTax === undefined) delete process.env.SEEDENV_STRIPE_TAX_ENABLED; else process.env.SEEDENV_STRIPE_TAX_ENABLED = previousTax;
  }
});
