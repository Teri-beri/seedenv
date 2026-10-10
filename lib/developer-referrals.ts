import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertReferralAcyclic, queueReferralCredit, vestCampaignReferralCredits } from "@/lib/services/referral.service";

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
  if (developer.referredById || await tx.developerReferral.findUnique({ where: { developerId } })) throw new DeveloperReferralError("A developer referral is permanently linked to this account already.");
  const inviter = await tx.user.findUnique({ where: { developerReferralCode: code } });
  if (!inviter || (!inviter.developerWorkspaceEnabled && inviter.role !== "DEVELOPER") || !inviter.emailVerified) throw new DeveloperReferralError("This developer referral code is invalid or its owner has not verified their account.");
  if (inviter.id === developerId) throw new DeveloperReferralError("You cannot refer yourself.");
  if (await tx.developerReferral.findFirst({ where: { inviterId: developerId, developerId: inviter.id } })) throw new DeveloperReferralError("Reciprocal developer referrals are not allowed.");
  if (await tx.walletTransaction.findFirst({ where: { userId: developerId, type: "ESCROW_DEPOSIT", status: "COMPLETED" } }) || await tx.balanceTopUp.findFirst({ where: { userId: developerId, campaignId: { not: null }, status: { in: ["SUCCEEDED", "REFUNDED"] } } })) throw new DeveloperReferralError("Link your referral before your first paid cohort.");
  try { await assertReferralAcyclic(tx, developerId, inviter.id); }
  catch (error) {
    if (error instanceof Error && /Circular or reciprocal/.test(error.message)) throw new DeveloperReferralError(error.message);
    throw error;
  }
  await tx.user.update({ where: { id: developerId }, data: { referredById: inviter.id } });
  const referral = await tx.developerReferral.create({ data: { id: randomUUID().replaceAll("-", "").slice(0, 20), inviterId: inviter.id, developerId } });
  return referral;
}

// Called in the same transaction as a successful cohort payment/debit, not signup or preview.
export async function qualifyDeveloperReferral(tx: Prisma.TransactionClient, developerId: string, campaignId: string) {
  const campaign = await tx.appCampaign.findUniqueOrThrow({ where: { id: campaignId }, select: { developerId: true } });
  if (campaign.developerId !== developerId) throw new Error("Referral qualification ownership does not match.");
  await queueReferralCredit(tx, campaignId);
  await vestCampaignReferralCredits(tx, campaignId);
}
