import { z } from "zod";

export const billingDetailsSchema = z.object({
  companyName: z.string().trim().min(1).max(150),
  taxId: z.string().trim().max(80).default(""),
  billingEmail: z.string().trim().max(254).default("").refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Enter a valid billing contact email."),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).default(""),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().max(100).default(""),
  postalCode: z.string().trim().min(1).max(30),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
});
export type BillingDetails = z.infer<typeof billingDetailsSchema>;

export const invoiceSnapshotSchema = z.object({
  version: z.literal(1),
  cohortId: z.string().min(1).max(200),
  cohortTitle: z.string().min(1).max(150),
  rewardPoolCents: z.number().int().nonnegative(),
  platformFeeCents: z.number().int().nonnegative(),
  company: billingDetailsSchema.nullable(),
});
export type InvoiceSnapshot = z.infer<typeof invoiceSnapshotSchema>;

export function invoiceTotalMatches(snapshot: InvoiceSnapshot, amountCents: number) {
  return Number.isSafeInteger(amountCents) && amountCents > 0 && snapshot.rewardPoolCents + snapshot.platformFeeCents === amountCents;
}

export const supportCategories = ["Cohort Dispute", "Billing & Escrow", "Technical Bug", "General Support"] as const;
export const supportRequestSchema = z.object({
  category: z.enum(supportCategories),
  subject: z.string().trim().min(4).max(150),
  message: z.string().trim().min(20).max(5000),
  route: z.string().max(1000).regex(/^\/(?!\/)[^?#]*$/, "Invalid application route."),
});
export type SupportRequest = z.infer<typeof supportRequestSchema>;

export function payoutScheduleLabel(schedule: { interval: string; delay_days?: number | "minimum"; weekly_anchor?: string; monthly_anchor?: number } | undefined) {
  if (!schedule) return "Schedule unavailable";
  if (schedule.interval === "manual") return "Manual bank payouts";
  const cadence = schedule.interval === "weekly" ? `Weekly${schedule.weekly_anchor ? ` on ${schedule.weekly_anchor}` : ""}`
    : schedule.interval === "monthly" ? `Monthly${schedule.monthly_anchor ? ` on day ${schedule.monthly_anchor}` : ""}` : "Daily";
  return `${cadence}${typeof schedule.delay_days === "number" ? ` / ${schedule.delay_days}-day availability delay` : ""}`;
}