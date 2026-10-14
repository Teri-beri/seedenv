CREATE TABLE IF NOT EXISTS "MissionPairSession" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "testerId" TEXT NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "channel_key" VARCHAR(64) NOT NULL,
  "active_step" INTEGER NOT NULL DEFAULT 0,
  "completed_steps" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "compact" BOOLEAN NOT NULL DEFAULT FALSE,
  "connected_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MissionPairSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MissionPairSession_token_hash_key" ON "MissionPairSession"("token_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "MissionPairSession_channel_key_key" ON "MissionPairSession"("channel_key");
CREATE INDEX IF NOT EXISTS "MissionPairSession_submissionId_expiresAt_idx" ON "MissionPairSession"("submissionId", "expires_at");
CREATE INDEX IF NOT EXISTS "MissionPairSession_testerId_expiresAt_idx" ON "MissionPairSession"("testerId", "expires_at");

DO $$ BEGIN
  ALTER TABLE "MissionPairSession" ADD CONSTRAINT "MissionPairSession_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "MissionPairSession" ADD CONSTRAINT "MissionPairSession_testerId_fkey"
  FOREIGN KEY ("testerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
