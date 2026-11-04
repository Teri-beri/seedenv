// Seller disclosures printed on every SeedEnv receipt and Stripe invoice.
export const SEEDENV_LEGAL_ENTITY = {
  name: "TERIMUS LLC",
  tradeName: "SeedEnv",
  jurisdiction: "Florida, United States",
  documentNumber: "L25000544505",
  billingEmail: "terimus@seedenv.com",
  website: "https://seedenv.com",
} as const;

// SEEDENV_LEGAL_ADDRESS holds the registered business address; separate lines with "|" or newlines.
export function legalAddressLines(raw: string | undefined = process.env.SEEDENV_LEGAL_ADDRESS): string[] {
  return (raw || "")
    .split(/\r?\n|\|/)
    .map((part) => part.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 4);
}

export function legalDisclosureLines(raw?: string): string[] {
  const entity = SEEDENV_LEGAL_ENTITY;
  return [
    `${entity.name} (d/b/a ${entity.tradeName})`,
    ...legalAddressLines(raw ?? process.env.SEEDENV_LEGAL_ADDRESS),
    `${entity.jurisdiction} · Document No. ${entity.documentNumber}`,
    `Billing: ${entity.billingEmail} · ${entity.website.replace(/^https:\/\//, "")}`,
  ];
}
