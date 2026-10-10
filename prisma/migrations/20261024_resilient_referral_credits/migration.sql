BEGIN;
ALTER TABLE "User" ADD COLUMN "referredById" TEXT REFERENCES "User"("id") ON DELETE RESTRICT;
UPDATE "User" SET "referralCode" = upper(md5("id")) WHERE "referralCode" IS NULL;
ALTER TABLE "User" ALTER COLUMN "referralCode" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_no_self_referral" CHECK ("referredById" IS DISTINCT FROM "id");
UPDATE "User" u SET "referredById" = r."inviter_id" FROM "DeveloperReferral" r WHERE r."developer_id" = u."id";

-- Fail the migration rather than silently break an already-circular historical graph.
DO $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE edges AS (
      SELECT "id" AS start_id, "referredById" AS next_id, ARRAY["id"] AS path, false AS cycle FROM "User" WHERE "referredById" IS NOT NULL
      UNION ALL
      SELECT e.start_id, u."referredById", e.path || u."id", u."id" = ANY(e.path)
      FROM edges e JOIN "User" u ON u."id" = e.next_id WHERE NOT e.cycle
    ) SELECT 1 FROM edges WHERE cycle
  ) THEN RAISE EXCEPTION 'Historical developer referral cycle requires operator review before migration'; END IF;
END $$;

CREATE FUNCTION seedenv_guard_referrer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Global transaction lock serializes graph attachment, including direct database writes.
  PERFORM pg_advisory_xact_lock(7243102401);
  IF TG_OP = 'UPDATE' AND OLD."referredById" IS NOT NULL AND NEW."referredById" IS DISTINCT FROM OLD."referredById" THEN
    RAISE EXCEPTION 'Referrer is immutable';
  END IF;
  IF NEW."referredById" IS NOT NULL AND EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT "id", "referredById" FROM "User" WHERE "id" = NEW."referredById"
      UNION
      SELECT u."id", u."referredById" FROM "User" u JOIN ancestors a ON u."id" = a."referredById"
    ) SELECT 1 FROM ancestors WHERE "id" = NEW."id"
  ) THEN RAISE EXCEPTION 'Circular referrals are prohibited'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "User_referrer_guard" BEFORE INSERT OR UPDATE OF "referredById" ON "User" FOR EACH ROW EXECUTE FUNCTION seedenv_guard_referrer();
CREATE FUNCTION seedenv_sync_developer_referrer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW."inviter_id" IS DISTINCT FROM OLD."inviter_id" OR NEW."developer_id" IS DISTINCT FROM OLD."developer_id") THEN
    RAISE EXCEPTION 'Developer referral identity is immutable';
  END IF;
  UPDATE "User" SET "referredById" = NEW."inviter_id" WHERE "id" = NEW."developer_id";
  RETURN NEW;
END $$;
CREATE TRIGGER "DeveloperReferral_graph_guard" BEFORE INSERT OR UPDATE OF "inviter_id", "developer_id" ON "DeveloperReferral" FOR EACH ROW EXECUTE FUNCTION seedenv_sync_developer_referrer();

CREATE TYPE "CreditStatus" AS ENUM ('PENDING', 'VESTED', 'REDEEMED', 'REVOKED', 'EXPIRED');
CREATE TABLE "FeeCredit" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "amountCents" INTEGER NOT NULL DEFAULT 0, "discountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
  "percentageRate" DOUBLE PRECISION DEFAULT 0.5, "status" "CreditStatus" NOT NULL DEFAULT 'PENDING',
  "sourceReferralId" TEXT NOT NULL UNIQUE, "qualifyingDropId" TEXT NOT NULL, "reservedDropId" TEXT,
  "redeemedDropId" TEXT, "redeemedDiscountCents" INTEGER NOT NULL DEFAULT 0, "clawbackCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "vestedAt" TIMESTAMP(3), "redeemedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3),
  CONSTRAINT "FeeCredit_nonnegative" CHECK ("amountCents" >= 0 AND "redeemedDiscountCents" >= 0 AND "clawbackCents" >= 0),
  CONSTRAINT "FeeCredit_percentage_policy" CHECK ("discountType" = 'PERCENTAGE' AND "percentageRate" = 0.5)
);
CREATE INDEX "FeeCredit_userId_status_idx" ON "FeeCredit"("userId", "status");
CREATE INDEX "FeeCredit_qualifyingDropId_idx" ON "FeeCredit"("qualifyingDropId");
CREATE INDEX "FeeCredit_reservedDropId_idx" ON "FeeCredit"("reservedDropId");
CREATE INDEX "FeeCredit_redeemedDropId_idx" ON "FeeCredit"("redeemedDropId");
CREATE TABLE "FirstCohortBenefit" (
  "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE RESTRICT, "campaignId" TEXT NOT NULL UNIQUE,
  "fundedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "TestFlightBuild" (
  "joinToken" TEXT PRIMARY KEY, "developerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "originalCampaignId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Query strings and trailing slashes do not change the join-token identity. Prefer
-- original funded cohorts, then the earliest saved cohort when importing history.
INSERT INTO "TestFlightBuild" ("joinToken", "developerId", "originalCampaignId")
SELECT DISTINCT ON (token) token, "developerId", "id"
FROM (
 SELECT c.*, (regexp_match(c."appUrl", '^https://testflight[.]apple[.]com/join/([A-Za-z0-9]{8})/?([?#].*)?$', 'i'))[1] AS token,
 EXISTS (SELECT 1 FROM "WalletTransaction" t WHERE t."campaignId" = c."id" AND t."type" = 'ESCROW_DEPOSIT' AND t."status" = 'COMPLETED') AS funded
 FROM "AppCampaign" c WHERE c."platform" = 'TESTFLIGHT'
) builds WHERE token IS NOT NULL ORDER BY token, funded DESC, "createdAt", "id";
ALTER TABLE "AppCampaign" ADD COLUMN "referralPolicyVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AppCampaign" ADD COLUMN "firstCohortFeeWaived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AppCampaign" ADD COLUMN "referralDiscountPercent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AppCampaign" ADD COLUMN "promoDiscountPercent" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "ReferralAudit" (
  "id" TEXT PRIMARY KEY, "eventKey" TEXT NOT NULL UNIQUE, "userId" TEXT NOT NULL, "campaignId" TEXT, "creditId" TEXT,
  "amountCents" INTEGER NOT NULL DEFAULT 0, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ReferralAudit_userId_createdAt_idx" ON "ReferralAudit"("userId", "createdAt");
COMMIT;
