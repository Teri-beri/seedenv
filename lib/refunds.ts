import type { Prisma, RefundRequest } from "@prisma/client";
import { TransactionStatus, TransactionType } from "@prisma/client";
import { billingTransaction as serializable } from "@/lib/billing-transaction";
import { cancelFailedRefund, operationRefund, reserveBillingOperation } from "@/lib/billing-operations";
import { reconcileFundingPayment } from "@/lib/funding-reversals";
import { sendNotificationEmail } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { REFUND_REQUESTS_PER_DAY, refundReasonLabels, type RefundReason, type RefundResolution } from "@/lib/refund-rules";
import { campaignHasEnded, reconcileCampaignFunding, unusedPaidSlots } from "@/lib/slot-funding";
import { getStripe } from "@/lib/stripe";
import { formatCents } from "@/lib/utils";

export class RefundError extends Error {}

const REFUNDABLE_RECEIPTS: TransactionType[] = [TransactionType.ESCROW_DEPOSIT, TransactionType.BALANCE_TOPUP];
const OPEN_STATES = ["OPEN", "PROCESSING"];
const AUTO_REFUND_KINDS = ["PREPAID_REFUND", "SLOT_REFUND", "WITHDRAWAL_REFUND"];
const SUPPORT_EMAIL = "terimus@seedenv.com";

type Receipt = { id: string; userId: string; type: TransactionType; status: TransactionStatus; amountCents: number; campaignId: string | null; stripePaymentId: string | null };

// Remaining amount the developer can still be compensated for on one receipt (any destination).
export async function receiptRemainingCents(tx: Prisma.TransactionClient, receipt: Receipt, excludeRequestId?: string) {
  const prior = await tx.refundRequest.aggregate({
    where: { walletTransactionId: receipt.id, status: { in: ["APPROVED", "PROCESSING"] }, ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}) },
    _sum: { approvedCents: true },
  });
  let autoReturned = 0;
  if (receipt.stripePaymentId) {
    const settled = await tx.billingOperation.aggregate({ where: { paymentId: receipt.stripePaymentId, kind: { in: AUTO_REFUND_KINDS }, state: "SETTLED" }, _sum: { amountCents: true } });
    const reversal = await tx.fundingReversal.findUnique({ where: { paymentId: receipt.stripePaymentId } });
    autoReturned = (settled._sum.amountCents ?? 0) + (reversal?.appliedCents ?? 0);
  }
  return Math.max(0, receipt.amountCents - (prior._sum.approvedCents ?? 0) - autoReturned);
}

async function assertNoSupportRefundInFlight(tx: Prisma.TransactionClient, paymentId: string) {
  const inFlight = await tx.billingOperation.count({ where: { paymentId, kind: "SUPPORT_REFUND", state: { in: ["RESERVED", "SUBMITTED", "FAILED"] } } });
  if (inFlight) throw new RefundError("Another support refund on this payment is still processing. Retry after it settles.");
}

// Card refunds draw on the same Stripe charge as automatic refunds, so they only open once those can no longer occur.
async function cardRefundCapacity(tx: Prisma.TransactionClient, receipt: Receipt) {
  const paymentId = receipt.stripePaymentId;
  if (!paymentId?.startsWith("pi_")) throw new RefundError("This receipt was paid from your SeedEnv balance, so it can only be refunded as balance credit.");
  if (receipt.type === TransactionType.ESCROW_DEPOSIT) {
    const campaign = receipt.campaignId ? await tx.appCampaign.findUnique({ where: { id: receipt.campaignId } }) : null;
    if (!campaign) throw new RefundError("This cohort payment has no cohort record; use balance credit.");
    if (!campaignHasEnded(campaign)) throw new RefundError("Card refunds for a cohort open after the cohort ends and its unused funds are returned automatically. Use balance credit now or approve after the cohort ends.");
    const openAuto = await tx.billingOperation.count({ where: { campaignId: campaign.id, kind: { in: ["PREPAID_REFUND", "PREPAID_BALANCE_REFUND", "SLOT_REFUND"] }, state: { in: ["RESERVED", "SUBMITTED", "FAILED"] } } });
    if (openAuto) throw new RefundError("This cohort still has an automatic refund in progress. Retry after it settles.");
    if (campaign.fundingModel === "PAY_PER_TESTER") {
      const [paid, holds] = await Promise.all([
        tx.slotCharge.count({ where: { campaignId: campaign.id, status: "SUCCEEDED" } }),
        tx.missionApplication.count({ where: { campaignId: campaign.id, status: "ACCEPTED", startBy: { gt: new Date() } } }),
      ]);
      if (holds || unusedPaidSlots(paid, campaign.claimedSlots, 0)) throw new RefundError("This cohort still has unused or held tester places awaiting automatic refund. Retry after they settle.");
    }
    await reconcileFundingPayment(tx, paymentId);
    return Number.MAX_SAFE_INTEGER;
  }
  const topUp = await tx.balanceTopUp.findFirst({ where: { OR: [{ transactionId: receipt.id }, { stripePaymentIntentId: paymentId }] } });
  if (!topUp || topUp.stripePaymentIntentId !== paymentId) throw new RefundError("This top-up has no matching Stripe payment; use balance credit.");
  await reconcileFundingPayment(tx, paymentId);
  const reversal = await tx.fundingReversal.findUnique({ where: { paymentId } });
  return Math.max(0, topUp.creditCents - topUp.refundedCents - (reversal?.appliedCents ?? 0));
}

