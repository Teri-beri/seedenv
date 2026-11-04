ALTER TABLE "WalletTransaction" ADD COLUMN "stripeInvoiceId" TEXT,
ADD COLUMN "hostedInvoiceUrl" TEXT,
ADD COLUMN "invoicePdfUrl" TEXT;

CREATE INDEX "WalletTransaction_stripeInvoiceId_idx" ON "WalletTransaction"("stripeInvoiceId");
