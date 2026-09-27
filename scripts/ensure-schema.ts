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
});