async function stripeRefundableCents(paymentId: string) {
  const intent = await getStripe().paymentIntents.retrieve(paymentId, { expand: ["latest_charge"] });
  const charge = intent.latest_charge;
  if (!charge || typeof charge === "string") throw new RefundError("Stripe has no captured charge for this payment.");
  return Math.max(0, charge.amount_captured - charge.amount_refunded);
}

export async function createRefundRequest(developerId: string, input: { receiptId: string; reason: RefundReason; details: string; amountCents: number }) {
  const request = await serializable(async (tx) => {
    const receipt = await tx.walletTransaction.findUnique({ where: { id: input.receiptId } });
    if (!receipt || receipt.userId !== developerId || !REFUNDABLE_RECEIPTS.includes(receipt.type) || receipt.status !== TransactionStatus.COMPLETED) {
      throw new RefundError("Choose a completed payment from your receipts.");
    }
    const recent = await tx.refundRequest.count({ where: { developerId, createdAt: { gt: new Date(Date.now() - 86_400_000) } } });
    if (recent >= REFUND_REQUESTS_PER_DAY) throw new RefundError("You have reached today's refund request limit. Contact terimus@seedenv.com if this is urgent.");
    const open = await tx.refundRequest.count({ where: { walletTransactionId: receipt.id, status: { in: OPEN_STATES } } });
    if (open) throw new RefundError("This payment already has a refund request in review.");
    const remaining = await receiptRemainingCents(tx, receipt);
    if (input.amountCents > remaining) throw new RefundError(remaining ? `You can request up to ${formatCents(remaining)} on this payment.` : "This payment has already been fully refunded or credited.");
    return tx.refundRequest.create({ data: { developerId, walletTransactionId: receipt.id, campaignId: receipt.campaignId, reason: input.reason, details: input.details, requestedCents: input.amountCents } });
  });
  const developer = await prisma.user.findUnique({ where: { id: developerId }, select: { email: true } });
  await sendNotificationEmail(
    SUPPORT_EMAIL,
    `[SeedEnv Refund] ${formatCents(request.requestedCents)} requested`,
    `Refund request: ${request.id}\nDeveloper: ${developer?.email ?? developerId}\nReceipt: ${request.walletTransactionId}\nCohort: ${request.campaignId ?? "none"}\nReason: ${refundReasonLabels[input.reason]}\nAmount: ${formatCents(request.requestedCents)}\n\n${request.details}\n\nReview: https://seedenv.com/admin/refunds`,
    `refund-request-${request.id}`,
  ).catch(() => false);
  return request;
}

async function notifyDeveloper(request: RefundRequest, subject: string, body: string) {
  const developer = await prisma.user.findUnique({ where: { id: request.developerId }, select: { email: true } });
  if (developer?.email) await sendNotificationEmail(developer.email, subject, body, `refund-decision-${request.id}-${request.status}`).catch(() => false);
}

export async function denyRefundRequest(requestId: string, adminId: string, note: string) {
  const updated = await prisma.refundRequest.updateMany({ where: { id: requestId, status: "OPEN" }, data: { status: "DENIED", adminId, adminNote: note, resolvedAt: new Date() } });
  if (updated.count !== 1) throw new RefundError("Only open refund requests can be declined.");
  const request = await prisma.refundRequest.findUniqueOrThrow({ where: { id: requestId } });
  await notifyDeveloper(request, "Your SeedEnv refund request was reviewed", `We reviewed your refund request (${request.id}) for ${formatCents(request.requestedCents)} and could not approve it.\n\nReason: ${note}\n\nIf you have more information, reply from Help & Support in your console or email ${SUPPORT_EMAIL}.`);
  return request;
}

