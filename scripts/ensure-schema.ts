import { PrismaClient } from "@prisma/client";

// Idempotent repairs so production never runs ahead of the database, even when `prisma migrate deploy` is skipped or blocked.
const statements = [
  `CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sessionKey" TEXT,
    "referrer" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "AnalyticsEvent_eventName_createdAt_idx" ON "AnalyticsEvent"("eventName", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AnalyticsEvent_path_createdAt_idx" ON "AnalyticsEvent"("path", "createdAt")`,
  `ALTER TABLE "AnalyticsEvent"
    ADD COLUMN IF NOT EXISTS "visitorId" TEXT,
    ADD COLUMN IF NOT EXISTS "source" TEXT,
    ADD COLUMN IF NOT EXISTS "country" TEXT,
    ADD COLUMN IF NOT EXISTS "device" TEXT,
    ADD COLUMN IF NOT EXISTS "browser" TEXT,
    ADD COLUMN IF NOT EXISTS "os" TEXT,
    ADD COLUMN IF NOT EXISTS "loadMs" INTEGER`,
  `CREATE INDEX IF NOT EXISTS "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt")`,
  `ALTER TABLE "Submission"
    ADD COLUMN IF NOT EXISTS "proofImageHash" TEXT,
    ADD COLUMN IF NOT EXISTS "recordingUrl" TEXT,
    ADD COLUMN IF NOT EXISTS "osBuild" TEXT,
    ADD COLUMN IF NOT EXISTS "deviceModel" TEXT,
    ADD COLUMN IF NOT EXISTS "screenResolution" TEXT,
    ADD COLUMN IF NOT EXISTS "appBuildVersion" TEXT,
    ADD COLUMN IF NOT EXISTS "networkType" TEXT,
    ADD COLUMN IF NOT EXISTS "crashLogs" TEXT,
    ADD COLUMN IF NOT EXISTS "networkLogs" TEXT`,
  `CREATE INDEX IF NOT EXISTS "Submission_proofImageHash_idx" ON "Submission"("proofImageHash")`,
  `ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "refresh_token_expires_in" INTEGER`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "session_version" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripe_onboarding_complete" BOOLEAN NOT NULL DEFAULT FALSE`,
  `UPDATE "User" SET "stripe_onboarding_complete" = TRUE WHERE "stripeConnectAccountId" IS NOT NULL AND "stripe_onboarding_complete" = FALSE`,
  `ALTER TABLE IF EXISTS "User" DROP COLUMN IF EXISTS "ssn"`,
  `ALTER TABLE IF EXISTS "User" DROP COLUMN IF EXISTS "ein"`,
  `ALTER TABLE IF EXISTS "User" DROP COLUMN IF EXISTS "tin"`,
  `ALTER TABLE IF EXISTS "User" DROP COLUMN IF EXISTS "taxForm"`,
  `ALTER TABLE IF EXISTS "User" DROP COLUMN IF EXISTS "tax_form"`,
  `ALTER TABLE IF EXISTS "ValidatorProfile" DROP COLUMN IF EXISTS "ssn"`,
  `ALTER TABLE IF EXISTS "ValidatorProfile" DROP COLUMN IF EXISTS "ein"`,
  `ALTER TABLE IF EXISTS "ValidatorProfile" DROP COLUMN IF EXISTS "tin"`,
  `ALTER TABLE IF EXISTS "ValidatorProfile" DROP COLUMN IF EXISTS "taxForm"`,
  `ALTER TABLE IF EXISTS "ValidatorProfile" DROP COLUMN IF EXISTS "tax_form"`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "platform_fee_waived" BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "launch_wizard_drafts" JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS "launch_wizard_draft_revision" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "AppCampaign" ADD COLUMN IF NOT EXISTS "platform_fee_discount_percent" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "AppCampaign" ADD COLUMN IF NOT EXISTS "promo_code_draft" VARCHAR(81)`,
  `ALTER TABLE "BillingProfile" ADD COLUMN IF NOT EXISTS "billingEmail" VARCHAR(254)`,
  `ALTER TABLE "User"
    ALTER COLUMN "bio" TYPE VARCHAR(200) USING left("bio", 200),
    ADD COLUMN IF NOT EXISTS "github_username" TEXT,
    ADD COLUMN IF NOT EXISTS "discord_url" TEXT,
    ADD COLUMN IF NOT EXISTS "twitter_handle" TEXT,
    ADD COLUMN IF NOT EXISTS "notification_preferences" JSONB NOT NULL DEFAULT '{"email_tester_requests":true,"email_tester_feedback":true,"email_telemetry_incidents":true,"email_ledger_updates":true,"email_announcements":false}'::jsonb,
    ADD COLUMN IF NOT EXISTS "discord_webhook_url" TEXT`,
  `ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "tester_workspace_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "developer_workspace_enabled" BOOLEAN NOT NULL DEFAULT FALSE`,
  `UPDATE "User" SET "tester_workspace_enabled" = TRUE WHERE "role" = 'TESTER' AND "tester_workspace_enabled" = FALSE`,
  `UPDATE "User" SET "developer_workspace_enabled" = TRUE WHERE "role" = 'DEVELOPER' AND "developer_workspace_enabled" = FALSE`,
  `UPDATE "User" SET "notification_preferences" = '{"email_tester_requests":true,"email_tester_feedback":true,"email_telemetry_incidents":true,"email_ledger_updates":true,"email_announcements":false}'::jsonb WHERE "notification_preferences" IS NULL`,
  `UPDATE "User" SET "notification_preferences" = jsonb_set("notification_preferences", '{email_telemetry_incidents}', 'true'::jsonb, true) WHERE NOT ("notification_preferences" ? 'email_telemetry_incidents')`,
  `ALTER TABLE "User" ALTER COLUMN "notification_preferences" SET DEFAULT '{"email_tester_requests":true,"email_tester_feedback":true,"email_telemetry_incidents":true,"email_ledger_updates":true,"email_announcements":false}'::jsonb`,
  `ALTER TABLE "User" ALTER COLUMN "notification_preferences" SET NOT NULL`,
  `DO $$ BEGIN CREATE TYPE "CommunityPostTag" AS ENUM ('CHANGELOG', 'NEED_VALIDATION', 'BUG_FIX'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN CREATE TYPE "CommunityCommentTag" AS ENUM ('GENERAL_FEEDBACK', 'REPRO_LOG', 'DEVICE_CONFIRMED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE "CommunityPost"
    ADD COLUMN IF NOT EXISTS "tag" "CommunityPostTag" NOT NULL DEFAULT 'CHANGELOG',
    ADD COLUMN IF NOT EXISTS "campaign_id" TEXT,
    ADD COLUMN IF NOT EXISTS "build_label" VARCHAR(40)`,
  `DO $$ BEGIN ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "AppCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE INDEX IF NOT EXISTS "CommunityPost_campaign_id_createdAt_idx" ON "CommunityPost"("campaign_id", "createdAt")`,
  `ALTER TABLE "CommunityComment"
    ADD COLUMN IF NOT EXISTS "tag" "CommunityCommentTag" NOT NULL DEFAULT 'GENERAL_FEEDBACK',
    ADD COLUMN IF NOT EXISTS "device_label" VARCHAR(60)`,
  `CREATE TABLE IF NOT EXISTS "CommunityPostHelpful" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityPostHelpful_pkey" PRIMARY KEY ("postId", "userId")
  )`,
  `CREATE INDEX IF NOT EXISTS "CommunityPostHelpful_userId_idx" ON "CommunityPostHelpful"("userId")`,
  `DO $$ BEGIN ALTER TABLE "CommunityPostHelpful" ADD CONSTRAINT "CommunityPostHelpful_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN ALTER TABLE "CommunityPostHelpful" ADD CONSTRAINT "CommunityPostHelpful_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "CohortCompliance" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "targetDays" INTEGER NOT NULL DEFAULT 14,
    "requiredTesters" INTEGER NOT NULL DEFAULT 12,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CohortCompliance_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "DailyPingLog" (
    "id" TEXT NOT NULL,
    "complianceId" TEXT NOT NULL,
    "validatorId" TEXT NOT NULL,
    "validatorHandle" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "deviceModel" TEXT NOT NULL,
    "osVersion" TEXT NOT NULL,
    "sessionDuration" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyPingLog_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CohortCompliance_cohortId_key" ON "CohortCompliance"("cohortId")`,
  `CREATE INDEX IF NOT EXISTS "DailyPingLog_complianceId_dayNumber_idx" ON "DailyPingLog"("complianceId", "dayNumber")`,
  `DO $$ BEGIN ALTER TABLE "CohortCompliance" ADD CONSTRAINT "CohortCompliance_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "AppCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN ALTER TABLE "DailyPingLog" ADD CONSTRAINT "DailyPingLog_complianceId_fkey" FOREIGN KEY ("complianceId") REFERENCES "CohortCompliance"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "github_default_repo" TEXT`,
  `ALTER TABLE "AppCampaign"
    ADD COLUMN IF NOT EXISTS "launched_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "fill_guarantee_credited_cents" INTEGER NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS "AppCampaign_launched_at_idx" ON "AppCampaign"("launched_at")`,
  `ALTER TYPE "PlatformType" ADD VALUE IF NOT EXISTS 'ROBLOX_EXPERIENCE'`,
  `DO $$ BEGIN CREATE TYPE "RobloxAuditFocus" AS ENUM ('MOBILE_GUI_SCALING', 'LOW_END_MEMORY_THROTTLE', 'CONCURRENT_SERVER_STRESS', 'DATASTORE_EXPLOIT_VERIFICATION', 'CONSOLE_CONTROLLER_MAPPING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE "AppCampaign"
    ADD COLUMN IF NOT EXISTS "roblox_experience_url" TEXT,
    ADD COLUMN IF NOT EXISTS "roblox_universe_id" TEXT,
    ADD COLUMN IF NOT EXISTS "roblox_place_id" TEXT,
    ADD COLUMN IF NOT EXISTS "roblox_audit_focus" "RobloxAuditFocus",
    ADD COLUMN IF NOT EXISTS "min_memory_gb" INTEGER,
    ADD COLUMN IF NOT EXISTS "roblox_device_constraints" JSONB`,
  `ALTER TABLE "Submission"
    ADD COLUMN IF NOT EXISTS "roblox_username" TEXT,
    ADD COLUMN IF NOT EXISTS "roblox_checklist" JSONB`,
  `DO $$ BEGIN CREATE TYPE "IncidentSeverity" AS ENUM ('INFO', 'WARN', 'CRITICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "TelemetryIncident" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "validatorId" TEXT,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'WARN',
    "statusCode" VARCHAR(64) NOT NULL,
    "endpoint" VARCHAR(300),
    "deviceModel" VARCHAR(120) NOT NULL,
    "osVersion" VARCHAR(120) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "payloadSnapshot" JSONB,
    "github_issue_url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelemetryIncident_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "TelemetryIncident_cohortId_createdAt_idx" ON "TelemetryIncident"("cohortId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "TelemetryIncident_cohortId_severity_createdAt_idx" ON "TelemetryIncident"("cohortId", "severity", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "TelemetryIncident_validatorId_createdAt_idx" ON "TelemetryIncident"("validatorId", "createdAt")`,
  `DO $$ BEGIN ALTER TABLE "TelemetryIncident" ADD CONSTRAINT "TelemetryIncident_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "AppCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN ALTER TABLE "TelemetryIncident" ADD CONSTRAINT "TelemetryIncident_validatorId_fkey" FOREIGN KEY ("validatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "MissionPairSession" (
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
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MissionPairSession_token_hash_key" ON "MissionPairSession"("token_hash")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "MissionPairSession_channel_key_key" ON "MissionPairSession"("channel_key")`,
  `CREATE INDEX IF NOT EXISTS "MissionPairSession_submissionId_expiresAt_idx" ON "MissionPairSession"("submissionId", "expires_at")`,
  `CREATE INDEX IF NOT EXISTS "MissionPairSession_testerId_expiresAt_idx" ON "MissionPairSession"("testerId", "expires_at")`,
  `DO $$ BEGIN ALTER TABLE "MissionPairSession" ADD CONSTRAINT "MissionPairSession_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN ALTER TABLE "MissionPairSession" ADD CONSTRAINT "MissionPairSession_testerId_fkey" FOREIGN KEY ("testerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `ALTER TABLE "MissionPairSession"
    ADD COLUMN IF NOT EXISTS "device_profile" JSONB,
    ADD COLUMN IF NOT EXISTS "confirmed_device_model" VARCHAR(120),
    ADD COLUMN IF NOT EXISTS "recording_confirmed_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "proof_submitted_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3)`,
  `ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "app_rating" INTEGER`,
  `DO $$ BEGIN ALTER TABLE "Submission" ADD CONSTRAINT "Submission_app_rating_check" CHECK ("app_rating" IS NULL OR ("app_rating" >= 1 AND "app_rating" <= 5)); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

async function main() {
  const prisma = new PrismaClient();
  try {
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
    console.log("SeedEnv schema check complete.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("SeedEnv schema check failed:", error);
  process.exitCode = 1;
});
