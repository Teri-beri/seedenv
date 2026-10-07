import "dotenv/config";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { assertProofEditable, startProofRevision } from "../lib/submission-lifecycle";
import nextConfig from "../next.config";
import { calculateCohortEscrow, COHORT_BUNDLES, COHORT_PLATFORM_FEE_RATE, quoteCampaignFunding } from "../lib/pricing";

test("campaign funding adds a 20% fee with a $15 floor and cent rounding", () => {
  assert.equal(COHORT_PLATFORM_FEE_RATE, 0.2);
  assert.deepEqual(quoteCampaignFunding(100), { payoutPoolUsd: 100, platformFeeUsd: 20, totalBudgetUsd: 120, escrowTotalCents: 12000 });
  assert.deepEqual(quoteCampaignFunding(20), { payoutPoolUsd: 20, platformFeeUsd: 15, totalBudgetUsd: 35, escrowTotalCents: 3500 });
  assert.equal(quoteCampaignFunding(75).platformFeeUsd, 15);
  assert.equal(quoteCampaignFunding(87.53).platformFeeUsd, 17.51);
  for (const amount of [-1, NaN, Infinity]) assert.throws(() => quoteCampaignFunding(amount));
});

test("flat bundles ignore custom pools and reconcile to their advertised totals", () => {
  for (const bundle of Object.values(COHORT_BUNDLES)) {
    const quote = quoteCampaignFunding(9999, bundle.type);
    assert.equal(quote.escrowTotalCents, bundle.totalCents);
    assert.equal(bundle.slots * bundle.bountyCents + bundle.platformFeeCents, bundle.totalCents);
  }
  assert.equal(COHORT_BUNDLES.GOOGLE_PLAY_14_DAY.totalCents, 19900);
  assert.equal(COHORT_BUNDLES.LIVE_STRESS_DROP.totalCents, 34900);
  const gp = calculateCohortEscrow(0, 0, "GOOGLE_PLAY_14_DAY");
  assert.deepEqual(gp, { validatorPool: 80, platformFee: 119, stripeProcessingEstimate: 6.07, netPlatformMargin: 112.93, totalAuthorized: 199 });
  assert.equal(calculateCohortEscrow(10, 2).platformFee, 15);
});

test("campaign saves enforce automatic REP and preserve the Discovery exception", async () => {
  const previousOwner = process.env.SEEDENV_ANALYTICS_OWNER_EMAIL;
  process.env.SEEDENV_ANALYTICS_OWNER_EMAIL = "rep-policy@example.invalid";
  const savedInstructions: Array<{ minimumRep: number; presetId?: string }> = [];
  const modules = [
    mock.module("../lib/auth.ts", { namedExports: { getCurrentUser: async () => ({ id: "rep-policy-developer", role: "DEVELOPER", username: "teriberi", email: "rep-policy@example.invalid" }) } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: { appCampaign: { create: async ({ data }: { data: { title: string; instructions: { create: Array<{ minimumRep: number; presetId?: string }> } } }) => {
      savedInstructions.push(...data.instructions.create);
      return { id: "rep-policy-draft", title: data.title, status: "DRAFT" };
    } } } } }),
  ];
  try {
    const { saveTestCampaignDraft } = await import(`../app/actions/campaignActions.ts?rep-policy=${randomUUID()}`);
    const input = {
      title: "Automatic reputation test",
      platform: "WEB_STAGING",
      appUrl: "https://example.invalid",
      targetVibe: "Creator Tools",
      description: "Verify automatic reputation requirements without a real database.",
      totalSlots: 25,
      bountyPerTaskUsd: 4,
      instructions: [{ presetId: "offline-reconnect", instructionTitle: "Custom offline testing title", instructionDetail: "Check cached actions and state recovery after reconnecting.", proofType: "SCREENSHOT", minimumRep: 0 }],
      discoveryAllowed: true,
      discoveryMinRep: 900,
    };
    await saveTestCampaignDraft(input);
    assert.equal(savedInstructions[0].minimumRep, 1500);
    assert.equal(savedInstructions[0].presetId, undefined);
    await assert.rejects(saveTestCampaignDraft({ ...input, discoveryMinRep: 1501 }), /Discovery REP floor/);
    await assert.rejects(saveTestCampaignDraft({ ...input, instructions: [{ ...input.instructions[0], presetId: "unknown-preset" }] }), /Unknown testing mission preset/);
    assert.equal(savedInstructions.length, 1);
  } finally {
    for (const item of modules.reverse()) item.restore();
    if (previousOwner === undefined) delete process.env.SEEDENV_ANALYTICS_OWNER_EMAIL;
    else process.env.SEEDENV_ANALYTICS_OWNER_EMAIL = previousOwner;
  }
});

