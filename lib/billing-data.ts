import "server-only";
import { CampaignStatus, SubmissionStatus, TransactionStatus, TransactionType } from "@prisma/client";
import { buildInvoiceLedgerRow, lockedEscrowCents, type BillingMetricsData, type InvoiceLedgerRow } from "@/lib/billing";
import type { BillingDetails } from "@/lib/enterprise-rules";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

export type PaymentMethodSummary = { brand: string; last4: string; expMonth: number; expYear: number } | null;

export type BillingOverview = {
  metrics: BillingMetricsData;
  invoices: InvoiceLedgerRow[];
  billingDetails: BillingDetails;
  paymentMethod: PaymentMethodSummary;
  paymentMethodUnavailable: boolean;
  balance: FundingBalanceSummary;
};

export type FundingBalanceSummary = {
  balanceCents: number;
  autoReloadCents: number;
  pendingTopUps: number;
  withdrawals: Array<{ id: string; amountCents: number; status: TransactionStatus; createdAt: string }>;
  heldCampaigns?: Array<{ id: string; title: string; billingHoldCents: number }>;
};

const emptyBillingDetails: BillingDetails = { companyName: "", taxId: "", billingEmail: "", addressLine1: "", addressLine2: "", city: "", region: "", postalCode: "", country: "US" };

async function loadDefaultPaymentMethod(stripeCustomerId: string | null): Promise<{ method: PaymentMethodSummary; unavailable: boolean }> {
  if (!stripeCustomerId || !process.env.STRIPE_SECRET_KEY) return { method: null, unavailable: false };
  try {
    const customer = await getStripe().customers.retrieve(stripeCustomerId, { expand: ["invoice_settings.default_payment_method"] });
    if (customer.deleted) return { method: null, unavailable: false };
    const method = customer.invoice_settings?.default_payment_method;
    if (!method || typeof method === "string" || !method.card) return { method: null, unavailable: false };
    return { method: { brand: method.card.brand, last4: method.card.last4, expMonth: method.card.exp_month, expYear: method.card.exp_year }, unavailable: false };
  } catch (error) {
    console.error("SeedEnv billing could not load the default payment method:", error);
    return { method: null, unavailable: true };
  }
}

export async function getBillingOverview(userId: string, stripeCustomerId: string | null): Promise<BillingOverview> {
  const depositScope = { userId, type: TransactionType.ESCROW_DEPOSIT };
  const [transactions, fees, awaiting, fundedCampaigns, settled, profile, payment, member, pendingTopUps, withdrawals, heldCampaigns] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { userId, type: { in: [TransactionType.ESCROW_DEPOSIT, TransactionType.BALANCE_TOPUP] } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true, type: true, stripePaymentId: true, amountCents: true, status: true, platformFeeCents: true, invoiceSnapshot: true, campaignId: true, createdAt: true,
        campaign: { select: { id: true, title: true, platform: true, status: true } },
      },
    }),
    prisma.walletTransaction.aggregate({ where: { userId, type: { in: [TransactionType.ESCROW_DEPOSIT, TransactionType.ESCROW_REFUND] }, status: TransactionStatus.COMPLETED }, _sum: { platformFeeCents: true } }),
    prisma.walletTransaction.aggregate({ where: { ...depositScope, status: TransactionStatus.PENDING }, _sum: { amountCents: true }, _count: true }),
    prisma.appCampaign.findMany({
      where: { developerId: userId, status: { in: [CampaignStatus.ACTIVE, CampaignStatus.PAUSED] } },
      select: { id: true, totalBudgetUsd: true, platformFeeUsd: true, fundingModel: true },
    }),
    prisma.submission.aggregate({ where: { status: SubmissionStatus.APPROVED, campaign: { developerId: userId } }, _sum: { payoutCents: true }, _count: true }),
    prisma.billingProfile.findUnique({ where: { userId } }),
    loadDefaultPaymentMethod(stripeCustomerId),
    prisma.user.findUnique({ where: { id: userId }, select: { fundingBalanceCents: true, autoReloadCents: true } }),
    prisma.balanceTopUp.count({ where: { userId, status: "PENDING", source: "CHECKOUT", stripeCheckoutSessionId: { not: null } } }),
    prisma.walletTransaction.findMany({ where: { userId, type: TransactionType.BALANCE_WITHDRAWAL }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, amountCents: true, status: true, createdAt: true } }),
    prisma.appCampaign.findMany({ where: { developerId: userId, billingHoldCents: { gt: 0 } }, select: { id: true, title: true, billingHoldCents: true } }),
  ]);

  const approvedByCampaign = fundedCampaigns.length
    ? await prisma.submission.groupBy({ by: ["campaignId"], where: { status: SubmissionStatus.APPROVED, campaignId: { in: fundedCampaigns.map((campaign) => campaign.id) } }, _sum: { payoutCents: true } })
    : [];
  const approvedMap = new Map(approvedByCampaign.map((row) => [row.campaignId, row._sum.payoutCents || 0]));
  const perTesterIds = fundedCampaigns.filter((campaign) => campaign.fundingModel === "PAY_PER_TESTER").map((campaign) => campaign.id);
  const chargedByCampaign = perTesterIds.length
    ? await prisma.slotCharge.groupBy({ by: ["campaignId"], where: { campaignId: { in: perTesterIds }, status: "SUCCEEDED" }, _sum: { stipendCents: true } })
    : [];
  const chargedMap = new Map(chargedByCampaign.map((row) => [row.campaignId, row._sum.stipendCents || 0]));

  return {
    metrics: {
      activeEscrowCents: lockedEscrowCents(fundedCampaigns.map((campaign) => ({ ...campaign, approvedPayoutCents: approvedMap.get(campaign.id) || 0, fundedPoolCents: campaign.fundingModel === "PAY_PER_TESTER" ? chargedMap.get(campaign.id) || 0 : undefined }))),
      activeCohorts: fundedCampaigns.length,
      settledPayoutsCents: settled._sum.payoutCents || 0,
      validatorsPaid: settled._count,
      platformFeesCents: fees._sum.platformFeeCents || 0,
      awaitingPaymentCents: awaiting._sum.amountCents || 0,
      awaitingPaymentCount: awaiting._count,
    },
    invoices: transactions.map(buildInvoiceLedgerRow),
    billingDetails: profile
      ? { companyName: profile.companyName, taxId: profile.taxId || "", billingEmail: profile.billingEmail || "", addressLine1: profile.addressLine1, addressLine2: profile.addressLine2 || "", city: profile.city, region: profile.region || "", postalCode: profile.postalCode, country: profile.country }
      : emptyBillingDetails,
    paymentMethod: payment.method,
    paymentMethodUnavailable: payment.unavailable,
    balance: {
      balanceCents: member?.fundingBalanceCents ?? 0,
      autoReloadCents: member?.autoReloadCents ?? 0,
      pendingTopUps,
      withdrawals: withdrawals.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      heldCampaigns,
    },
  };
}
