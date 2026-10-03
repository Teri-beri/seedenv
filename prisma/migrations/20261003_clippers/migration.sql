-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'CLIPPER_DEPOSIT';
ALTER TYPE "TransactionType" ADD VALUE 'CLIPPER_PAYOUT';
ALTER TYPE "TransactionType" ADD VALUE 'CLIPPER_REFUND';

-- CreateTable
CREATE TABLE "ClipProfile" (
    "userId" TEXT NOT NULL,
    "bio" VARCHAR(1000) NOT NULL,
    "portfolioUrl" TEXT NOT NULL,
    "socialUrl" TEXT NOT NULL,
    "specialties" VARCHAR(200) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClipProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ClipCampaign" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "appUrl" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "revisionLimit" INTEGER NOT NULL DEFAULT 2,
    "deliveryDays" INTEGER NOT NULL DEFAULT 7,
    "liveDays" INTEGER NOT NULL DEFAULT 30,
    "minimumRep" INTEGER NOT NULL DEFAULT 0,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClipCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClipEngagement" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "note" VARCHAR(1500) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "feeCents" INTEGER NOT NULL,
    "chargeCents" INTEGER NOT NULL,
    "termsVersion" TEXT NOT NULL DEFAULT 'clippers-v1-organic-90',
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "reviewNote" TEXT,
    "dueAt" TIMESTAMP(3),
    "reviewDueAt" TIMESTAMP(3),
    "publishDueAt" TIMESTAMP(3),
    "checkoutId" TEXT,
    "fundingAttempt" INTEGER NOT NULL DEFAULT 0,
    "paymentIntentId" TEXT,
    "transferId" TEXT,
    "payoutTransactionId" TEXT,
    "payoutDestinationId" TEXT,
    "refundId" TEXT,
    "draftId" TEXT,
    "approvedDraftId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "proofId" TEXT,
    "publicationUrl" TEXT,
    "publicationId" TEXT,
    "publicationCode" TEXT NOT NULL,
    "verificationMethod" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "lastVerificationAt" TIMESTAMP(3),
    "fundedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "licenseEndsAt" TIMESTAMP(3),
    "disputeReason" VARCHAR(1500),
    "disputeOpenedBy" TEXT,
    "statusBeforeDispute" TEXT,
    "moderationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClipEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClipMessage" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClipMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClipAsset" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "engagementId" TEXT,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClipAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClipSocialAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClipSocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClipOAuthState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClipOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClipCampaign_open_createdAt_idx" ON "ClipCampaign"("open", "createdAt");

-- CreateIndex
CREATE INDEX "ClipCampaign_developerId_createdAt_idx" ON "ClipCampaign"("developerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClipEngagement_checkoutId_key" ON "ClipEngagement"("checkoutId");

-- CreateIndex
CREATE UNIQUE INDEX "ClipEngagement_paymentIntentId_key" ON "ClipEngagement"("paymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClipEngagement_transferId_key" ON "ClipEngagement"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "ClipEngagement_payoutTransactionId_key" ON "ClipEngagement"("payoutTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "ClipEngagement_refundId_key" ON "ClipEngagement"("refundId");

-- CreateIndex
CREATE UNIQUE INDEX "ClipEngagement_publicationCode_key" ON "ClipEngagement"("publicationCode");

-- CreateIndex
CREATE INDEX "ClipEngagement_creatorId_updatedAt_idx" ON "ClipEngagement"("creatorId", "updatedAt");

-- CreateIndex
CREATE INDEX "ClipEngagement_campaignId_status_idx" ON "ClipEngagement"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClipEngagement_campaignId_creatorId_key" ON "ClipEngagement"("campaignId", "creatorId");

-- CreateIndex
CREATE INDEX "ClipMessage_campaignId_createdAt_idx" ON "ClipMessage"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "ClipMessage_authorId_createdAt_idx" ON "ClipMessage"("authorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClipAsset_path_key" ON "ClipAsset"("path");

-- CreateIndex
CREATE INDEX "ClipAsset_campaignId_kind_createdAt_idx" ON "ClipAsset"("campaignId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ClipAsset_ownerId_createdAt_idx" ON "ClipAsset"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClipSocialAccount_provider_providerId_key" ON "ClipSocialAccount"("provider", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ClipSocialAccount_userId_provider_key" ON "ClipSocialAccount"("userId", "provider");

-- CreateIndex
CREATE INDEX "ClipOAuthState_expiresAt_idx" ON "ClipOAuthState"("expiresAt");

-- AddForeignKey
ALTER TABLE "ClipProfile" ADD CONSTRAINT "ClipProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipCampaign" ADD CONSTRAINT "ClipCampaign_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipEngagement" ADD CONSTRAINT "ClipEngagement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ClipCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipEngagement" ADD CONSTRAINT "ClipEngagement_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipMessage" ADD CONSTRAINT "ClipMessage_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ClipCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipMessage" ADD CONSTRAINT "ClipMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipAsset" ADD CONSTRAINT "ClipAsset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ClipCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipAsset" ADD CONSTRAINT "ClipAsset_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "ClipEngagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipAsset" ADD CONSTRAINT "ClipAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipSocialAccount" ADD CONSTRAINT "ClipSocialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClipOAuthState" ADD CONSTRAINT "ClipOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
