ALTER TABLE "Submission"
  ADD COLUMN "recordingUrl" TEXT,
  ADD COLUMN "osBuild" TEXT,
  ADD COLUMN "deviceModel" TEXT,
  ADD COLUMN "screenResolution" TEXT,
  ADD COLUMN "appBuildVersion" TEXT,
  ADD COLUMN "networkType" TEXT,
  ADD COLUMN "crashLogs" TEXT,
  ADD COLUMN "networkLogs" TEXT;