async function settleCardRefund(requestId: string, operationId: string) {
  const operation = await prisma.billingOperation.findUniqueOrThrow({ where: { id: operationId } });
  let refund;
  try {
    refund = await operationRefund(operation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe refund outcome";
    if (await cancelFailedRefund(operation.id)) {
      // Stripe definitively rejected the refund; return the request to the queue so another destination can be chosen.
      await prisma.refundRequest.updateMany({ where: { id: requestId, status: "PROCESSING" }, data: { status: "OPEN", resolution: null, approvedCents: null, billingOperationId: null, adminNote: `Card refund failed: ${message}`.slice(0, 2000) } });
      throw new RefundError(`Stripe rejected the card refund: ${message}`);
    }
    throw new RefundError(`The Stripe refund outcome is not confirmed yet. Retry from this queue; it will not refund twice. (${message})`);
  }
  return serializable(async (tx) => {
    const current = await tx.billingOperation.findUniqueOrThrow({ where: { id: operation.id } });
    const request = await tx.refundRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (current.state === "SETTLED") return request;
    await tx.billingOperation.update({ where: { id: operation.id }, data: { state: "SETTLED", remoteId: refund.id, error: null } });
    const receipt = await tx.walletTransaction.findUniqueOrThrow({ where: { id: request.walletTransactionId } });
    if (receipt.type === TransactionType.BALANCE_TOPUP) {
      await tx.balanceTopUp.updateMany({ where: { stripePaymentIntentId: operation.paymentId }, data: { refundedCents: { increment: operation.amountCents } } });
    }
    await tx.walletTransaction.create({ data: {
      userId: request.developerId, campaignId: request.campaignId, amountCents: operation.amountCents, type: TransactionType.SUPPORT_REFUND,
      status: TransactionStatus.COMPLETED, stripePaymentId: refund.id, description: `Support refund to card for receipt ${receipt.id} (request ${request.id})`,
    } });
    return tx.refundRequest.update({ where: { id: request.id }, data: { status: "APPROVED", resolvedAt: new Date() } });
  });
}

export async function approveRefundRequest(requestId: string, adminId: string, decision: { resolution: RefundResolution; amountCents: number; note: string }) {
  const existing = await prisma.refundRequest.findUnique({ where: { id: requestId } });
  if (!existing) throw new RefundError("Refund request not found.");
  if (existing.status === "PROCESSING" && existing.billingOperationId) {
    const request = await settleCardRefund(existing.id, existing.billingOperationId);
    await notifyApproved(request);
    return request;
  }
  if (existing.status !== "OPEN") throw new RefundError("This refund request has already been decided.");

  let stripeCap = Number.MAX_SAFE_INTEGER;
  if (decision.resolution === "CARD") {
    const receipt = await prisma.walletTransaction.findUnique({ where: { id: existing.walletTransactionId } });
    if (!receipt?.stripePaymentId?.startsWith("pi_")) throw new RefundError("This receipt was paid from balance; approve it as balance credit.");
    // Settle automatic unused-funding refunds first so a support refund never consumes their Stripe capacity.
    if (receipt.type === TransactionType.ESCROW_DEPOSIT && receipt.campaignId) await reconcileCampaignFunding(receipt.campaignId);
    stripeCap = await stripeRefundableCents(receipt.stripePaymentId);
  }

  const result = await serializable(async (tx) => {
    const request = await tx.refundRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (request.status !== "OPEN") throw new RefundError("This refund request has already been decided.");
    const receipt = await tx.walletTransaction.findUniqueOrThrow({ where: { id: request.walletTransactionId } });
    if (receipt.userId !== request.developerId || receipt.status !== TransactionStatus.COMPLETED) throw new RefundError("The receipt no longer matches this request.");
    const remaining = await receiptRemainingCents(tx, receipt, request.id);
    if (decision.amountCents > remaining) throw new RefundError(`At most ${formatCents(remaining)} remains refundable on this receipt.`);
    const base = { adminId, adminNote: decision.note || null, approvedCents: decision.amountCents, resolution: decision.resolution };
    if (decision.resolution === "CREDIT") {
      await tx.user.update({ where: { id: request.developerId }, data: { fundingBalanceCents: { increment: decision.amountCents } } });
      await tx.walletTransaction.create({ data: {
        userId: request.developerId, campaignId: request.campaignId, amountCents: decision.amountCents, type: TransactionType.SUPPORT_CREDIT,
        status: TransactionStatus.COMPLETED, description: `Support credit to SeedEnv balance for receipt ${receipt.id} (request ${request.id})`,
      } });
      return { request: await tx.refundRequest.update({ where: { id: request.id }, data: { ...base, status: "APPROVED", resolvedAt: new Date() } }), operationId: null };
    }
    await assertNoSupportRefundInFlight(tx, receipt.stripePaymentId!);
    // Stripe's refundable amount already reflects every settled refund on the charge.
    const capacity = Math.min(stripeCap, await cardRefundCapacity(tx, receipt));
    if (decision.amountCents > capacity) throw new RefundError(capacity > 0 ? `Only ${formatCents(capacity)} can still go back to the card. Use balance credit for the rest.` : "Nothing remains refundable to the card. Use balance credit.");
    const attempt = await tx.billingOperation.count({ where: { resourceId: request.id, kind: "SUPPORT_REFUND" } });
    const operation = await reserveBillingOperation(tx, {
      id: `seedenv-support-refund-${request.id}-${attempt}`, kind: "SUPPORT_REFUND", resourceId: request.id, userId: request.developerId,
      campaignId: request.campaignId, ledgerId: receipt.id, paymentId: receipt.stripePaymentId, amountCents: decision.amountCents,
    });
    await tx.refundRequest.update({ where: { id: request.id }, data: { ...base, status: "PROCESSING", billingOperationId: operation.id } });
    return { request, operationId: operation.id };
  });
  const request = result.operationId ? await settleCardRefund(requestId, result.operationId) : result.request;
  await notifyApproved(request);
  return request;
}

async function notifyApproved(request: RefundRequest) {
  if (request.status !== "APPROVED" || !request.approvedCents) return;
  const destination = request.resolution === "CARD"
    ? "back to your original payment method. Card refunds usually appear within 5–10 business days"
    : "to your SeedEnv balance. It is available immediately for your next cohort";
  await notifyDeveloper(request, "Your SeedEnv refund was approved", `We approved ${formatCents(request.approvedCents)} for refund request ${request.id}. It has been returned ${destination}.${request.adminNote ? `\n\nNote from SeedEnv: ${request.adminNote}` : ""}\n\nYour billing history in the console shows the updated ledger.`);
}

export async function listRefundQueue() {
  const rank: Record<string, number> = { PROCESSING: 0, OPEN: 1, FAILED: 2 };
  const requests = (await prisma.refundRequest.findMany({ orderBy: { createdAt: "desc" }, take: 100 }))
    .sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3));
  const [users, receipts, campaigns] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(requests.map((row) => row.developerId))] } }, select: { id: true, email: true, fundingBalanceCents: true } }),
    prisma.walletTransaction.findMany({ where: { id: { in: requests.map((row) => row.walletTransactionId) } }, select: { id: true, type: true, amountCents: true, stripePaymentId: true, createdAt: true } }),
    prisma.appCampaign.findMany({ where: { id: { in: requests.flatMap((row) => row.campaignId ? [row.campaignId] : []) } }, select: { id: true, title: true, refundedCents: true, status: true } }),
  ]);
  const userMap = new Map(users.map((row) => [row.id, row]));
  const receiptMap = new Map(receipts.map((row) => [row.id, row]));
  const campaignMap = new Map(campaigns.map((row) => [row.id, row]));
  return requests.map((request) => {
    const receipt = receiptMap.get(request.walletTransactionId);
    const campaign = request.campaignId ? campaignMap.get(request.campaignId) : undefined;
    const developer = userMap.get(request.developerId);
    return {
      id: request.id, status: request.status, reason: request.reason, details: request.details, requestedCents: request.requestedCents,
      approvedCents: request.approvedCents, resolution: request.resolution, adminNote: request.adminNote, createdAt: request.createdAt.toISOString(),
      developerEmail: developer?.email ?? request.developerId, developerBalanceCents: developer?.fundingBalanceCents ?? 0,
      receiptId: request.walletTransactionId, receiptType: receipt?.type ?? null, receiptCents: receipt?.amountCents ?? 0,
      cardEligible: Boolean(receipt?.stripePaymentId?.startsWith("pi_")),
      campaignTitle: campaign?.title ?? null, campaignStatus: campaign?.status ?? null, campaignAutoRefundedCents: campaign?.refundedCents ?? 0,
    };
  });
}
export type RefundQueueRow = Awaited<ReturnType<typeof listRefundQueue>>[number];
