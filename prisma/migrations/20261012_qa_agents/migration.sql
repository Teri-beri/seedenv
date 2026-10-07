-- CreateEnum
CREATE TYPE "SubmissionAuditStatus" AS ENUM ('PENDING', 'APPROVED', 'NEEDS_CLARIFICATION', 'FLAGGED_FRAUD', 'REJECTED');

-- CreateEnum
CREATE TYPE "DropSpecStatus" AS ENUM ('DRAFT', 'GENERATING', 'READY');

-- CreateTable
CREATE TABLE "SubmissionAudit" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "status" "SubmissionAuditStatus" NOT NULL DEFAULT 'PENDING',
    "reproductionValid" BOOLEAN NOT NULL DEFAULT false,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicateRefId" TEXT,
    "missingFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "feedbackToTester" TEXT,
    "fraudRiskScore" INTEGER NOT NULL DEFAULT 0,
    "fraudFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fraudExplanation" TEXT,
    "mediaChecked" BOOLEAN NOT NULL DEFAULT false,
    "model" VARCHAR(80),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(1000),
    "autoClarifiedAt" TIMESTAMP(3),
    "humanClearedAt" TIMESTAMP(3),
    "humanClearedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignSynthesis" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "totalSubmissions" INTEGER NOT NULL,
    "validBugsCount" INTEGER NOT NULL,
    "p0Count" INTEGER NOT NULL,
    "p1Count" INTEGER NOT NULL,
    "p2Count" INTEGER NOT NULL,
    "executiveSummary" TEXT NOT NULL,
    "clusteredThemesJson" JSONB NOT NULL,
    "githubMarkdownExport" TEXT NOT NULL,
    "model" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignSynthesis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionAudit_submissionId_key" ON "SubmissionAudit"("submissionId");

-- CreateIndex
CREATE INDEX "SubmissionAudit_status_updatedAt_idx" ON "SubmissionAudit"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignSynthesis_campaignId_key" ON "CampaignSynthesis"("campaignId");

-- AddForeignKey
ALTER TABLE "SubmissionAudit" ADD CONSTRAINT "SubmissionAudit_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignSynthesis" ADD CONSTRAINT "CampaignSynthesis_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AppCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

