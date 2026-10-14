DO $$ BEGIN
  CREATE TYPE "IncidentSeverity" AS ENUM ('INFO', 'WARN', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "User"
  ALTER COLUMN "notification_preferences"
  SET DEFAULT '{"email_tester_requests":true,"email_tester_feedback":true,"email_telemetry_incidents":true,"email_ledger_updates":true,"email_announcements":false}'::jsonb;

UPDATE "User"
SET "notification_preferences" = jsonb_set("notification_preferences", '{email_telemetry_incidents}', 'true'::jsonb, true)
WHERE NOT ("notification_preferences" ? 'email_telemetry_incidents');

CREATE TABLE IF NOT EXISTS "TelemetryIncident" (
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
);

CREATE INDEX IF NOT EXISTS "TelemetryIncident_cohortId_createdAt_idx" ON "TelemetryIncident"("cohortId", "createdAt");
CREATE INDEX IF NOT EXISTS "TelemetryIncident_cohortId_severity_createdAt_idx" ON "TelemetryIncident"("cohortId", "severity", "createdAt");
CREATE INDEX IF NOT EXISTS "TelemetryIncident_validatorId_createdAt_idx" ON "TelemetryIncident"("validatorId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "TelemetryIncident" ADD CONSTRAINT "TelemetryIncident_cohortId_fkey"
  FOREIGN KEY ("cohortId") REFERENCES "AppCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "TelemetryIncident" ADD CONSTRAINT "TelemetryIncident_validatorId_fkey"
  FOREIGN KEY ("validatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
