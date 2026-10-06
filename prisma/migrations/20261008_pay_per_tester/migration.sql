ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'ESCROW_REFUND';

DO $$ BEGIN
  CREATE TYPE "CohortFundingModel" AS ENUM ('PREPAID', 'PAY_PER_TESTER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SlotChargeStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "AppCampaign" ADD COLUMN IF NOT EXISTS "funding_model" "CohortFundingModel" NOT NULL DEFAULT 'PREPAID';
ALTER TABLE "AppCampaign" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
ALTER TABLE "AppCampaign" ADD COLUMN IF NOT EXISTS "refunded_cents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "slot_charges" (
  "id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "application_id" TEXT,
  "stipend_cents" INTEGER NOT NULL,
  "platform_fee_cents" INTEGER NOT NULL,
  "processing_fee_cents" INTEGER NOT NULL,
  "total_cents" INTEGER NOT NULL,
  "status" "SlotChargeStatus" NOT NULL DEFAULT 'PENDING',
  "stripe_payment_intent_id" TEXT,
  "stripe_refund_id" TEXT,
  "transaction_id" TEXT,
  "failure_reason" TEXT,
  "refunded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "slot_charges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "slot_charges_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "AppCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "slot_charges_stripe_payment_intent_id_key" ON "slot_charges"("stripe_payment_intent_id");
CREATE INDEX IF NOT EXISTS "slot_charges_campaign_id_status_idx" ON "slot_charges"("campaign_id", "status");
CREATE INDEX IF NOT EXISTS "slot_charges_status_created_at_idx" ON "slot_charges"("status", "created_at");
