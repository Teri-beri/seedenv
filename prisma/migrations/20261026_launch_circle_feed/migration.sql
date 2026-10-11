CREATE TYPE "CommunityPostTag" AS ENUM ('CHANGELOG', 'NEED_VALIDATION', 'BUG_FIX');
CREATE TYPE "CommunityCommentTag" AS ENUM ('GENERAL_FEEDBACK', 'REPRO_LOG', 'DEVICE_CONFIRMED');

ALTER TABLE "CommunityPost"
  ADD COLUMN "tag" "CommunityPostTag" NOT NULL DEFAULT 'CHANGELOG',
  ADD COLUMN "campaign_id" TEXT,
  ADD COLUMN "build_label" VARCHAR(40);
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "AppCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "CommunityPost_campaign_id_createdAt_idx" ON "CommunityPost" ("campaign_id", "createdAt");

ALTER TABLE "CommunityComment"
  ADD COLUMN "tag" "CommunityCommentTag" NOT NULL DEFAULT 'GENERAL_FEEDBACK',
  ADD COLUMN "device_label" VARCHAR(60);

CREATE TABLE "CommunityPostHelpful" (
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityPostHelpful_pkey" PRIMARY KEY ("postId", "userId")
);
CREATE INDEX "CommunityPostHelpful_userId_idx" ON "CommunityPostHelpful" ("userId");
ALTER TABLE "CommunityPostHelpful" ADD CONSTRAINT "CommunityPostHelpful_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityPostHelpful" ADD CONSTRAINT "CommunityPostHelpful_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
