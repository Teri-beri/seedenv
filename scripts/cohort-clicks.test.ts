import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import { PrismaClient, type Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { COHORT_BUNDLES, quoteCampaignFunding, standardPlatformFeeCents } from "../lib/pricing";
import { prepaidRefundTargetCents } from "../lib/slot-funding";

test("brief clicks validate public cohorts, exclude owners/opt-outs/bots, and deduplicate daily visitors", async () => {
  const oldSecret = process.env.NEXTAUTH_SECRET;
  const oldExcluded = process.env.SEEDENV_ANALYTICS_EXCLUDED_IPS;
  process.env.NEXTAUTH_SECRET = "unit-test-hash-key-not-a-live-secret";
  process.env.SEEDENV_ANALYTICS_EXCLUDED_IPS = "203.0.113.7";
  let memberId: string | null = "visitor";
  let available = true;
  let fail = false;
  const rows = new Map<string, { campaignId: string; visitorKey: string; day: string }>();
  const queries: Prisma.AppCampaignFindFirstArgs[] = [];
  const modules = [
    mock.module("../lib/auth-options.ts", { namedExports: { authOptions: {} } }),
    mock.module("next-auth", { namedExports: { getServerSession: async () => memberId ? { user: { id: memberId } } : null } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: {
      appCampaign: { findFirst: async (query: Prisma.AppCampaignFindFirstArgs) => { queries.push(query); if (fail) throw new Error("Mock unavailable"); return available ? { id: "cohort", developerId: "owner" } : null; } },
      cohortClick: { createMany: async ({ data, skipDuplicates }: { data: Array<{ campaignId: string; visitorKey: string; day: string }>; skipDuplicates: boolean }) => {
        assert.equal(skipDuplicates, true);
        const row = data[0];
        const key = JSON.stringify(row);
        if (rows.has(key)) return { count: 0 };
        rows.set(key, row);
        return { count: 1 };
      } },
    } } }),
  ];
  function request(headers: Record<string, string> = {}, body = '{"campaignId":"cohort"}', host = "seedenv.com") {
    return new NextRequest(`https://${host}/api/cohorts/click`, { method: "POST", headers: { origin: `https://${host}`, "content-type": "application/json", "user-agent": "Mozilla/5.0 Safari/605.1.15", "x-forwarded-for": "203.0.113.9", ...headers }, body });
  }
  try {
    const { POST } = await import("../app/api/cohorts/click/route");
    assert.equal((await POST(request({ origin: "https://foreign.invalid" }))).status, 403);
    assert.equal((await POST(request({}, "{}"))).status, 400);
    assert.equal((await POST(request({}, "{"))).status, 400);
    assert.equal((await POST(request({}, "x".repeat(1001)))).status, 413);
    assert.equal((await POST(request({ "user-agent": "Googlebot" }))).status, 200);
    assert.equal((await (await POST(request({ cookie: "seedenv_analytics_optout=1" }))).json()).counted, false);
    assert.equal((await (await POST(request({ "x-forwarded-for": "203.0.113.7" }))).json()).counted, false);
    assert.equal((await (await POST(request({}, undefined, "localhost"))).json()).counted, false);
    assert.equal((await POST(request({ "x-forwarded-host": "seedenv.com", origin: "https://foreign.invalid" }))).status, 403);
    assert.equal(queries.length, 0);
    memberId = "owner";
    assert.equal((await (await POST(request())).json()).reason, "own-cohort");
    memberId = "visitor";
    assert.equal((await (await POST(request())).json()).counted, true);
    assert.equal((await (await POST(request())).json()).counted, false);
    assert.equal((await (await POST(request({ "x-forwarded-for": "203.0.113.10" }))).json()).counted, false, "Signed-in identity does not change with IP.");
    memberId = "visitor-2";
    assert.equal((await (await POST(request())).json()).counted, true);
    memberId = null;
    assert.equal((await (await POST(request())).json()).counted, true);
    assert.equal((await (await POST(request())).json()).counted, false);
    assert.equal(rows.size, 3);
    assert.equal((await (await POST(request({ "x-forwarded-host": "seedenv.com", origin: "https://seedenv.com" }, undefined, "localhost"))).json()).counted, false, "Reverse proxy host is used for both origin and local-preview checks.");
    for (const row of rows.values()) {
      assert.match(row.visitorKey, /^[0-9a-f]{24}$/);
      assert.match(row.day, /^\d{4}-\d{2}-\d{2}$/);
    }
    assert.deepEqual(queries[0].select, { id: true, developerId: true });
    assert.equal(queries[0].where?.status, "ACTIVE");
    assert.equal(queries[0].where?.cancelledAt, null);
    available = false;
    assert.equal((await (await POST(request())).json()).reason, "unavailable");
    fail = true;
    assert.equal((await POST(request())).status, 503);
  } finally {
    modules.reverse().forEach(module => module.restore());
    if (oldSecret === undefined) delete process.env.NEXTAUTH_SECRET; else process.env.NEXTAUTH_SECRET = oldSecret;
    if (oldExcluded === undefined) delete process.env.SEEDENV_ANALYTICS_EXCLUDED_IPS; else process.env.SEEDENV_ANALYTICS_EXCLUDED_IPS = oldExcluded;
  }
});

