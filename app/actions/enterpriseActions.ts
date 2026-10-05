"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { billingDetailsSchema, supportRequestSchema, type BillingDetails, type SupportRequest } from "@/lib/enterprise-rules";
import { requireMember } from "@/lib/member";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
import { sendNotificationEmail } from "@/lib/notifications";

export async function saveCompanyBillingDetails(data: BillingDetails) {
  const parsed = billingDetailsSchema.safeParse(data);
  if (!parsed.success) return { ok: false as const, message: "Enter complete billing details and a two-letter country code." };
  try {
    const user = await requireMember("DEVELOPER");
    await prisma.billingProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...parsed.data }, update: parsed.data });
    revalidatePath("/dashboard/developer/billing");
    return { ok: true as const };
  } catch {
    return { ok: false as const, message: "Billing details could not be saved. Check your workspace access and try again." };
  }
}

export async function submitSupportRequest(data: SupportRequest) {
  const parsed = supportRequestSchema.safeParse(data);
  if (!parsed.success) return { ok: false as const, message: "Choose a category and include a subject and at least 20 characters of detail." };
  try {
    const user = await requireMember();
    const requestHeaders = await headers();
    const ticket = await serializable(async (tx) => {
      const recent = await tx.supportTicket.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 3600000) } } });
      if (recent >= 5) return null;
      return tx.supportTicket.create({ data: { ...parsed.data, userId: user.id, role: user.role, userAgent: (requestHeaders.get("user-agent") || "Unknown browser").slice(0, 500) } });
    });
    if (!ticket) return { ok: false as const, message: "You have reached the support submission limit. Try again later or contact terimus@seedenv.com." };
    const emailNotified = await sendNotificationEmail(
      "terimus@seedenv.com",
      `[SeedEnv Support] ${parsed.data.category}: ${parsed.data.subject}`,
      `Support reference: ${ticket.id}\nCategory: ${parsed.data.category}\nMember: ${user.email || "See support queue"}\nUser ID: ${user.id}\nRole: ${user.role}\nRoute: ${parsed.data.route}\nBrowser/OS: ${(requestHeaders.get("user-agent") || "Unknown browser").slice(0, 500)}\n\n${parsed.data.message}`,
    );
    return { ok: true as const, ticketId: ticket.id, emailNotified };
  } catch {
    return { ok: false as const, message: "Your request was not submitted. Sign in and try again, or contact terimus@seedenv.com." };
  }
}

export async function resolveSupportTicket(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return { ok: false as const, message: "Invalid support reference." };
  try {
    const user = await requireMember();
    if (user.role !== "ADMIN") return { ok: false as const, message: "Administrator access required." };
    await prisma.supportTicket.update({ where: { id }, data: { status: "RESOLVED" } });
    revalidatePath("/admin/support");
    return { ok: true as const };
  } catch { return { ok: false as const, message: "The support request could not be updated." }; }
}