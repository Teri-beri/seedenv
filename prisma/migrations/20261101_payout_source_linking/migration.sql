ALTER TABLE "billing_operations"
  ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sourceChargeId" TEXT;
CREATE INDEX "billing_operations_sourceChargeId_idx" ON "billing_operations" ("sourceChargeId");
