ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'FUNDING_REVERSAL';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'FUNDING_RESTORATION';
ALTER TABLE "AppCampaign" ADD COLUMN IF NOT EXISTS "billing_hold_cents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "billing_operations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "kind" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "campaignId" TEXT,
  "ledgerId" TEXT,
  "paymentId" TEXT,
  "destinationId" TEXT,
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
  "feeCents" INTEGER NOT NULL DEFAULT 0,
  "state" TEXT NOT NULL DEFAULT 'RESERVED',
  "firstAttemptAt" TIMESTAMP(3),
  "remoteId" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "billing_operations_remoteId_key" ON "billing_operations"("remoteId");
CREATE INDEX "billing_operations_resourceId_state_idx" ON "billing_operations"("resourceId", "state");
CREATE INDEX "billing_operations_state_updatedAt_idx" ON "billing_operations"("state", "updatedAt");

CREATE TABLE "funding_reversals" (
  "paymentId" TEXT NOT NULL PRIMARY KEY,
  "reversedCents" INTEGER NOT NULL DEFAULT 0,
  "disputedCents" INTEGER NOT NULL DEFAULT 0,
  "appliedCents" INTEGER NOT NULL DEFAULT 0,
  "userId" TEXT,
  "campaignId" TEXT,
  "topUpId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "funding_reversals_topUpId_idx" ON "funding_reversals"("topUpId");

CREATE TABLE "funding_allocations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "topUpId" TEXT NOT NULL,
  "slotChargeId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL CHECK ("amountCents" > 0),
  "releasedCents" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "funding_allocations_topUpId_slotChargeId_key" ON "funding_allocations"("topUpId", "slotChargeId");
CREATE INDEX "funding_allocations_campaignId_idx" ON "funding_allocations"("campaignId");

-- Existing pending payouts may already exist remotely. They must be discovered,
-- never blindly recreated with a possibly expired Stripe idempotency key.
INSERT INTO "billing_operations"
  ("id", "kind", "resourceId", "userId", "campaignId", "ledgerId", "destinationId", "amountCents", "createdAt", "updatedAt")
SELECT 'seedenv-payout-' || w."id", 'LEGACY_PAYOUT', w."id", w."userId", w."campaignId", w."id", u."stripeConnectAccountId", w."amountCents", w."createdAt", CURRENT_TIMESTAMP
FROM "WalletTransaction" w JOIN "User" u ON u."id" = w."userId"
WHERE w."type" = 'BOUNTY_PAYOUT' AND w."status" = 'PENDING' AND w."amountCents" > 0;