test("new bundle fees use the shared policy; legacy refunds preserve paid terms", () => {
  for (const bundle of Object.values(COHORT_BUNDLES)) {
    assert.equal(bundle.platformFeeCents, standardPlatformFeeCents(bundle.slots * bundle.bountyCents));
    assert.equal(bundle.totalCents, bundle.slots * bundle.bountyCents + bundle.platformFeeCents);
  }
  assert.deepEqual(quoteCampaignFunding(999, "LIVE_STRESS_DROP"), { payoutPoolUsd: 175, platformFeeUsd: 35, totalBudgetUsd: 210, escrowTotalCents: 21000 });
  assert.equal(quoteCampaignFunding(0, "LIVE_STRESS_DROP", false, 50).escrowTotalCents, 19250);
  assert.equal(quoteCampaignFunding(0, "LIVE_STRESS_DROP", true).escrowTotalCents, 17500);
  assert.equal(quoteCampaignFunding(0, "GOOGLE_PLAY_14_DAY", true).escrowTotalCents, 8000);
  assert.equal(prepaidRefundTargetCents({ totalSlots: 20, claimedSlots: 0, bountyCents: 400, platformFeeCents: 11900, submissionsEver: 0 }), 19900);
  assert.equal(prepaidRefundTargetCents({ totalSlots: 35, claimedSlots: 0, bountyCents: 500, platformFeeCents: 17400, submissionsEver: 0 }), 34900);
});

