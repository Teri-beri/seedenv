ALTER TABLE "User" ADD COLUMN "developer_referral_code" TEXT UNIQUE;
ALTER TABLE "CohortPromoCode"
  ALTER COLUMN "expires_at" DROP NOT NULL,
  ADD COLUMN "owner_id" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppCampaign" ALTER COLUMN "promo_code_draft" TYPE VARCHAR(81);
ALTER TABLE "CohortPromoRedemption" DROP CONSTRAINT "CohortPromoRedemption_campaign_id_key";
CREATE INDEX "CohortPromoRedemption_campaign_id_idx" ON "CohortPromoRedemption"("campaign_id");
CREATE TABLE "DeveloperReferral" (
  "id" TEXT PRIMARY KEY,
  "inviter_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "developer_id" TEXT NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "qualified_at" TIMESTAMP(3),
  "qualified_campaign_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("inviter_id" <> "developer_id")
);
