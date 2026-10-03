import "dotenv/config";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

test("Clippers payment retries reconcile a single transfer/refund without charging real money", { skip: process.env.RUN_CLIPPER_DB_TESTS !== "1" }, async () => {
  const marker = `clip-pay-${randomUUID()}`;
  const rollback = new Error("Intentional Clippers payment rollback");
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://example.invalid";
  let transfers = 0;
  let refunds = 0;
  let transferInterrupt = true;
  let lastSession: { id: string; status: string; url: string; metadata: Record<string, string>; amount_total: number; currency: string; payment_status: string; payment_intent: string } | null = null;
  const externalTransfers: Array<{ id: string; amount: number; destination: string; reversed: boolean }> = [];
  const externalRefunds: Array<{ id: string; status: string; amount: number; metadata: { engagementId: string } }> = [];
  const fakeStripe = {
    accounts: { retrieve: async () => ({ payouts_enabled: true, capabilities: { transfers: "active" } }) },
    checkout: { sessions: {
      create: async (input: { metadata: Record<string, string>; line_items: Array<{ price_data: { unit_amount: number } }> }) => {
        lastSession = { id: `cs_${marker}`, status: "open", url: "https://checkout.stripe.com/test-only", metadata: input.metadata, amount_total: input.line_items[0].price_data.unit_amount, currency: "usd", payment_status: "unpaid", payment_intent: `pi_${marker}` };
        return lastSession;
      },
      retrieve: async () => { if (!lastSession) throw new Error("Missing fake session."); return lastSession; },
    } },
    paymentIntents: { retrieve: async () => ({ status: "succeeded", latest_charge: `ch_${marker}` }) },
    charges: { retrieve: async () => ({ id: `ch_${marker}`, refunded: false, amount_refunded: 0, disputed: false, payment_intent: `pi_${marker}` }) },
    transfers: {
      list: async () => ({ data: externalTransfers, has_more: false }),
      create: async (input: { amount: number; destination: string }, options: { idempotencyKey: string }) => {
        assert.match(options.idempotencyKey, /^clip-transfer-/);
        transfers++;
        const transfer = { id: `tr_${marker}`, amount: input.amount, destination: input.destination, reversed: false };
        externalTransfers.push(transfer);
        if (transferInterrupt) { transferInterrupt = false; throw new Error("Simulated lost response after Stripe created the transfer"); }
        return transfer;
      },
    },
    refunds: {
      list: async () => ({ data: externalRefunds, has_more: false }),
      create: async (input: { metadata: { engagementId: string } }, options: { idempotencyKey: string }) => {
        assert.match(options.idempotencyKey, /^clip-refund-/);
        refunds++;
        const refund = { id: `re_${marker}`, status: "succeeded", amount: 5435, metadata: input.metadata };
        externalRefunds.push(refund);
        return refund;
      },
    },
  };
  const stripeMock = mock.module("../lib/stripe.ts", { namedExports: { getStripe: () => fakeStripe } });
  let dbMock: ReturnType<typeof mock.module> | undefined;
  let transactionMock: ReturnType<typeof mock.module> | undefined;
  try {
    await prisma.$transaction(async (tx) => {
      dbMock = mock.module("../lib/prisma.ts", { namedExports: { prisma: tx } });
      transactionMock = mock.module("../lib/quest-ledger.ts", { namedExports: { serializable: async (work: (database: Prisma.TransactionClient) => Promise<unknown>) => work(tx) } });
      const { fundClipAgreement, handleClipPaymentEvent, releaseClipPayment, refundClipPayment } = await import("../lib/clipper-payments");
      const developer = await tx.user.create({ data: { email: `${marker}-dev@example.invalid`, role: "DEVELOPER" } });
      const creator = await tx.user.create({ data: { email: `${marker}-creator@example.invalid`, role: "TESTER", stripeConnectAccountId: `acct_${marker}` } });
      const campaign = await tx.clipCampaign.create({ data: { developerId: developer.id, title: "Payment rollback fixture", appUrl: "https://example.invalid", brief: "A controlled payment test without any real Stripe network requests.", platform: "TIKTOK", feeCents: 5000 } });
      const item = await tx.clipEngagement.create({ data: { campaignId: campaign.id, creatorId: creator.id, note: "Fixture agreement", status: "ACCEPTED", feeCents: 5000, chargeCents: 5435, termsAcceptedAt: new Date() } });
      await assert.rejects(fundClipAgreement(item.id, creator.id), /not found/);
      await assert.rejects(releaseClipPayment(item.id, developer.id), /unavailable/);
      await fundClipAgreement(item.id, developer.id);
      assert.equal((await tx.clipEngagement.findUniqueOrThrow({ where: { id: item.id } })).status, "FUNDING");
      const fakeSession = await fakeStripe.checkout.sessions.retrieve();
      await handleClipPaymentEvent({ type: "checkout.session.completed", data: { object: { id: fakeSession.id, metadata: fakeSession.metadata } } });
      assert.equal((await tx.clipEngagement.findUniqueOrThrow({ where: { id: item.id } })).status, "FUNDING");
      fakeSession.payment_status = "paid";
      await handleClipPaymentEvent({ type: "checkout.session.completed", data: { object: { id: fakeSession.id, metadata: fakeSession.metadata } } });
      await handleClipPaymentEvent({ type: "checkout.session.completed", data: { object: { id: fakeSession.id, metadata: fakeSession.metadata } } });
      assert.equal(await tx.walletTransaction.count({ where: { userId: developer.id, type: "CLIPPER_DEPOSIT" } }), 1);
      assert.equal((await tx.clipEngagement.findUniqueOrThrow({ where: { id: item.id } })).status, "FUNDED");
      const draft = await tx.clipAsset.create({ data: { campaignId: campaign.id, engagementId: item.id, ownerId: creator.id, kind: "DRAFT", path: `${marker}/draft`, name: "draft.mp4", mimeType: "video/mp4", sizeBytes: 10, ready: false } });
      await assert.rejects(refundClipPayment(item.id, developer.id, "DEVELOPER", "Should refuse refund after upload starts."), /uploading/);
      await tx.clipAsset.update({ where: { id: draft.id }, data: { ready: true } });
      const proof = await tx.clipAsset.create({ data: { campaignId: campaign.id, engagementId: item.id, ownerId: creator.id, kind: "PROOF", path: `${marker}/proof`, name: "proof.png", mimeType: "image/png", sizeBytes: 10, ready: true } });
      await tx.clipEngagement.update({ where: { id: item.id }, data: { status: "VERIFIED", approvedDraftId: draft.id, approvedAt: new Date(), proofId: proof.id, publicationUrl: "https://www.tiktok.com/@fixture/video/7080213458555737986", verifiedAt: new Date(), verificationMethod: "DEVELOPER_MANUAL" } });
      await assert.rejects(releaseClipPayment(item.id, creator.id), /not found/);
      await assert.rejects(releaseClipPayment(item.id, developer.id), /Simulated lost response/);
      assert.equal((await tx.clipEngagement.findUniqueOrThrow({ where: { id: item.id } })).status, "PAYMENT_PENDING");
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: creator.id } })).walletBalanceCents, 0);
      await releaseClipPayment(item.id, developer.id);
      await releaseClipPayment(item.id, developer.id);
      assert.equal(transfers, 1);
      assert.equal((await tx.user.findUniqueOrThrow({ where: { id: creator.id } })).walletBalanceCents, 5000);
      const paid = await tx.clipEngagement.findUniqueOrThrow({ where: { id: item.id } });
      assert.equal(paid.status, "PAID");
      assert.ok(paid.licenseEndsAt && paid.paidAt);
      assert.equal(paid.licenseEndsAt!.getTime() - paid.paidAt!.getTime(), 90 * 86400000);
      assert.equal(await tx.walletTransaction.count({ where: { userId: creator.id, type: "CLIPPER_PAYOUT" } }), 1);
      await assert.rejects(refundClipPayment(item.id, developer.id, "ADMIN", "Must not refund already transferred money."), /unavailable/);
      const otherCreator = await tx.user.create({ data: { email: `${marker}-refund@example.invalid`, role: "TESTER" } });
      const cancellable = await tx.clipEngagement.create({ data: { campaignId: campaign.id, creatorId: otherCreator.id, note: "Refund fixture agreement", status: "FUNDED", feeCents: 5000, chargeCents: 5435, termsAcceptedAt: new Date(), fundedAt: new Date(), paymentIntentId: `pi_refund_${marker}` } });
      await refundClipPayment(cancellable.id, developer.id, "DEVELOPER", "Cancel the agreement before any creative work starts.");
      await refundClipPayment(cancellable.id, developer.id, "DEVELOPER", "Repeated cancellation should not refund twice.");
      assert.equal(refunds, 1);
      assert.equal((await tx.clipEngagement.findUniqueOrThrow({ where: { id: cancellable.id } })).status, "CANCELLED");
      assert.equal(await tx.walletTransaction.count({ where: { userId: developer.id, type: "CLIPPER_REFUND" } }), 1);
      throw rollback;
    }, { timeout: 60000 });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    stripeMock.restore();
    dbMock?.restore();
    transactionMock?.restore();
    if (origin === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = origin;
    try { assert.equal(await prisma.user.count({ where: { email: { startsWith: marker } } }), 0); }
    finally { await prisma.$disconnect(); }
  }
});
