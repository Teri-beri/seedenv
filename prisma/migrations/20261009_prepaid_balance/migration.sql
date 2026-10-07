ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'BALANCE_TOPUP';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'BALANCE_WITHDRAWAL';

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "funding_balance_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "auto_reload_cents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "balance_top_ups" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "credit_cents" INTEGER NOT NULL,
  "processing_fee_cents" INTEGER NOT NULL,
  "total_cents" INTEGER NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'CHECKOUT',
  "status" "SlotChargeStatus" NOT NULL DEFAULT 'PENDING',
  "campaign_id" TEXT,
  "stripe_checkout_session_id" TEXT,
  "stripe_payment_intent_id" TEXT,
  "refunded_cents" INTEGER NOT NULL DEFAULT 0,
  "transaction_id" TEXT,
  "failure_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "balance_top_ups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "balance_top_ups_stripe_checkout_session_id_key" ON "balance_top_ups"("stripe_checkout_session_id");
CREATE UNIQUE INDEX IF NOT EXISTS "balance_top_ups_stripe_payment_intent_id_key" ON "balance_top_ups"("stripe_payment_intent_id");
CREATE INDEX IF NOT EXISTS "balance_top_ups_user_id_status_idx" ON "balance_top_ups"("user_id", "status");
CREATE INDEX IF NOT EXISTS "balance_top_ups_status_created_at_idx" ON "balance_top_ups"("status", "created_at");

DO $$ BEGIN
  ALTER TABLE "balance_top_ups" ADD CONSTRAINT "balance_top_ups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
