"use server";

import { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createTopUpCheckout, withdrawBalance } from "@/lib/funding-balance";
import { AUTO_RELOAD_OPTIONS_CENTS, MAX_TOP_UP_CENTS, MIN_TOP_UP_CENTS } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/utils";

export type BalanceActionResult = { ok: true; message?: string; url?: string } | { ok: false; message: string };

async function requireBalanceOwner() {
  const user = await getCurrentUser("DEVELOPER");
  if (user.role !== UserRole.DEVELOPER && user.role !== UserRole.ADMIN) throw new Error("Switch to your Developer workspace to manage your balance.");
  return user;
}

export async function startBalanceTopUp(creditCents: number): Promise<BalanceActionResult> {
  try {
    const user = await requireBalanceOwner();
    if (!process.env.STRIPE_SECRET_KEY) return { ok: false, message: "Payments are not configured yet. Please try again later." };
    if (!Number.isSafeInteger(creditCents) || creditCents < MIN_TOP_UP_CENTS || creditCents > MAX_TOP_UP_CENTS) {
      return { ok: false, message: `Choose an amount between ${formatCents(MIN_TOP_UP_CENTS)} and ${formatCents(MAX_TOP_UP_CENTS)}.` };
    }
    const checkout = await createTopUpCheckout(user, creditCents, { successPath: "/console?view=billing&topup=success", cancelPath: "/console?view=billing&topup=cancelled" });
    return { ok: true, url: checkout.url };
  } catch (error) {
    console.error("SeedEnv balance top-up failed:", error);
    return { ok: false, message: error instanceof Error && error.message.startsWith("Switch") ? error.message : "Stripe could not start the top-up. Please try again." };
  }
}

export async function setAutoReload(amountCents: number): Promise<BalanceActionResult> {
  try {
    const user = await requireBalanceOwner();
    if (amountCents !== 0 && !(AUTO_RELOAD_OPTIONS_CENTS as readonly number[]).includes(amountCents)) return { ok: false, message: "Choose a supported auto-reload amount." };
    await prisma.user.update({ where: { id: user.id }, data: { autoReloadCents: amountCents } });
    revalidatePath("/console");
    return { ok: true, message: amountCents ? `Auto-reload on: we'll add ${formatCents(amountCents)} when an accepted tester needs more than your balance.` : "Auto-reload is off." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not update auto-reload." };
  }
}

export async function refundBalanceToCard(): Promise<BalanceActionResult> {
  try {
    const user = await requireBalanceOwner();
    const result = await withdrawBalance(user.id);
    revalidatePath("/console");
    if (result.refundedCents === 0) return { ok: false, message: "Stripe could not process the refund right now. Your balance is unchanged; please try again." };
    return { ok: true, message: `${formatCents(result.refundedCents)} is on its way back to your card (5–10 business days).${result.keptCents ? ` ${formatCents(result.keptCents)} couldn't be refunded automatically and stays in your balance; contact support.` : ""}` };
  } catch (error) {
    console.error("SeedEnv balance withdrawal failed:", error);
    return { ok: false, message: error instanceof Error ? error.message : "Could not refund your balance." };
  }
}
