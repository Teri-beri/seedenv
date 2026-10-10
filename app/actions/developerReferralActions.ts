"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/member";
import { prisma } from "@/lib/prisma";
import { billingTransaction } from "@/lib/billing-transaction";
import { attachDeveloperReferral, DeveloperReferralError } from "@/lib/developer-referrals";

export async function generateDeveloperReferralCode() {
  const user = await requireMember("DEVELOPER");
  await prisma.user.updateMany({ where: { id: user.id, developerReferralCode: null }, data: { developerReferralCode: `DEV_${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}` } });
  const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { developerReferralCode: true } });
  revalidatePath("/account");
  return saved.developerReferralCode;
}

export async function applyDeveloperReferral(rawCode: string) {
  const user = await requireMember("DEVELOPER");
  try {
    await billingTransaction((tx) => attachDeveloperReferral(tx, user.id, rawCode));
    revalidatePath("/account");
    revalidatePath("/console");
    return { ok: true as const };
  } catch (error) {
    if (error instanceof DeveloperReferralError) return { ok: false as const, error: error.message };
    console.error("SeedEnv developer referral could not be attached:", error);
    return { ok: false as const, error: "Could not attach your referral. Refresh your account and try again." };
  }
}
