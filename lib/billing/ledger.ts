import type { Prisma } from "@prisma/client";
import { serviceTaxAudit, taxLedgerFields, taxAuditSchema, type TaxAudit } from "./tax-policy";
import { reserveBillingOperation } from "@/lib/billing-operations";

// Called inside the acceptance transaction after checking campaign ownership/capacity.
// The campaign and application remain mandatory: an unbound debit has no refund provenance.
export async function escrowMissionCredits(tx: Prisma.TransactionClient, developerId: string, amountCents: number, campaignId: string) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("Mission funding must be a positive integer amount in cents.");
  const campaign = await tx.appCampaign.findUnique({ where: { id: campaignId }, select: { developerId: true } });
  if (!campaign || campaign.developerId !== developerId) throw new Error("Mission funding ownership does not match.");
  const tax = await serviceTaxAudit(tx, developerId);
  const debited = await tx.user.updateMany({
    where: { id: developerId, fundingBalanceCents: { gte: amountCents } },
    data: { fundingBalanceCents: { decrement: amountCents } },
  });
  return { debited: debited.count === 1, tax };
}

export async function releaseBountyAndDeductFee(tx: Prisma.TransactionClient, input: {
  missionId: string;
  testerId: string;
  bountyCents: number;
  destinationId: string | null;
  description: string;
  taxSnapshot: unknown;
}) {
  if (!Number.isSafeInteger(input.bountyCents) || input.bountyCents <= 0) throw new Error("Tester bounty must be positive integer cents.");
  // The fee was already reserved at acceptance; deducting it here again would
  // double-charge the developer. Wallet credit occurs only after Stripe settles.
  const payout = await tx.walletTransaction.create({
    data: {
      userId: input.testerId, campaignId: input.missionId, amountCents: input.bountyCents,
      type: "BOUNTY_PAYOUT", status: "PENDING", description: input.description,
      ...bountyReleaseTaxFields(input.taxSnapshot),
    }, select: { id: true },
  });
  await reserveBillingOperation(tx, {
    id: `seedenv-payout-${payout.id}`, kind: "PAYOUT", resourceId: payout.id,
    ledgerId: payout.id, userId: input.testerId, campaignId: input.missionId,
    destinationId: input.destinationId, amountCents: input.bountyCents,
  });
  return payout;
}

export function bountyReleaseTaxFields(value: unknown) {
  if (value === null || value === undefined) return {};
  const audit = taxAuditSchema.parse(value);
  if (audit.stage !== "SERVICE_REDEMPTION") throw new Error("Bounty release requires a service-redemption tax record.");
  return taxLedgerFields({ ...audit, stage: "BOUNTY_RELEASE" });
}

export function redemptionLineItems(bountyCents: number, feeCents: number, tax: TaxAudit) {
  for (const value of [bountyCents, feeCents]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invoice amounts must be nonnegative integer cents.");
  }
  if (tax.stage !== "SERVICE_REDEMPTION" || tax.treatment !== "FLORIDA_SERVICE_POLICY") throw new Error("Service receipt requires a configured redemption policy.");
  return [
    { description: "Testing Services Bounty (Exempt under configured Florida policy)", amountCents: bountyCents, taxCode: tax.taxCode },
    { description: "Platform Service Fee (Exempt under configured Florida policy)", amountCents: feeCents, taxCode: tax.taxCode },
    { description: "Tax Collected", amountCents: tax.taxAmountCents, taxCode: null },
  ];
}