test("legacy pending bundle payments settle from persisted amounts, not today's quote", async () => {
  const campaign = { id: "legacy", developerId: "owner", title: "Legacy Play", status: "ESCROW_PENDING", totalBudgetUsd: 199, platformFeeUsd: 119, platformFeeDiscountPercent: 0, cancelledAt: null, taxSnapshot: null };
  let amount = 19900;
  let activated = false;
  const tx = {
    appCampaign: { findUnique: async () => campaign, update: async () => { activated = true; } },
    walletTransaction: {
      findMany: async () => [{ id: "deposit", status: "PENDING", amountCents: 19900 }],
      update: async () => undefined,
    },
  };
  const modules = [
    mock.module("../lib/billing-transaction.ts", { namedExports: { billingTransaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }),
    mock.module("../lib/funding-reversals.ts", { namedExports: { handleFundingReversal: async () => undefined, reconcileFundingPayment: async () => undefined } }),
    mock.module("../lib/social-connections.ts", { namedExports: { queueFollowerEmails: async () => undefined } }),
    mock.module("../lib/stripe.ts", { namedExports: { getStripe: () => ({ checkout: { sessions: { retrieve: async () => ({
      mode: "payment", status: "complete", payment_status: "paid", currency: "usd", amount_total: amount, payment_intent: "pi_mock_legacy",
      metadata: { type: "SEEDENV_CAMPAIGN_ESCROW", campaignId: campaign.id, developerId: campaign.developerId },
    }) } } }) } }),
  ];
  try {
    const { handleStripeWebhook } = await import("../lib/campaign-payments");
    const event = { type: "checkout.session.completed", data: { object: { id: "cs_mock_legacy" } } };
    assert.deepEqual(await handleStripeWebhook(event), { activated: true, campaignId: campaign.id });
    assert.equal(activated, true);
    assert.equal(campaign.platformFeeUsd, 119);
    amount = COHORT_BUNDLES.GOOGLE_PLAY_14_DAY.totalCents;
    await assert.rejects(handleStripeWebhook(event), /amount or currency/);
  } finally { modules.reverse().forEach(module => module.restore()); }
});

test("cohort click keys deduplicate concurrent writes, rotate daily and cascade on deletion (sandbox PostgreSQL)", { skip: process.env.RUN_COHORT_CLICK_DB_TESTS !== "1" }, async () => {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(url.hostname.startsWith("dpg-db4khrcs728c73flrip0-a") && url.pathname === "/seedenv_staging_db", "Only the isolated sandbox is allowed.");
  const db = new PrismaClient();
  const marker = `click-${randomUUID()}`;
  let ownerId: string | undefined;
  try {
    const owner = await db.user.create({ data: { email: `${marker}@example.invalid`, role: "DEVELOPER" } });
    ownerId = owner.id;
    const campaign = await db.appCampaign.create({ data: { developerId: owner.id, title: marker, platform: "WEB_STAGING", appUrl: "https://example.invalid", targetVibe: "Fixture", description: "Isolated click integration fixture", totalBudgetUsd: 96, platformFeeUsd: 16, bountyPerTaskUsd: 4, totalSlots: 20, status: "ACTIVE", expiresAt: new Date(Date.now() + 86400000) } });
    const click = { campaignId: campaign.id, visitorKey: "hashed-fixture-visitor", day: "2026-10-23" };
    const results = await Promise.all(Array.from({ length: 12 }, () => db.cohortClick.createMany({ data: [click], skipDuplicates: true })));
    assert.equal(results.reduce((sum, result) => sum + result.count, 0), 1);
    await db.cohortClick.createMany({ data: [{ ...click, day: "2026-10-24" }, { ...click, visitorKey: "second-hashed-fixture-visitor" }], skipDuplicates: true });
    const saved = await db.appCampaign.findUniqueOrThrow({ where: { id: campaign.id }, select: { _count: { select: { clicks: true } } } });
    assert.equal(saved._count.clicks, 3);
    await db.appCampaign.delete({ where: { id: campaign.id } });
    assert.equal(await db.cohortClick.count({ where: { campaignId: campaign.id } }), 0);
  } finally {
    if (ownerId) await db.user.delete({ where: { id: ownerId } });
    await db.$disconnect();
  }
});

test("directory links track interaction only and landing cohorts immediately follow the offer", async () => {
  const link = await readFile(new URL("../components/cohort-brief-link.tsx", import.meta.url), "utf8");
  assert.match(link, /onClick=\{track\}/);
  assert.match(link, /onAuxClick=/);
  assert.doesNotMatch(link, /useEffect|onMouseEnter/);
  const landing = await readFile(new URL("../components/public-landing.tsx", import.meta.url), "utf8");
  assert.ok(landing.indexOf('id="launch-offer"') < landing.indexOf('id="cohorts"'));
  assert.ok(landing.indexOf('id="cohorts"') < landing.indexOf('aria-label="Live validation showcase"'));
  assert.match(landing, /own \? <Link href="\/console#active-cohorts"/);
  assert.match(landing, /mission\.developerId === \(viewer\?\.id \|\| session\?\.user\?\.id\)/);
});