test("proof editing requires an explicit revision start and a live editing window", () => {
  const original = { expiresAt: new Date(Date.now() + 60000), feedbackText: "Original feedback", proofImageUrl: "proof:original", revisionRequestedAt: null, revisionStartedAt: null };
  assert.throws(() => assertProofEditable(original), /already awaiting review/);
  const requested = { ...original, revisionRequestedAt: new Date() };
  assert.throws(() => assertProofEditable(requested), /Start your requested revision/);
  assert.doesNotThrow(() => assertProofEditable({ ...requested, revisionStartedAt: new Date() }));
  assert.throws(() => assertProofEditable({ ...requested, revisionStartedAt: new Date(), expiresAt: new Date(Date.now() - 1) }), /window expired/);
  const encodedScreenshot = Buffer.alloc(5 * 1024 * 1024).toString("base64");
  assert.equal(nextConfig.experimental?.serverActions?.bodySizeLimit, "8mb");
  assert.ok(Buffer.byteLength(JSON.stringify({ proofImageBase64: encodedScreenshot, feedbackText: "f".repeat(2000), crashLogs: "c".repeat(20000), networkLogs: "n".repeat(20000) })) < 8 * 1024 * 1024);
});

test("missing Stripe configuration or funding method saves a draft without creating payment records", async () => {
  const previousStripeKey = process.env.STRIPE_SECRET_KEY;
  const previousNodeEnv = process.env.NODE_ENV;
  const created: Array<{ status: string; totalBudgetUsd: number; platformFeeUsd: number }> = [];
  const updated: Array<{ status: string }> = [];
  const transaction = {
    taskInstruction: { deleteMany: async () => ({ count: 1 }) },
    appCampaign: { update: async ({ data }: { data: { status: string } }) => {
      updated.push(data);
      return { id: "existing-payment-draft", ...data };
    } },
  };
  const modules = [
    mock.module("../lib/auth.ts", { namedExports: { getCurrentUser: async () => ({ id: "payment-test-developer", role: "DEVELOPER", stripeCustomerId: null }) } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: {
      appCampaign: {
        create: async ({ data }: { data: { status: string; totalBudgetUsd: number; platformFeeUsd: number } }) => {
          created.push(data);
          return { id: `payment-draft-${created.length}`, ...data };
        },
        findFirst: async () => ({ id: "existing-payment-draft" }),
      },
      walletTransaction: { create: async () => assert.fail("Setup fallback must not create escrow or wallet entries.") },
      $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction),
    } } }),
  ];
  try {
    Object.assign(process.env, { NODE_ENV: "production" });
    delete process.env.STRIPE_SECRET_KEY;
    const { createCampaignWithEscrow } = await import(`../app/actions/campaignActions.ts?payment-setup=${randomUUID()}`);
    const input = {
      title: "Missing payment setup test",
      platform: "WEB_STAGING",
      appUrl: "https://example.invalid",
      targetVibe: "Creator Tools",
      description: "Save the campaign before routing to payment setup without charging.",
      totalSlots: 25,
      bountyPerTaskUsd: 4,
      instructions: [{ instructionTitle: "Complete onboarding", instructionDetail: "Walk through signup and report confusing steps.", proofType: "SCREENSHOT", minimumRep: 0 }],
      discoveryAllowed: false,
      discoveryMinRep: 0,
    };
    assert.deepEqual(await createCampaignWithEscrow(input), { campaignId: "payment-draft-1", checkoutUrl: null, escrowTotalCents: 0, requiresPaymentSetup: true });
    assert.equal(created[0].status, "DRAFT");
    assert.equal(created[0].totalBudgetUsd, 120);
    assert.equal(created[0].platformFeeUsd, 20);
    assert.deepEqual(await createCampaignWithEscrow(input, "existing-payment-draft"), { campaignId: "existing-payment-draft", checkoutUrl: null, escrowTotalCents: 0, requiresPaymentSetup: true });
    assert.equal(updated[0].status, "DRAFT");
    process.env.STRIPE_SECRET_KEY = "configured-for-mocked-test";
    // Custom drops are funded from the prepaid balance; only flat bundles still need a saved card first.
    assert.deepEqual(await createCampaignWithEscrow({ ...input, cohortType: "GOOGLE_PLAY_14_DAY" }), { campaignId: "payment-draft-2", checkoutUrl: null, escrowTotalCents: 0, requiresPaymentSetup: true });
    assert.equal(created[1].status, "DRAFT");
    assert.equal(created.length, 2);
  } finally {
    for (const item of modules.reverse()) item.restore();
    if (previousStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousStripeKey;
    if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: previousNodeEnv });
  }
});

