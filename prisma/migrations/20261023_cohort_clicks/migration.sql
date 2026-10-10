CREATE TABLE "CohortClick" (
  "campaignId" TEXT NOT NULL REFERENCES "AppCampaign"("id") ON DELETE CASCADE,
  "visitorKey" TEXT NOT NULL,
  "day" VARCHAR(10) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("campaignId", "visitorKey", "day")
);
