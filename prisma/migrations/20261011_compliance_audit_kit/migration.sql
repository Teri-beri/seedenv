CREATE TABLE "CohortCompliance" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "targetDays" INTEGER NOT NULL DEFAULT 14,
    "requiredTesters" INTEGER NOT NULL DEFAULT 12,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CohortCompliance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyPingLog" (
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
);

CREATE UNIQUE INDEX "CohortCompliance_cohortId_key" ON "CohortCompliance"("cohortId");
CREATE INDEX "DailyPingLog_complianceId_dayNumber_idx" ON "DailyPingLog"("complianceId", "dayNumber");
ALTER TABLE "CohortCompliance" ADD CONSTRAINT "CohortCompliance_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "AppCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyPingLog" ADD CONSTRAINT "DailyPingLog_complianceId_fkey" FOREIGN KEY ("complianceId") REFERENCES "CohortCompliance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD COLUMN "github_default_repo" TEXT;
ALTER TABLE "AppCampaign" ADD COLUMN "launched_at" TIMESTAMP(3);
ALTER TABLE "AppCampaign" ADD COLUMN "fill_guarantee_credited_cents" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "AppCampaign_launched_at_idx" ON "AppCampaign"("launched_at");