test("public landing survives unavailable cohort and optional account lookups without seeding data", async () => {
  let signedIn = false;
  const loggedErrors: string[] = [];
  const log = mock.method(console, "error", (message: string) => { loggedErrors.push(message); });
  const modules = [
    mock.module("next/navigation", { namedExports: { redirect: (path: string) => { throw new Error(`Redirect:${path}`); } } }),
    mock.module("../lib/auth-options.ts", { namedExports: { authOptions: {} } }),
    mock.module("next-auth", { namedExports: { getServerSession: async () => signedIn ? { user: { id: "landing-viewer" } } : null } }),
    mock.module("../components/public-landing.tsx", { namedExports: { PublicLanding: () => null } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: {
      appCampaign: { findMany: async () => { throw new Error("Database unavailable in isolated test."); } },
      user: { findUnique: async () => { throw new Error("Optional account lookup unavailable."); } },
    } } }),
  ];
  try {
    const { default: Home } = await import(`../app/page.tsx?landing=${randomUUID()}`);
    await assert.rejects(Home({ params: Promise.resolve({}), searchParams: Promise.resolve({ view: "developers" }) }), /Redirect:\/#engine/);
    await assert.rejects(Home({ params: Promise.resolve({}), searchParams: Promise.resolve({ view: "circle" }) }), /Redirect:\/community/);
    const guest = await Home({ params: Promise.resolve({}), searchParams: Promise.resolve({}) });
    assert.deepEqual(guest.props.missions, []);
    assert.equal(guest.props.viewer, null);
    assert.equal(guest.props.directoryUnavailable, true);
    signedIn = true;
    const expiredViewer = await Home({ params: Promise.resolve({}), searchParams: Promise.resolve({}) });
    assert.equal(expiredViewer.props.viewer, null);
    assert.equal(expiredViewer.props.directoryUnavailable, true);
    assert.ok(loggedErrors.some((message) => message.includes("public cohort lookup")));
    assert.ok(loggedErrors.some((message) => message.includes("optional session lookup")));
  } finally {
    for (const item of modules.reverse()) item.restore();
    log.mock.restore();
  }
});

