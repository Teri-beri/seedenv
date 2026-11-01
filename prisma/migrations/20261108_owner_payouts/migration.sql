CREATE TABLE "owner_payouts" (
  "id" TEXT NOT NULL,
  "weekKey" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "taxSetAsideCents" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "stripePayoutId" TEXT,
  "breakdown" JSONB NOT NULL,
  "error" TEXT,
  "notifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "owner_payouts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "owner_payouts_weekKey_key" ON "owner_payouts"("weekKey");
CREATE UNIQUE INDEX "owner_payouts_stripePayoutId_key" ON "owner_payouts"("stripePayoutId");
CREATE INDEX "owner_payouts_status_createdAt_idx" ON "owner_payouts"("status", "createdAt");
