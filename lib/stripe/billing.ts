import type Stripe from "stripe";
import { STORED_VALUE_TAX_CODE, stripeTaxEnabled, TAX_POLICY_VERSION, storedValueTaxAudit, taxAuditSchema } from "@/lib/billing/tax-policy";

export function storedValueCheckoutTax(): Pick<Stripe.Checkout.SessionCreateParams, "automatic_tax" | "billing_address_collection" | "customer_update"> {
  if (!stripeTaxEnabled()) return {};
  return {
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    customer_update: { address: "auto", name: "auto" },
  };
}

export function storedValueProductTax() {
  return { tax_code: STORED_VALUE_TAX_CODE };
}

export function seedenvTaxMetadata() {
  return { terimus_llc_business_unit: "seedenv", tax_policy_version: TAX_POLICY_VERSION };
}

export function validateStoredValueCheckout(session: Pick<Stripe.Checkout.Session, "id" | "metadata"> & Partial<Pick<Stripe.Checkout.Session, "automatic_tax" | "total_details" | "customer_details">>) {
  const enabledAtCreation = session.metadata?.seedenvAutomaticTax === "1";
  if (!enabledAtCreation) return null;
  if (session.metadata?.terimus_llc_business_unit !== "seedenv" || session.metadata?.tax_policy_version !== TAX_POLICY_VERSION) {
    throw new Error("Stored-value tax policy metadata does not match SeedEnv.");
  }
  if (!session.automatic_tax?.enabled || session.automatic_tax.status !== "complete" || session.total_details?.amount_tax !== 0) {
    throw new Error("Stored-value tax assessment is incomplete or nonzero. Funds were not credited; billing reconciliation is required.");
  }
  const address = session.customer_details?.address;
  return storedValueTaxAudit({
    country: address?.country ?? null, region: address?.state ?? null,
    addressSource: address ? "STRIPE_CHECKOUT" : "UNAVAILABLE",
    stripeCheckoutSessionId: session.id, stripeTaxStatus: session.automatic_tax.status,
  });
}

export function validateServiceCheckout(session: Pick<Stripe.Checkout.Session, "id" | "metadata" | "automatic_tax" | "total_details" | "customer_details">, snapshot: unknown) {
  const enabledAtCreation = session.metadata?.seedenvServiceTax === "1";
  if (!snapshot && !enabledAtCreation) return null;
  if (!snapshot || !enabledAtCreation) throw new Error("Service payment tax policy does not match its campaign.");
  const audit = taxAuditSchema.parse(snapshot);
  if (audit.stage !== "SERVICE_REDEMPTION" || session.metadata?.terimus_llc_business_unit !== "seedenv" || session.metadata?.tax_policy_version !== audit.policyVersion) {
    throw new Error("Service payment tax policy metadata requires reconciliation.");
  }
  const address = session.customer_details?.address;
  if (address?.country?.toUpperCase() !== "US" || !["FL", "FLORIDA"].includes(address.state?.toUpperCase() ?? "")) {
    throw new Error("Paid service billing address is outside the configured Florida policy; reconciliation is required.");
  }
  if (!session.automatic_tax.enabled || session.automatic_tax.status !== "complete" || session.total_details?.amount_tax !== 0) {
    throw new Error("Service payment tax assessment requires reconciliation; the cohort was not activated.");
  }
  return taxAuditSchema.parse({
    ...audit, addressSource: "STRIPE_CHECKOUT", stripeCheckoutSessionId: session.id,
    stripeTaxStatus: session.automatic_tax.status, assessedAt: new Date().toISOString(),
  });
}