test("launch journeys use real rollback-only database records and mocked providers", { skip: process.env.RUN_LAUNCH_DB_TESTS !== "1" }, async () => {
  const marker = `launch-${randomUUID()}`;
  const rollback = new Error("Intentional launch fixture rollback");
  const modules: Array<ReturnType<typeof mock.module>> = [];
  let member: User;
  let signedIn = true;
  let uploads = 0;
  const revalidated: string[] = [];
  const session = {
    id: `cs_${marker}`, mode: "payment", status: "complete", payment_status: "unpaid",
    currency: "usd", amount_total: 1000, payment_intent: `pi_${marker}`,
    metadata: { type: "SEEDENV_CAMPAIGN_ESCROW", campaignId: "", developerId: "" },
  };
  modules.push(mock.module("../lib/member.ts", { namedExports: { requireMember: async (role?: string) => {
    if (role && member.role !== role && member.role !== "ADMIN") throw new Error("Wrong workspace.");
    return member;
  } } }));
  modules.push(mock.module("../lib/auth-options.ts", { namedExports: { authOptions: {} } }));
  modules.push(mock.module("next-auth", { namedExports: { getServerSession: async () => signedIn ? { user: { id: member.id } } : null } }));
  modules.push(mock.module("../lib/storage.ts", { namedExports: { uploadProofImage: async () => { uploads++; return "proof:mock-replacement"; }, getProofImageUrl: async () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=" } }));
  modules.push(mock.module("../lib/stripe.ts", { namedExports: { getStripe: () => ({ checkout: { sessions: { retrieve: async () => session } } }) } }));
  modules.push(mock.module("../lib/notifications.ts", { namedExports: { notificationEnabled: () => false, sendNotificationEmail: async () => { throw new Error("No emails may be sent by this test."); } } }));
  modules.push(mock.module("next/cache", { namedExports: { revalidatePath: (path: string) => { revalidated.push(path); } } }));
  try {
    await assert.rejects(prisma.$transaction(async (tx) => {
      modules.push(mock.module("../lib/prisma.ts", { namedExports: { prisma: new Proxy(tx, { get: (target, key) => key === "$transaction" ? async (work: (database: typeof tx) => Promise<unknown>) => work(tx) : Reflect.get(target, key) }) } }));
      const { awardDailyCheckIn } = await import("../lib/quest-ledger");
      const { requestSubmissionRevision, startSubmissionRevision, submitTaskProof, approveSubmission, rejectSubmission } = await import("../app/actions/submissionActions");
      const { handleStripeWebhook } = await import("../lib/campaign-payments");
      const { publishComment, hideCommunityContent } = await import("../app/actions/communityActions");
      const { GET: getPrivateProof } = await import("../app/api/submissions/[id]/proof/route");
      const developer = await tx.user.create({ data: { email: `${marker}-dev@example.invalid`, role: "DEVELOPER" } });
      const tester = await tx.user.create({ data: { email: `${marker}-tester@example.invalid`, role: "TESTER" } });
      const stranger = await tx.user.create({ data: { email: `${marker}-stranger@example.invalid`, role: "TESTER" } });
      member = tester;
      assert.equal(await awardDailyCheckIn(tester.id), true);
      assert.equal(await awardDailyCheckIn(tester.id), false);
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: tester.id } })).questXp, 5);
      assert.equal(revalidated.length, 0, "render-safe daily credit must not invalidate caches");
      const campaign = await tx.appCampaign.create({ data: { developerId: developer.id, title: "Launch fixture", platform: "WEB_STAGING", appUrl: "https://example.invalid", targetVibe: "Test", description: "Rollback-only launch fixture", totalBudgetUsd: 10, bountyPerTaskUsd: 1, platformFeeUsd: 0.8, totalSlots: 5, claimedSlots: 1, status: "ACTIVE", expiresAt: new Date(Date.now() + 86400000) } });
      const original = await tx.submission.create({ data: { campaignId: campaign.id, testerId: tester.id, payoutCents: 100, expiresAt: new Date(Date.now() - 3600000), feedbackText: "Original feedback preserved.", proofImageUrl: "proof:original", proofImageHash: "original-hash", deviceModel: "Original phone" } });
      const proofRequest = new Request(`http://localhost/api/submissions/${original.id}/proof`);
      const proofParams = { params: Promise.resolve({ id: original.id }) };
      signedIn = false;
      assert.equal((await getPrivateProof(proofRequest, proofParams)).status, 401);
      signedIn = true;
      member = stranger;
      assert.equal((await getPrivateProof(proofRequest, proofParams)).status, 404);
      member = tester;
      const proofResponse = await getPrivateProof(proofRequest, proofParams);
      assert.equal(proofResponse.status, 200);
      assert.equal(proofResponse.headers.get("cache-control"), "private, no-store");
      assert.equal(proofResponse.headers.get("content-type"), "image/png");
      assert.equal((await proofResponse.arrayBuffer()).byteLength, 68);
      member = developer;
      await requestSubmissionRevision(original.id, "Please clarify the reproduction steps.");
      const requested = await tx.submission.findUniqueOrThrow({ where: { id: original.id } });
      assert.ok(requested.revisionRequestedAt);
      assert.equal(requested.revisionStartedAt, null);
      assert.equal(requested.expiresAt.getTime(), original.expiresAt.getTime());
      assert.equal(requested.proofImageUrl, original.proofImageUrl);
      await assert.rejects(approveSubmission(original.id), /requested revision/);
      await assert.rejects(requestSubmissionRevision(original.id, "A second revision request."), /outstanding/);
      member = stranger;
      await assert.rejects(startSubmissionRevision(original.id), /your submission/);
      member = tester;
      await assert.rejects(submitTaskProof(original.id, { feedbackText: "Updated but not started yet." }), /Start your requested revision/);
      const startTime = Date.now();
      const started = await startSubmissionRevision(original.id);
      assert.ok(started.expiresAt.getTime() >= startTime + 1800000 && started.expiresAt.getTime() <= Date.now() + 1800000);
      assert.equal(started.deviceModel, "Original phone");
      const resumed = await startProofRevision(tx, tester.id, original.id);
      assert.equal(resumed.expiresAt.getTime(), started.expiresAt.getTime());
      await tx.submission.update({ where: { id: original.id }, data: { expiresAt: new Date(Date.now() - 1) } });
      await assert.rejects(submitTaskProof(original.id, { feedbackText: "Updated after window expired." }), /window expired/);
      await startSubmissionRevision(original.id);
      await assert.rejects(submitTaskProof(original.id, { feedbackText: "Updated reproduction steps.", recordingUrl: "javascript:alert(1)" }));
      const revised = await submitTaskProof(original.id, { feedbackText: "Updated reproduction steps.", deviceModel: "Original phone", recordingUrl: "" });
      assert.equal(revised.proofImageUrl, original.proofImageUrl);
      assert.equal(revised.proofImageHash, original.proofImageHash);
      assert.equal(revised.revisionRequestedAt, null);
      assert.equal(uploads, 0);
      await assert.rejects(submitTaskProof(original.id, { feedbackText: "Double submit should fail." }), /already awaiting review/);
      member = developer;
      await requestSubmissionRevision(original.id, "Please replace the screenshot now.");
      member = tester;
      await startSubmissionRevision(original.id);
      const image = Buffer.alloc(5 * 1024 * 1024);
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(image);
      const hash = createHash("sha256").update(image).digest("hex");
      const oversized = Buffer.concat([image, Buffer.from([0])]);
      await assert.rejects(submitTaskProof(original.id, { feedbackText: "Replacement proof feedback.", proofImageBase64: oversized.toString("base64"), proofImageMimeType: "image/png" }), /under 5MB/);
      await assert.rejects(submitTaskProof(original.id, { feedbackText: "Replacement proof feedback.", proofImageBase64: image.toString("base64"), proofImageMimeType: "image/png", proofImageHash: "invalid-hash-value" }), /hash did not match/);
      await submitTaskProof(original.id, { feedbackText: "Replacement proof feedback.", proofImageBase64: image.toString("base64"), proofImageMimeType: "image/png", proofImageHash: hash });
      assert.equal(uploads, 1);
      assert.equal((await tx.submission.findUniqueOrThrow({ where: { id: original.id } })).proofImageHash, hash);
      assert.equal((await tx.appCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).claimedSlots, 1);
      member = developer;
      const approval = await approveSubmission(original.id);
      assert.equal(approval.payoutStatus, "PENDING");
      await assert.rejects(rejectSubmission(original.id, "Low Effort"), /Pending submission/);
      assert.equal((await tx.appCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).claimedSlots, 1);
      assert.equal((await tx.appCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).completedSlots, 1);
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: tester.id } })).walletBalanceCents, 0);
      assert.equal(await tx.walletTransaction.count({ where: { userId: tester.id, type: "BOUNTY_PAYOUT", status: "PENDING" } }), 1);
      await tx.appCampaign.update({ where: { id: campaign.id }, data: { claimedSlots: { increment: 1 } } });
      const other = await tx.submission.create({ data: { campaignId: campaign.id, testerId: stranger.id, payoutCents: 100, expiresAt: new Date(Date.now() + 60000), feedbackText: "Another tester's feedback", proofImageUrl: "proof:other" } });
      await rejectSubmission(other.id, "Low Effort");
      await assert.rejects(rejectSubmission(other.id, "Low Effort"), /Pending submission/);
      assert.equal((await tx.appCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).claimedSlots, 1);

      const post = await tx.communityPost.create({ data: { authorId: developer.id, body: "A launch fixture app announcement." } });
      member = tester;
      await publishComment(post.id, "Useful discussion feedback.");
      assert.ok(revalidated.includes("/community/[id]"));
      const comment = await tx.communityComment.findFirstOrThrow({ where: { postId: post.id, authorId: tester.id } });
      member = stranger;
      await assert.rejects(hideCommunityContent(comment.id, "comment"), /Only the author/);
      member = tester;
      await hideCommunityContent(comment.id, "comment");
      assert.equal((await tx.communityComment.findUniqueOrThrow({ where: { id: comment.id } })).hidden, true);

      await tx.appCampaign.update({ where: { id: campaign.id }, data: { status: "ESCROW_PENDING" } });
      const deposit = await tx.walletTransaction.create({ data: { userId: developer.id, amountCents: 1000, type: "ESCROW_DEPOSIT", status: "PENDING", description: `Escrow deposit for ${campaign.title} (${campaign.id})` } });
      session.metadata.campaignId = campaign.id;
      session.metadata.developerId = developer.id;
      const event = { type: "checkout.session.completed", data: { object: { id: session.id } } };
      assert.deepEqual(await handleStripeWebhook(event), { awaitingPayment: true });
      session.payment_status = "paid";
      session.amount_total = 1;
      await assert.rejects(handleStripeWebhook(event), /amount or currency/);
      session.amount_total = 1000;
      session.currency = "eur";
      await assert.rejects(handleStripeWebhook(event), /amount or currency/);
      session.currency = "usd";
      session.metadata.developerId = tester.id;
      await assert.rejects(handleStripeWebhook(event), /ownership/);
      session.metadata.developerId = developer.id;
      assert.deepEqual(await handleStripeWebhook(event), { activated: true, campaignId: campaign.id });
      assert.deepEqual(await handleStripeWebhook(event), { duplicate: true, campaignId: campaign.id });
      assert.equal((await tx.walletTransaction.findUniqueOrThrow({ where: { id: deposit.id } })).stripePaymentId, session.payment_intent);
      await tx.appCampaign.update({ where: { id: campaign.id }, data: { status: "PAUSED" } });
      assert.deepEqual(await handleStripeWebhook(event), { duplicate: true, campaignId: campaign.id });
      assert.equal((await tx.appCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, "PAUSED");
      await tx.appCampaign.update({ where: { id: campaign.id }, data: { status: "COMPLETED" } });
      assert.deepEqual(await handleStripeWebhook(event), { duplicate: true, campaignId: campaign.id });
      assert.equal((await tx.appCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, "COMPLETED");
      await tx.appCampaign.update({ where: { id: campaign.id }, data: { status: "PAUSED" } });
      session.payment_intent = `pi_other_${marker}`;
      await assert.rejects(handleStripeWebhook(event), /not awaiting funding/);
      assert.equal((await tx.appCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status, "PAUSED");
      assert.ok(revalidated.includes("/dashboard") && revalidated.includes("/console"));
      throw rollback;
    }, { timeout: 60000 }), (error: unknown) => error === rollback);
    assert.equal(await prisma.user.count({ where: { email: { startsWith: marker } } }), 0);
  } finally {
    for (const moduleMock of modules.reverse()) moduleMock.restore();
    await prisma.$disconnect();
  }
});
