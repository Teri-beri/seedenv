BEGIN;
ALTER TABLE "AppCampaign" ADD COLUMN "fundingCheckoutSessionId" TEXT;
ALTER TABLE "AppCampaign" ADD COLUMN "fundingCheckoutAttemptId" TEXT;
CREATE UNIQUE INDEX "AppCampaign_fundingCheckoutSessionId_key" ON "AppCampaign"("fundingCheckoutSessionId");
ALTER TABLE "FeeCredit" ADD COLUMN "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "FeeCredit_status_reviewedAt_idx" ON "FeeCredit"("status", "reviewedAt");
-- Import TestFlight links even when historical clients selected another platform.
INSERT INTO "TestFlightBuild" ("joinToken", "developerId", "originalCampaignId")
SELECT DISTINCT ON (token) token, "developerId", "id"
FROM (
 SELECT c.*, (regexp_match(c."appUrl", '^https://testflight[.]apple[.]com/join/([A-Za-z0-9]{8})/?([?#].*)?$', 'i'))[1] AS token,
 EXISTS (SELECT 1 FROM "WalletTransaction" t WHERE t."campaignId" = c."id" AND t."type" = 'ESCROW_DEPOSIT' AND t."status" = 'COMPLETED') AS funded
 FROM "AppCampaign" c
) builds WHERE token IS NOT NULL ORDER BY token, funded DESC, "createdAt", "id"
ON CONFLICT ("joinToken") DO NOTHING;
COMMIT;
