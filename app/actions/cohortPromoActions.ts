"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/member";
import { CohortPromoError, eligibleCohortPromo, promoStackSchema, promoSettingsSchema, requirePromoOperator } from "@/lib/cohort-promos";

function promoActionFailure(error: unknown) {
  if (error instanceof CohortPromoError) return { ok: false as const, error: error.message };
  if (error instanceof z.ZodError) return { ok: false as const, error: error.issues[0].message };
  console.error("SeedEnv cohort promo action failed:", error);
  return { ok: false as const, error: "Could not update or validate the promo code. Please try again." };
}

export async function previewCohortPromo(rawCode: string, draftId?: string) {
  const developer = await requireMember("DEVELOPER");
  if (developer.platformFeeWaived) return { ok: false as const, error: "Your account already has a permanent full fee waiver. Promo codes cannot add further savings." };
  try {
    const code = promoStackSchema.parse(rawCode);
    if (!code) throw new CohortPromoError("Enter a promo code.");
    if (draftId) {
      const campaign = await prisma.appCampaign.findFirst({
        where: { id: z.string().min(1).max(200).parse(draftId), developerId: developer.id, status: "DRAFT" },
        include: { promoRedemptions: { include: { promoCode: { select: { code: true } } } } },
      });
      if (campaign?.promoRedemptions.length && campaign.promoRedemptions.map((entry) => entry.promoCode.code).sort().join(",") === code.split(",").sort().join(",")) return { ok: true as const, code, discountPercent: campaign.platformFeeDiscountPercent };
    }
    const promos = await prisma.$transaction(async (tx) => Promise.all(code.split(",").map((entry) => eligibleCohortPromo(tx, developer.id, entry))));
    if (promos.filter((entry) => !entry.ownerId).length > 1) throw new CohortPromoError("Only one public promo can be used. Stack it with your own referral credits.");
    const discountPercent = promos.reduce((sum, entry) => sum + entry.discountPercent, 0);
    if (discountPercent > 100) throw new CohortPromoError("Discounts cannot exceed 100%. Save the extra credit for another cohort.");
    return { ok: true as const, code, discountPercent };
  } catch (error) {
    return promoActionFailure(error);
  }

}

export async function availableDeveloperCredits() {
  const user = await requireMember("DEVELOPER");
  const credits = await prisma.cohortPromoCode.findMany({
    where: { ownerId: user.id, enabled: true, redemptions: { none: { consumedAt: { not: null } } } },
    orderBy: { createdAt: "asc" }, select: { code: true, discountPercent: true, redemptions: { select: { paymentPending: true } } },
  });
  return credits.map((credit) => ({ code: credit.code, discountPercent: credit.discountPercent, state: credit.redemptions.some((entry) => entry.paymentPending) ? "Reserved (payment pending)" : credit.redemptions.length ? "Reserved (unpaid)" : "Available" }));
}

export async function createCohortPromo(input: { code: string; discountPercent: number; maxRedemptions: number; expiresAt: string }) {
  await requirePromoOperator();
  try {
    const data = promoSettingsSchema.parse(input);
    if (await prisma.cohortPromoCode.findUnique({ where: { code: data.code }, select: { id: true } })) throw new CohortPromoError("That promo code already exists. Choose a different code.");
    await prisma.cohortPromoCode.create({ data });
    revalidatePath("/admin/promos");
    return { ok: true as const };
  } catch (error) {
    return promoActionFailure(error);
  }
}

export async function setCohortPromoEnabled(id: string, enabled: boolean) {
  await requirePromoOperator();
  try {
    const request = z.object({ id: z.string().min(1).max(200), enabled: z.boolean() }).parse({ id, enabled });
    const updated = await prisma.cohortPromoCode.updateMany({ where: { id: request.id }, data: { enabled: request.enabled } });
    if (updated.count !== 1) throw new CohortPromoError("This promo code no longer exists. Refresh the manager.");
    revalidatePath("/admin/promos");
    return { ok: true as const };
  } catch (error) {
    return promoActionFailure(error);
  }
}
