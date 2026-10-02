ALTER TABLE "User"
  ALTER COLUMN "bio" TYPE VARCHAR(200) USING left("bio", 200),
  ADD COLUMN IF NOT EXISTS "github_username" TEXT,
  ADD COLUMN IF NOT EXISTS "discord_url" TEXT,
  ADD COLUMN IF NOT EXISTS "twitter_handle" TEXT,
  ADD COLUMN IF NOT EXISTS "notification_preferences" JSONB NOT NULL DEFAULT '{"email_tester_feedback":true,"email_ledger_updates":true,"email_announcements":false}'::jsonb,
  ADD COLUMN IF NOT EXISTS "discord_webhook_url" TEXT;

UPDATE "User"
SET "notification_preferences" = '{"email_tester_feedback":true,"email_ledger_updates":true,"email_announcements":false}'::jsonb
WHERE "notification_preferences" IS NULL;

ALTER TABLE "User" ALTER COLUMN "notification_preferences" SET NOT NULL;