import "dotenv/config";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

test("TikTok connection encrypts tokens and checks account, time, and caption without external requests", { skip: process.env.RUN_CLIPPER_DB_TESTS !== "1" }, async () => {
  const marker = `clip-social-${randomUUID()}`;
  const rollback = new Error("Intentional TikTok fixture rollback");
  const environment = ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REDIRECT_URI", "CLIPPERS_TOKEN_KEY"] as const;
  const previous = Object.fromEntries(environment.map((key) => [key, process.env[key]]));
  process.env.TIKTOK_CLIENT_KEY = "test-key";
  process.env.TIKTOK_CLIENT_SECRET = "test-secret";
  process.env.TIKTOK_REDIRECT_URI = "https://example.invalid/api/clippers/tiktok/callback";
  process.env.CLIPPERS_TOKEN_KEY = randomBytes(32).toString("base64");
  let video: { id: string; create_time: number; video_description: string; share_url: string } | null = null;
  let grantedScope = "user.info.basic,video.list";
  const fetchMock = mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    assert.ok(url.startsWith("https://open.tiktokapis.com/"));
    if (url.includes("/oauth/token/")) return Response.json({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", open_id: "fixture-open-id", expires_in: 86400, refresh_expires_in: 31536000, scope: grantedScope });
    if (url.includes("/user/info/")) return Response.json({ data: { user: { open_id: "fixture-open-id", display_name: "Fixture Creator" } }, error: { code: "ok" } });
    if (url.includes("/video/query/")) {
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-access-token");
      return Response.json({ data: { videos: video ? [video] : [] }, error: { code: "ok" } });
    }
    if (url.includes("/oauth/revoke/")) return Response.json({});
    throw new Error("Unexpected provider request in controlled test.");
  });
  let dbMock: ReturnType<typeof mock.module> | undefined;
  let transactionMock: ReturnType<typeof mock.module> | undefined;
  try {
    await prisma.$transaction(async (tx) => {
      dbMock = mock.module("../lib/prisma.ts", { namedExports: { prisma: tx } });
      transactionMock = mock.module("../lib/quest-ledger.ts", { namedExports: { serializable: async (work: (database: Prisma.TransactionClient) => Promise<unknown>) => work(tx) } });
      const { connectTikTok, disconnectTikTok, verifyTikTokPublication } = await import("../lib/clipper-tiktok");
      const developer = await tx.user.create({ data: { email: `${marker}-dev@example.invalid`, role: "DEVELOPER" } });
      const creator = await tx.user.create({ data: { email: `${marker}-creator@example.invalid`, role: "TESTER" } });
      const stranger = await tx.user.create({ data: { email: `${marker}-stranger@example.invalid`, role: "TESTER" } });
      grantedScope = "user.info.basic";
      await assert.rejects(connectTikTok(creator.id, "fixture-code"), /permission/);
      assert.equal(await tx.clipSocialAccount.count({ where: { userId: creator.id } }), 0);
      grantedScope = "user.info.basic,video.list";
      await connectTikTok(creator.id, "fixture-code");
      const account = await tx.clipSocialAccount.findUniqueOrThrow({ where: { userId_provider: { userId: creator.id, provider: "TIKTOK" } } });
      assert.notEqual(account.accessToken, "fixture-access-token");
      assert.notEqual(account.refreshToken, "fixture-refresh-token");
      await assert.rejects(connectTikTok(stranger.id, "fixture-code"), /already linked/);
      const campaign = await tx.clipCampaign.create({ data: { developerId: developer.id, title: "Social fixture", appUrl: "https://example.invalid", brief: "Check official metadata without publishing any social content.", platform: "TIKTOK", feeCents: 5000 } });
      const item = await tx.clipEngagement.create({ data: { campaignId: campaign.id, creatorId: creator.id, note: "Test fixture", feeCents: 5000, chargeCents: 5435, status: "PROOF_SUBMITTED", termsAcceptedAt: new Date(), approvedDraftId: "fixture-draft", approvedAt: new Date(Date.now() - 60000), publicationId: "7080213458555737986" } });
      await assert.rejects(verifyTikTokPublication(item.id, stranger.id), /unavailable/);
      await assert.rejects(verifyTikTokPublication(item.id, creator.id), /not returned/);
      await assert.rejects(verifyTikTokPublication(item.id, creator.id), /one minute/);
      video = { id: item.publicationId!, create_time: Math.floor(Date.now() / 1000), video_description: "Missing agreement code", share_url: "https://www.tiktok.com/@fixture/video/7080213458555737986" };
      await tx.clipEngagement.update({ where: { id: item.id }, data: { lastVerificationAt: null } });
      await assert.rejects(verifyTikTokPublication(item.id, creator.id), /campaign's publication code|agreement's publication code/);
      video.video_description = `Original app demo ${item.publicationCode} #ad`;
      video.create_time = Math.floor(Date.now() / 1000) - 3600;
      await tx.clipEngagement.update({ where: { id: item.id }, data: { lastVerificationAt: null } });
      await assert.rejects(verifyTikTokPublication(item.id, creator.id), /after draft approval/);
      video.create_time = Math.floor(Date.now() / 1000);
      await tx.clipSocialAccount.update({ where: { id: account.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await tx.clipEngagement.update({ where: { id: item.id }, data: { lastVerificationAt: null } });
      await verifyTikTokPublication(item.id, creator.id);
      const verified = await tx.clipEngagement.findUniqueOrThrow({ where: { id: item.id } });
      assert.equal(verified.status, "VERIFIED");
      assert.equal(verified.verificationMethod, "TIKTOK_OWNERSHIP_AND_CAPTION");
      assert.equal(verified.paidAt, null);
      assert.equal(await tx.walletTransaction.count({ where: { userId: creator.id } }), 0);
      await disconnectTikTok(creator.id);
      assert.equal(await tx.clipSocialAccount.count({ where: { userId: creator.id } }), 0);
      throw rollback;
    }, { timeout: 60000 });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    fetchMock.mock.restore();
    dbMock?.restore();
    transactionMock?.restore();
    for (const key of environment) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    try { assert.equal(await prisma.user.count({ where: { email: { startsWith: marker } } }), 0); }
    finally { await prisma.$disconnect(); }
  }
});
