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
    ADD COLUMN IF NOT EXISTS "notification_preferences" JSONB NOT NULL DEFAULT '{"email_tester_feedback":true,"email_ledger_updates":true,"email_announcements":false}'::jsonb,
    ADD COLUMN IF NOT EXISTS "discord_webhook_url" TEXT`,
  `ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "tester_workspace_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS "developer_workspace_enabled" BOOLEAN NOT NULL DEFAULT FALSE`,
  `UPDATE "User" SET "tester_workspace_enabled" = TRUE WHERE "role" = 'TESTER' AND "tester_workspace_enabled" = FALSE`,
  `UPDATE "User" SET "developer_workspace_enabled" = TRUE WHERE "role" = 'DEVELOPER' AND "developer_workspace_enabled" = FALSE`,
  `UPDATE "User" SET "notification_preferences" = '{"email_tester_feedback":true,"email_ledger_updates":true,"email_announcements":false}'::jsonb WHERE "notification_preferences" IS NULL`,
  `ALTER TABLE "User" ALTER COLUMN "notification_preferences" SET NOT NULL`,
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
