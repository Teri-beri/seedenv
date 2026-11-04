ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'SUPPORT_REFUND';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'SUPPORT_CREDIT';

CREATE TABLE IF NOT EXISTS "refund_requests" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "walletTransactionId" TEXT NOT NULL,
    "campaignId" TEXT,
    "reason" VARCHAR(40) NOT NULL,
    "details" VARCHAR(4000) NOT NULL,
    "requestedCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "approvedCents" INTEGER,
    "adminId" TEXT,
    "adminNote" VARCHAR(2000),
    "billingOperationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "refund_requests_developerId_createdAt_idx" ON "refund_requests"("developerId", "createdAt");
CREATE INDEX IF NOT EXISTS "refund_requests_status_createdAt_idx" ON "refund_requests"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "refund_requests_walletTransactionId_idx" ON "refund_requests"("walletTransactionId");
