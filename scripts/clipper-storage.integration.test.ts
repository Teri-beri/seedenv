import "dotenv/config";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../lib/prisma";
import { requireClipRoom } from "../lib/clipper-lifecycle";

test("private Supabase evidence uploads, access checks, and file signatures (fixtures removed)", { skip: process.env.RUN_CLIPPER_STORAGE_TESTS !== "1" }, async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Private storage test needs the configured Supabase connection.");
  const storage = createClient(url, key, { auth: { persistSession: false } }).storage.from(process.env.SUPABASE_CLIPPERS_BUCKET || "seedenv-clippers");
  const marker = `clip-storage-${randomUUID()}`;
  const rollback = new Error("Intentional storage fixture rollback");
  const paths: string[] = [];
  let dbMock: ReturnType<typeof mock.module> | undefined;
  let transactionMock: ReturnType<typeof mock.module> | undefined;
  const roomMock = mock.module("../lib/clippers.ts", { namedExports: { requireClipRoom } });
  try {
    await prisma.$transaction(async (tx) => {
      dbMock = mock.module("../lib/prisma.ts", { namedExports: { prisma: tx } });
      transactionMock = mock.module("../lib/quest-ledger.ts", { namedExports: { serializable: async (work: (database: Prisma.TransactionClient) => Promise<unknown>) => work(tx) } });
      const { beginClipUpload, finishClipUpload, clipAssetUrl } = await import("../lib/clipper-storage");
      const developer = await tx.user.create({ data: { email: `${marker}-dev@example.invalid`, role: "DEVELOPER" } });
      const creator = await tx.user.create({ data: { email: `${marker}-creator@example.invalid`, role: "TESTER" } });
      const teammate = await tx.user.create({ data: { email: `${marker}-team@example.invalid`, role: "TESTER" } });
      const stranger = await tx.user.create({ data: { email: `${marker}-stranger@example.invalid`, role: "TESTER" } });
      const campaign = await tx.clipCampaign.create({ data: { developerId: developer.id, title: "Storage fixture", appUrl: "https://example.invalid", brief: "Private fixture images are removed after the test transaction.", platform: "TIKTOK", feeCents: 5000 } });
      const item = await tx.clipEngagement.create({ data: { campaignId: campaign.id, creatorId: creator.id, note: "Test fixture", feeCents: 5000, chargeCents: 5435, status: "DRAFT_APPROVED", termsAcceptedAt: new Date() } });
      await tx.clipEngagement.create({ data: { campaignId: campaign.id, creatorId: teammate.id, note: "Teammate fixture", feeCents: 5000, chargeCents: 5435, status: "ACCEPTED", termsAcceptedAt: new Date() } });
      await assert.rejects(requireClipRoom(tx, campaign.id, stranger.id, stranger.role), /invited/);
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH3sAAAAASUVORK5CYII=", "base64");
      const input = { campaignId: campaign.id, engagementId: item.id, kind: "PROOF" as const, name: "fixture.png", mimeType: "image/png" as const, sizeBytes: png.length };
      await assert.rejects(beginClipUpload(stranger, input), /invited/);
      const upload = await beginClipUpload(creator, input);
      const asset = await tx.clipAsset.findUniqueOrThrow({ where: { id: upload.assetId } });
      paths.push(asset.path);
      const response = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png", "x-upsert": "false" }, body: png });
      assert.equal(response.ok, true, `Fixture upload returned HTTP ${response.status}`);
      await finishClipUpload(creator, asset.id);
      assert.equal((await tx.clipAsset.findUniqueOrThrow({ where: { id: asset.id } })).ready, true);
      await assert.rejects(clipAssetUrl(asset.id, teammate), /private/);
      const privateUrl = await clipAssetUrl(asset.id, developer);
      assert.equal((await fetch(privateUrl)).ok, true);
      const overwrite = await fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png", "x-upsert": "true" }, body: png });
      assert.equal(overwrite.ok, false, "A signed upload token must not allow overwrite.");
      const corrupt = Buffer.from("This is not an image file.", "utf8");
      const rejectedUpload = await beginClipUpload(creator, { ...input, name: "corrupt.png", sizeBytes: corrupt.length });
      const rejectedAsset = await tx.clipAsset.findUniqueOrThrow({ where: { id: rejectedUpload.assetId } });
      paths.push(rejectedAsset.path);
      assert.equal((await fetch(rejectedUpload.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png", "x-upsert": "false" }, body: corrupt })).ok, true);
      await assert.rejects(finishClipUpload(creator, rejectedAsset.id), /contents/);
      assert.equal((await tx.clipAsset.findUniqueOrThrow({ where: { id: rejectedAsset.id } })).ready, false);
      throw rollback;
    }, { timeout: 90000 });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    roomMock.restore();
    dbMock?.restore();
    transactionMock?.restore();
    try {
      if (paths.length) {
        const removed = await storage.remove(paths);
        if (removed.error) throw new Error(`Fixture cleanup failed: ${removed.error.message}`);
        for (const path of paths) assert.equal((await storage.exists(path)).data, false, "Fixture file was not removed.");
      }
      assert.equal(await prisma.user.count({ where: { email: { startsWith: marker } } }), 0);
    } finally { await prisma.$disconnect(); }
  }
});
