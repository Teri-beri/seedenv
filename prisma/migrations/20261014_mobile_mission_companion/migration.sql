ALTER TABLE "MissionPairSession"
  ADD COLUMN IF NOT EXISTS "device_profile" JSONB,
  ADD COLUMN IF NOT EXISTS "confirmed_device_model" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "recording_confirmed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3);
