ALTER TABLE "AppCampaign" ADD COLUMN IF NOT EXISTS "estimated_minutes" INTEGER;
ALTER TABLE "AppCampaign" ADD COLUMN IF NOT EXISTS "tester_perk" VARCHAR(80);
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Submission_status_submitted_at_idx" ON "Submission"("status", "submitted_at");
