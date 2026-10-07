DO $$ BEGIN CREATE TYPE "ContentDropStatus" AS ENUM ('RESEARCHING', 'DRAFTED', 'APPROVED', 'PUBLISHED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SocialPlatform" AS ENUM ('TWITTER', 'LINKEDIN', 'INSTAGRAM'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SocialQueueStatus" AS ENUM ('PENDING_APPROVAL', 'QUEUED', 'PUBLISHED', 'REJECTED', 'FAILED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "AdAuditAction" AS ENUM ('MAINTAINED', 'ALERTED', 'PAUSED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "content_drops" (
  "id" TEXT NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "target_keyword" VARCHAR(200) NOT NULL,
  "slug" VARCHAR(120) NOT NULL,
  "status" "ContentDropStatus" NOT NULL DEFAULT 'RESEARCHING',
  "markdown_body" TEXT,
  "metadata" JSONB,
  "research" JSONB,
  "review_note" VARCHAR(1000),
  "external_url" VARCHAR(1000),
  "approved_at" TIMESTAMP(3),
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_drops_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "content_drops_slug_key" ON "content_drops"("slug");
CREATE INDEX IF NOT EXISTS "content_drops_status_created_at_idx" ON "content_drops"("status", "created_at");
CREATE INDEX IF NOT EXISTS "content_drops_target_keyword_idx" ON "content_drops"("target_keyword");

CREATE TABLE IF NOT EXISTS "social_queue" (
  "id" TEXT NOT NULL,
  "content_drop_id" TEXT,
  "platform" "SocialPlatform" NOT NULL,
  "post_text" VARCHAR(3000) NOT NULL,
  "media_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "scheduled_time" TIMESTAMP(3) NOT NULL,
  "status" "SocialQueueStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "external_id" VARCHAR(200),
  "last_error" VARCHAR(1000),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "social_queue_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "social_queue_status_scheduled_time_idx" ON "social_queue"("status", "scheduled_time");
CREATE INDEX IF NOT EXISTS "social_queue_content_drop_id_idx" ON "social_queue"("content_drop_id");
DO $$ BEGIN
  ALTER TABLE "social_queue" ADD CONSTRAINT "social_queue_content_drop_id_fkey" FOREIGN KEY ("content_drop_id") REFERENCES "content_drops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "ad_audits" (
  "id" TEXT NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "campaign_id" VARCHAR(120) NOT NULL,
  "campaign_name" VARCHAR(300) NOT NULL,
  "spend" DECIMAL(12,2) NOT NULL,
  "impressions" INTEGER NOT NULL,
  "conversions" INTEGER NOT NULL,
  "cpa" DECIMAL(12,2),
  "threshold_cpa" DECIMAL(12,2) NOT NULL,
  "action_taken" "AdAuditAction" NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ad_audits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ad_audits_campaign_id_timestamp_idx" ON "ad_audits"("campaign_id", "timestamp");
CREATE INDEX IF NOT EXISTS "ad_audits_action_taken_timestamp_idx" ON "ad_audits"("action_taken", "timestamp");
