ALTER TABLE "AppCampaign"
  ADD COLUMN IF NOT EXISTS "roblox_place_id" TEXT,
  ADD COLUMN IF NOT EXISTS "roblox_device_constraints" JSONB;

ALTER TABLE "Submission"
  ADD COLUMN IF NOT EXISTS "roblox_username" TEXT,
  ADD COLUMN IF NOT EXISTS "roblox_checklist" JSONB;
