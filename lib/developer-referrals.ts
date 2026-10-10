import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";

export class DeveloperReferralError extends Error {}

export async function createReferralCredit(tx: Prisma.TransactionClient, ownerId: string, sourceId: string, kind: "WELCOME" | "MATCH") {
  return tx.cohortPromoCode.upsert({
    where: { code: `REF_${kind}_${sourceId.toUpperCase()}` },
    create: { code: `REF_${kind}_${sourceId.toUpperCase()}`, ownerId, discountPercent: 50, maxRedemptions: 1, expiresAt: null },
    update: {},
  });
}

export async function attachDeveloperReferral(tx: Prisma.TransactionClient, developerId: string, rawCode: string) {
  const parsed = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,39}$/).safeParse(rawCode);
  if (!parsed.success) throw new DeveloperReferralError("Enter a valid developer referral code (3-40 letters, numbers, hyphens or underscores).");
  const code = parsed.data;
  const developer = await tx.user.findUniqueOrThrow({ where: { id: developerId } });
  if (developer.role !== "DEVELOPER") throw new DeveloperReferralError("Switch to your developer workspace first.");
  if (await tx.developerReferral.findUnique({ where: { developerId } })) throw new DeveloperReferralError("A developer referral is already linked to this account.");
  const inviter = await tx.user.findUnique({ where: { developerReferralCode: code } });
  if (!inviter || (!inviter.developerWorkspaceEnabled && inviter.role !== "DEVELOPER")) throw new DeveloperReferralError("This developer referral code is invalid.");
  if (inviter.id === developerId) throw new DeveloperReferralError("You cannot refer yourself.");
  if (await tx.developerReferral.findFirst({ where: { inviterId: developerId, developerId: inviter.id } })) throw new DeveloperReferralError("Reciprocal developer referrals are not allowed.");
  if (await tx.walletTransaction.findFirst({ where: { userId: developerId, type: "ESCROW_DEPOSIT", status: "COMPLETED" } }) || await tx.balanceTopUp.findFirst({ where: { userId: developerId, campaignId: { not: null }, status: "SUCCEEDED" } })) throw new DeveloperReferralError("Link your referral before your first paid cohort.");
  const referral = await tx.developerReferral.create({ data: { id: randomUUID().replaceAll("-", "").slice(0, 20), inviterId: inviter.id, developerId } });
  await createReferralCredit(tx, developerId, referral.id, "WELCOME");
  return referral;
}

// Called in the same transaction as a successful cohort payment/debit, not signup or preview.
export async function qualifyDeveloperReferral(tx: Prisma.TransactionClient, developerId: string, campaignId: string) {
  const referral = await tx.developerReferral.findUnique({ where: { developerId } });
  if (!referral || referral.qualifiedAt) return;
  const used = await tx.cohortPromoRedemption.findFirst({ where: { developerId, campaignId, consumedAt: { not: null }, promoCode: { code: `REF_WELCOME_${referral.id.toUpperCase()}` } } });
  if (!used) return;
  const paid = await tx.walletTransaction.findFirst({ where: { userId: developerId, campaignId, type: "ESCROW_DEPOSIT", status: "COMPLETED", amountCents: { gt: 0 } } });
  if (!paid && !await tx.balanceTopUp.findFirst({ where: { userId: developerId, campaignId, status: "SUCCEEDED", creditCents: { gt: 0 } } })) return;
  const updated = await tx.developerReferral.updateMany({
    where: { id: referral.id, qualifiedAt: null },
    data: { qualifiedAt: new Date(), qualifiedCampaignId: campaignId },
  });
  if (updated.count === 1) await createReferralCredit(tx, referral.inviterId, referral.id, "MATCH");
}
