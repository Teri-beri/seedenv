ALTER TABLE "WalletTransaction"
  ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "platformFeeCents" INTEGER,
  ADD COLUMN "invoiceSnapshot" JSONB;

ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "AppCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "WalletTransaction_campaignId_idx" ON "WalletTransaction"("campaignId");

CREATE TABLE "BillingProfile" (
  "userId" TEXT NOT NULL,
  "companyName" VARCHAR(150) NOT NULL,
  "taxId" VARCHAR(80),
  "addressLine1" VARCHAR(200) NOT NULL,
  "addressLine2" VARCHAR(200),
  "city" VARCHAR(100) NOT NULL,
  "region" VARCHAR(100),
  "postalCode" VARCHAR(30) NOT NULL,
  "country" VARCHAR(2) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingProfile_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "BillingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SupportTicket" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "category" VARCHAR(40) NOT NULL,
  "subject" VARCHAR(150) NOT NULL,
  "message" VARCHAR(5000) NOT NULL,
  "route" VARCHAR(1000) NOT NULL,
  "userAgent" VARCHAR(500) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SupportTicket_userId_createdAt_idx" ON "SupportTicket"("userId", "createdAt");
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");