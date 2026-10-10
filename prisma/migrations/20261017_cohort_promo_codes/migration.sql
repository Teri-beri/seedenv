ALTER TABLE "AppCampaign"
  ADD COLUMN "platform_fee_discount_percent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "promo_code_draft" VARCHAR(40),
  ADD CONSTRAINT "AppCampaign_fee_discount_range" CHECK ("platform_fee_discount_percent" BETWEEN 0 AND 100);

CREATE TABLE "CohortPromoCode" (
  "id" TEXT PRIMARY KEY,
  "code" VARCHAR(40) NOT NULL UNIQUE,
  "discount_percent" INTEGER NOT NULL CHECK ("discount_percent" BETWEEN 1 AND 100),
  "max_redemptions" INTEGER NOT NULL CHECK ("max_redemptions" > 0),
  "reserved_count" INTEGER NOT NULL DEFAULT 0 CHECK ("reserved_count" >= 0 AND "reserved_count" <= "max_redemptions"),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CohortPromoCode_normalized_code" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$')
);

CREATE TABLE "CohortPromoRedemption" (
  "id" TEXT PRIMARY KEY,
  "promo_code_id" TEXT NOT NULL REFERENCES "CohortPromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "developer_id" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "campaign_id" TEXT NOT NULL UNIQUE REFERENCES "AppCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "discount_percent" INTEGER NOT NULL CHECK ("discount_percent" BETWEEN 1 AND 100),
  "consumed_at" TIMESTAMP(3),
  "payment_pending" BOOLEAN NOT NULL DEFAULT FALSE,
  "checkout_session_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CohortPromoRedemption_promo_code_id_developer_id_key" UNIQUE ("promo_code_id", "developer_id")
);
