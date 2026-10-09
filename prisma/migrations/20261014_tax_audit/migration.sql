ALTER TABLE "AppCampaign" ADD COLUMN "taxSnapshot" JSONB;
ALTER TABLE "WalletTransaction"
  ADD COLUMN "taxAmountCents" INTEGER,
  ADD COLUMN "taxCode" TEXT,
  ADD COLUMN "taxAudit" JSONB,
  ADD CONSTRAINT "WalletTransaction_taxAmountCents_nonnegative"
    CHECK ("taxAmountCents" IS NULL OR "taxAmountCents" >= 0);
