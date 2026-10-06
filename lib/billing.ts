import type { CampaignStatus, PlatformType, TransactionStatus } from "@prisma/client";
import { invoiceSnapshotSchema, invoiceTotalMatches } from "@/lib/enterprise-rules";

export type EscrowStatus = "ESCROW_ACTIVE" | "SETTLED" | "AWAITING_PAYMENT" | "FAILED";

export type InvoiceLedgerRow = {
  id: string;
  invoiceNumber: string;
  cohortId: string | null;
  cohortTitle: string;
  platform: string | null;
  date: string;
  testerPoolCents: number;
  feeCents: number;
  processingFeeCents: number;
  totalCents: number;
  escrowStatus: EscrowStatus;
  downloadable: boolean;
};

export function invoiceNumber(id: string, date: Date) {
  return `INV-${date.getUTCFullYear()}-${id.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase()}`;
}

export function platformTag(platform: PlatformType | null | undefined) {
  if (platform === "TESTFLIGHT") return "iOS";
  if (platform === "PLAY_STORE") return "Android";
  if (platform === "WEB_STAGING") return "Web";
  return null;
}

export function escrowStatusFor(transactionStatus: TransactionStatus, campaignStatus: CampaignStatus | null | undefined): EscrowStatus {
  if (transactionStatus === "FAILED") return "FAILED";
  if (transactionStatus === "PENDING") return "AWAITING_PAYMENT";
  return campaignStatus === "ACTIVE" || campaignStatus === "PAUSED" || campaignStatus === "ESCROW_PENDING" ? "ESCROW_ACTIVE" : "SETTLED";
}

export function buildInvoiceLedgerRow(transaction: {
  id: string;
  amountCents: number;
  status: TransactionStatus;
  platformFeeCents: number | null;
  invoiceSnapshot: unknown;
  campaignId: string | null;
  createdAt: Date;
  campaign: { id: string; title: string; platform: PlatformType; status: CampaignStatus } | null;
}): InvoiceLedgerRow {
  const snapshot = invoiceSnapshotSchema.safeParse(transaction.invoiceSnapshot);
  const feeCents = snapshot.success ? snapshot.data.platformFeeCents : transaction.platformFeeCents || 0;
  const processingFeeCents = snapshot.success ? snapshot.data.processingFeeCents ?? 0 : 0;
  const testerPoolCents = snapshot.success ? snapshot.data.rewardPoolCents : Math.max(0, transaction.amountCents - feeCents);
  return {
    id: transaction.id,
    invoiceNumber: invoiceNumber(transaction.id, transaction.createdAt),
    cohortId: snapshot.success ? snapshot.data.cohortId : transaction.campaignId,
    cohortTitle: transaction.campaign?.title || (snapshot.success ? snapshot.data.cohortTitle : "Legacy funding record"),
    platform: platformTag(transaction.campaign?.platform),
    date: transaction.createdAt.toISOString(),
    testerPoolCents,
    feeCents,
    processingFeeCents,
    totalCents: transaction.amountCents,
    escrowStatus: escrowStatusFor(transaction.status, transaction.campaign?.status),
    downloadable: transaction.status === "COMPLETED" && snapshot.success && invoiceTotalMatches(snapshot.data, transaction.amountCents),
  };
}

export type BillingMetricsData = {
  activeEscrowCents: number;
  activeCohorts: number;
  settledPayoutsCents: number;
  validatorsPaid: number;
  platformFeesCents: number;
  awaitingPaymentCents: number;
  awaitingPaymentCount: number;
};

// Locked escrow = funded tester pool minus approved payouts already released.
// Pay-per-tester cohorts pass fundedPoolCents (stipends actually charged); prepaid cohorts use the budget minus the fee.
export function lockedEscrowCents(campaigns: Array<{ totalBudgetUsd: number; platformFeeUsd: number; approvedPayoutCents: number; fundedPoolCents?: number }>) {
  return campaigns.reduce((sum, campaign) => {
    const poolCents = campaign.fundedPoolCents ?? Math.round((campaign.totalBudgetUsd - campaign.platformFeeUsd) * 100);
    return sum + Math.max(0, poolCents - campaign.approvedPayoutCents);
  }, 0);
}
