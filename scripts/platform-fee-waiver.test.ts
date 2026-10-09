import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { clipChargeCents } from "../lib/clipper-rules";
import { applyClip } from "../lib/clipper-lifecycle";

test("creator pricing preserves the full reward and normal accounts keep the fee", () => {
  assert.equal(clipChargeCents(5000, true), 5000);
  assert.equal(clipChargeCents(5000, false), 5250);
  assert.throws(() => clipChargeCents(999, true));
});

test("owner waiver migration and creator agreement use persisted account policy (isolated PostgreSQL)", { skip: process.env.RUN_FEE_WAIVER_DB_TESTS !== "1" }, async () => {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(url.hostname.startsWith("dpg-db4khrcs728c73flrip0-a"), "Only the isolated sandbox database is allowed.");
  const prisma = new PrismaClient();
  const rollback = new Error("Intentional fee waiver rollback");
  const migration = readFileSync(new URL("../prisma/migrations/20261015_owner_platform_fee_waiver/migration.sql", import.meta.url), "utf8");
  try {
    await assert.rejects(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE "User" ("id" TEXT PRIMARY KEY, "email" TEXT NOT NULL) ON COMMIT DROP');
      await tx.$executeRawUnsafe('SET LOCAL search_path TO pg_temp');
      await tx.$executeRawUnsafe(`INSERT INTO "User" VALUES ('cmtuw6sak0000fk5lkk0ceot9', 'Terezav2005@gmail.com'), ('other-account', 'other@example.invalid')`);
      for (const statement of migration.trim().split("\n\n")) await tx.$executeRawUnsafe(statement);
      const rows = await tx.$queryRaw<Array<{ id: string; platform_fee_waived: boolean }>>`SELECT "id", "platform_fee_waived" FROM "User" ORDER BY "id"`;
      assert.deepEqual(rows, [{ id: "cmtuw6sak0000fk5lkk0ceot9", platform_fee_waived: true }, { id: "other-account", platform_fee_waived: false }]);
      await tx.$executeRawUnsafe(`UPDATE "User" SET "email" = 'changed@example.invalid' WHERE "id" = 'cmtuw6sak0000fk5lkk0ceot9'`);
      assert.equal((await tx.$queryRaw<Array<{ platform_fee_waived: boolean }>>`SELECT "platform_fee_waived" FROM "User" WHERE "id" = 'cmtuw6sak0000fk5lkk0ceot9'`)[0].platform_fee_waived, true);
      await tx.$executeRawUnsafe('DROP TABLE pg_temp."User"');
      await tx.$executeRawUnsafe('SET LOCAL search_path TO public');
      const developer = await tx.user.create({ data: { email: "fee-waiver-test@example.invalid", platformFeeWaived: true } });
      const creator = await tx.user.create({ data: { email: "fee-waiver-creator@example.invalid", emailVerified: new Date(), xpPoints: 200 } });
      await tx.clipProfile.create({ data: { userId: creator.id, bio: "A mobile testing creator.", portfolioUrl: "https://example.invalid", socialUrl: "https://example.invalid", specialties: "Mobile apps" } });
      const campaign = await tx.clipCampaign.create({ data: { developerId: developer.id, title: "Waived creator agreement", appUrl: "https://example.invalid", brief: "Create an original mobile app walkthrough with clear disclosure.", platform: "TIKTOK", feeCents: 5000 } });
      const item = await applyClip(tx, creator.id, campaign.id, "I create original mobile app walkthroughs.");
      assert.equal(item.feeCents, 5000);
      assert.equal(item.chargeCents, 5000);
      await tx.user.update({ where: { id: developer.id }, data: { platformFeeWaived: false } });
      assert.equal((await tx.clipEngagement.findUniqueOrThrow({ where: { id: item.id } })).chargeCents, 5000, "Existing agreement terms remain immutable.");
      throw rollback;
    }, { timeout: 60000 }), (error: unknown) => error === rollback);
  } finally {
    await prisma.$disconnect();
  }
});
