CREATE TYPE "BugSeverity" AS ENUM ('CRITICAL', 'MAJOR', 'MINOR');
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'REFERRAL_REWARD';
ALTER TABLE "Submission"
  ADD COLUMN "bugTitle" VARCHAR(160),
  ADD COLUMN "bugSeverity" "BugSeverity",
  ADD COLUMN "reproSteps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "approvedById" TEXT;
ALTER TABLE "Referral"
  ADD COLUMN "rewardedAt" TIMESTAMP(3),
  ADD COLUMN "rewardTransactionId" TEXT;
CREATE UNIQUE INDEX "Referral_rewardTransactionId_key" ON "Referral"("rewardTransactionId");
CREATE TABLE "PublicBugReport" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "isPublic" BOOLEAN NOT NULL DEFAULT FALSE,
  "title" VARCHAR(160) NOT NULL,
  "severity" "BugSeverity" NOT NULL,
  "summary" VARCHAR(2000) NOT NULL,
  "reproSteps" TEXT[] NOT NULL,
  "deviceModel" VARCHAR(120) NOT NULL,
  "osVersion" VARCHAR(120) NOT NULL,
  "viewport" VARCHAR(80) NOT NULL,
  "hardwareStatus" "HardwareIntegrity" NOT NULL,
  "proofImageUrl" TEXT,
  "recordingUrl" TEXT,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicBugReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PublicBugReport_submissionId_fkey" FOREIGN KEY ("submissionId")
    REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PublicBugReport_submissionId_key" ON "PublicBugReport"("submissionId");
CREATE INDEX "PublicBugReport_isPublic_updatedAt_idx" ON "PublicBugReport"("isPublic", "updatedAt");
