CREATE TYPE "ClipProfileStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

ALTER TABLE "ClipProfile"
  ADD COLUMN "genres" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "tiktokUrl" TEXT,
  ADD COLUMN "instagramUrl" TEXT,
  ADD COLUMN "youtubeUrl" TEXT,
  ADD COLUMN "status" "ClipProfileStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "available" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewNote" VARCHAR(1500);

ALTER TABLE "ClipEngagement"
  ALTER COLUMN "termsAcceptedAt" DROP NOT NULL,
  ADD COLUMN "invitationNote" VARCHAR(1500),
  ADD COLUMN "invitedAt" TIMESTAMP(3),
  ADD COLUMN "invitationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "profileSnapshot" JSONB;

ALTER TABLE "ClipMessage" ADD COLUMN "engagementId" TEXT;
ALTER TABLE "ClipMessage" ADD CONSTRAINT "ClipMessage_engagementId_fkey"
  FOREIGN KEY ("engagementId") REFERENCES "ClipEngagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ClipProfile_status_submittedAt_idx" ON "ClipProfile"("status", "submittedAt");
CREATE INDEX "ClipMessage_engagementId_createdAt_idx" ON "ClipMessage"("engagementId", "createdAt");
