import { z } from "zod";
import type { Prisma } from "@prisma/client";

export const STORED_VALUE_TAX_CODE = "txcd_00000000";
export const QA_SERVICE_TAX_CODE = "txcd_20030000";
export const TAX_POLICY_VERSION = "seedenv-fl-stored-value-v1";

export const taxAuditSchema = z.object({
  policyVersion: z.literal(TAX_POLICY_VERSION),
  businessUnit: z.literal("seedenv"),
  currency: z.literal("usd"),
  stage: z.enum(["CREDIT_PURCHASE", "SERVICE_REDEMPTION", "BOUNTY_RELEASE"]),
  treatment: z.enum(["STORED_VALUE", "FLORIDA_SERVICE_POLICY"]),
  taxAmountCents: z.literal(0),
  taxCode: z.enum([STORED_VALUE_TAX_CODE, QA_SERVICE_TAX_CODE]),
  country: z.string().length(2).nullable(),
  region: z.string().nullable(),
  addressSource: z.enum(["BILLING_PROFILE", "STRIPE_CHECKOUT", "UNAVAILABLE"]),
  stripeCheckoutSessionId: z.string().nullable(),
  stripeTaxStatus: z.string().nullable(),
  assessedAt: z.string().datetime(),
}).strict().superRefine((audit, context) => {
  const storedValue = audit.stage === "CREDIT_PURCHASE";
  if (storedValue ? audit.treatment !== "STORED_VALUE" || audit.taxCode !== STORED_VALUE_TAX_CODE :
    audit.treatment !== "FLORIDA_SERVICE_POLICY" || audit.taxCode !== QA_SERVICE_TAX_CODE || audit.country !== "US" || audit.region !== "FL") {
    context.addIssue({ code: "custom", message: "Tax audit stage, classification, and jurisdiction must agree." });
  }
});
export type TaxAudit = z.infer<typeof taxAuditSchema>;

export function stripeTaxEnabled() {
  return process.env.SEEDENV_STRIPE_TAX_ENABLED === "1";
}

export function storedValueTaxAudit(input: Partial<Pick<TaxAudit, "country" | "region" | "stripeCheckoutSessionId" | "stripeTaxStatus" | "addressSource">> = {}): TaxAudit {
  return taxAuditSchema.parse({
    policyVersion: TAX_POLICY_VERSION, businessUnit: "seedenv", currency: "usd",
    stage: "CREDIT_PURCHASE", treatment: "STORED_VALUE", taxAmountCents: 0,
    taxCode: STORED_VALUE_TAX_CODE, country: input.country ?? null, region: input.region ?? null,
    addressSource: input.addressSource ?? "UNAVAILABLE",
    stripeCheckoutSessionId: input.stripeCheckoutSessionId ?? null,
    stripeTaxStatus: input.stripeTaxStatus ?? null, assessedAt: new Date().toISOString(),
  });
}

export function floridaServiceTaxAudit(address: { country: string; region: string | null } | null): TaxAudit {
  if (process.env.SEEDENV_FLORIDA_QA_TAX_POLICY_CONFIRMED !== "1") {
    throw new Error("Service tax policy has not been approved. Contact billing support before purchasing testing services.");
  }
  if (!address || address.country.trim().toUpperCase() !== "US" || !["FL", "FLORIDA"].includes(address.region?.trim().toUpperCase() ?? "")) {
    throw new Error("Testing-service tax treatment is only configured for Florida billing addresses. Update Billing or contact support; no credits were consumed.");
  }
  return taxAuditSchema.parse({
    ...storedValueTaxAudit(), stage: "SERVICE_REDEMPTION", treatment: "FLORIDA_SERVICE_POLICY",
    taxCode: QA_SERVICE_TAX_CODE, country: "US", region: "FL", addressSource: "BILLING_PROFILE",
  });
}

export async function serviceTaxAudit(tx: Prisma.TransactionClient, developerId: string): Promise<TaxAudit | null> {
  if (!stripeTaxEnabled()) return null;
  const address = await tx.billingProfile.findUnique({ where: { userId: developerId }, select: { country: true, region: true } });
  return floridaServiceTaxAudit(address);
}

export function taxLedgerFields(audit: TaxAudit | null) {
  return audit ? { taxAmountCents: audit.taxAmountCents, taxCode: audit.taxCode, taxAudit: audit } : {};
}
