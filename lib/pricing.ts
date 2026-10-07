export type CohortTypeKey = "STANDARD_QA" | "GOOGLE_PLAY_14_DAY" | "LIVE_STRESS_DROP";

export const COHORT_PLATFORM_FEE_RATE = 0.2;
export const COHORT_MIN_PLATFORM_FEE_CENTS = 1500;
export const CLIPPER_PLATFORM_FEE_PERCENT = 0.05;

// Estimate only; Stripe's actual fee depends on card type and country and is charged to SeedEnv.
export const STRIPE_CARD_RATE = 0.029;
export const STRIPE_CARD_FIXED_CENTS = 30;

export type CohortBundle = {
  type: Exclude<CohortTypeKey, "STANDARD_QA">;
  name: string;
  shortName: string;
  totalCents: number;
  slots: number;
  bountyCents: number;
  platformFeeCents: number;
  platform: "PLAY_STORE" | null;
  guaranteedDays: number | null;
  summary: string;
  features: string[];
};

export const COHORT_BUNDLES: Record<CohortBundle["type"], CohortBundle> = {
  GOOGLE_PLAY_14_DAY: {
    type: "GOOGLE_PLAY_14_DAY",
    name: "Google Play 14-Day Closed Test",
    shortName: "Google Play 14-Day",
    totalCents: 19900,
    slots: 20,
    bountyCents: 400,
    platformFeeCents: 11900,
    platform: "PLAY_STORE",
    guaranteedDays: 14,
    summary: "For new personal Play Console accounts that need 12+ testers opted in to a closed test for 14 continuous days before applying for production access.",
    features: [
      "20 tester slots (8 above Google's 12-tester minimum as a buffer)",
      "14-day cohort window on your closed testing track",
      "Testers submit device, OS, and usage proof you review in the console",
      "Full refund, including the platform fee, if fewer than 12 testers stay opted in for 14 continuous days",
    ],
  },
  LIVE_STRESS_DROP: {
    type: "LIVE_STRESS_DROP",
    name: "Flash Concurrency Drop",
    shortName: "Flash Drop",
    totalCents: 34900,
    slots: 35,
    bountyCents: 500,
    platformFeeCents: 17400,
    platform: null,
    guaranteedDays: null,
    summary: "A scheduled, simultaneous session for real-time features such as WebSockets, live streams, and multiplayer rooms.",
    features: [
      "35 tester slots scheduled into one live session window",
      "Session time and test script set in your cohort brief",
      "Per-tester device, OS, network type, and crash/network log capture",
      "Hardware-signal screening flags likely emulators for review",
    ],
  },
};

export function isBundleType(type: CohortTypeKey): type is CohortBundle["type"] {
  return type !== "STANDARD_QA";
}

export function standardPlatformFeeCents(payoutPoolCents: number) {
  return Math.max(Math.round(payoutPoolCents * COHORT_PLATFORM_FEE_RATE), COHORT_MIN_PLATFORM_FEE_CENTS);
}

export function quoteCampaignFunding(payoutPoolUsd: number, cohortType: CohortTypeKey = "STANDARD_QA") {
  if (isBundleType(cohortType)) {
    const bundle = COHORT_BUNDLES[cohortType];
    const poolCents = bundle.slots * bundle.bountyCents;
    return { payoutPoolUsd: poolCents / 100, platformFeeUsd: bundle.platformFeeCents / 100, totalBudgetUsd: bundle.totalCents / 100, escrowTotalCents: bundle.totalCents };
  }
  const payoutPoolCents = Math.round(payoutPoolUsd * 100);
  if (!Number.isSafeInteger(payoutPoolCents) || payoutPoolCents < 0) {
    throw new Error("The reward pool must be a finite, non-negative USD amount.");
  }
  const platformFeeCents = standardPlatformFeeCents(payoutPoolCents);
  const escrowTotalCents = payoutPoolCents + platformFeeCents;
  return {
    payoutPoolUsd: payoutPoolCents / 100,
    platformFeeUsd: platformFeeCents / 100,
    totalBudgetUsd: escrowTotalCents / 100,
    escrowTotalCents,
  };
}

export function quoteClipperFunding(feeUsd: number) {
  const feeCents = Math.round(feeUsd * 100);
  if (!Number.isSafeInteger(feeCents) || feeCents < 0) throw new Error("The creator fee must be a finite, non-negative USD amount.");
  return feeCents + Math.round(feeCents * CLIPPER_PLATFORM_FEE_PERCENT);
}

export type EscrowBreakdown = {
  validatorPool: number;
  platformFee: number;
  stripeProcessingEstimate: number;
  netPlatformMargin: number;
  totalAuthorized: number;
};

export function calculateCohortEscrow(validatorCount: number, stipendPerValidator: number, cohortType: CohortTypeKey = "STANDARD_QA"): EscrowBreakdown {
  const quote = quoteCampaignFunding(validatorCount * stipendPerValidator, cohortType);
  const stripeCents = Math.round(quote.escrowTotalCents * STRIPE_CARD_RATE) + STRIPE_CARD_FIXED_CENTS;
  const feeCents = Math.round(quote.platformFeeUsd * 100);
  return {
    validatorPool: quote.payoutPoolUsd,
    platformFee: quote.platformFeeUsd,
    stripeProcessingEstimate: stripeCents / 100,
    netPlatformMargin: (feeCents - stripeCents) / 100,
    totalAuthorized: quote.totalBudgetUsd,
  };
}

// Stripe's card cost grossed up to a base amount. Used for estimates; SeedEnv absorbs processing rather than surcharging it.
export function cardProcessingFeeCents(baseCents: number) {
  if (!Number.isSafeInteger(baseCents) || baseCents <= 0) return 0;
  const totalCents = Math.ceil((baseCents + STRIPE_CARD_FIXED_CENTS) / (1 - STRIPE_CARD_RATE));
  return totalCents - baseCents;
}

export type SlotChargeQuote = { stipendCents: number; platformFeeCents: number; totalCents: number };

// The platform fee is cumulative: 20% of all funded stipends with a $15 cohort floor, minus fees already collected.
// Slots are paid from the developer's prepaid balance, so no card processing applies per tester.
export function quoteSlotCharge(stipendCents: number, retainedStipendCents: number, retainedPlatformFeeCents: number): SlotChargeQuote {
  if (!Number.isSafeInteger(stipendCents) || stipendCents <= 0) throw new Error("The tester stipend must be a positive amount.");
  const owed = standardPlatformFeeCents(Math.max(0, retainedStipendCents) + stipendCents);
  const platformFeeCents = Math.max(0, owed - Math.max(0, retainedPlatformFeeCents));
  return { stipendCents, platformFeeCents, totalCents: stipendCents + platformFeeCents };
}

export type PerTesterProjection = { firstCharge: SlotChargeQuote | null; typicalCharge: SlotChargeQuote | null; stipendCents: number; platformFeeCents: number; maxTotalCents: number };

// Maximum spend if every slot is filled, drawn from the balance one accepted tester at a time.
export function projectPerTesterCharges(slots: number, stipendCents: number): PerTesterProjection {
  const projection: PerTesterProjection = { firstCharge: null, typicalCharge: null, stipendCents: 0, platformFeeCents: 0, maxTotalCents: 0 };
  if (!Number.isSafeInteger(slots) || slots <= 0 || !Number.isSafeInteger(stipendCents) || stipendCents <= 0) return projection;
  for (let index = 0; index < slots; index += 1) {
    const charge = quoteSlotCharge(stipendCents, projection.stipendCents, projection.platformFeeCents);
    if (index === 0) projection.firstCharge = charge;
    projection.typicalCharge = charge;
    projection.stipendCents += charge.stipendCents;
    projection.platformFeeCents += charge.platformFeeCents;
    projection.maxTotalCents += charge.totalCents;
  }
  return projection;
}

export const MIN_TOP_UP_CENTS = 1000;
export const MAX_TOP_UP_CENTS = 500000;
export const AUTO_RELOAD_OPTIONS_CENTS = [2500, 5000, 10000, 25000] as const;

export type TopUpQuote = { creditCents: number; processingFeeCents: number; totalCents: number };

// SeedEnv absorbs card processing (no surcharge), so the card is charged exactly the credit added.
export function quoteTopUp(creditCents: number): TopUpQuote {
  if (!Number.isSafeInteger(creditCents) || creditCents < MIN_TOP_UP_CENTS || creditCents > MAX_TOP_UP_CENTS) {
    throw new Error(`Top-ups must be between $${MIN_TOP_UP_CENTS / 100} and $${(MAX_TOP_UP_CENTS / 100).toLocaleString("en-US")}.`);
  }
  return { creditCents, processingFeeCents: 0, totalCents: creditCents };
}

// Smallest valid top-up that covers a shortfall, rounded up to a whole dollar.
export function topUpForShortfall(shortfallCents: number) {
  return Math.min(MAX_TOP_UP_CENTS, Math.max(MIN_TOP_UP_CENTS, Math.ceil(Math.max(0, shortfallCents) / 100) * 100));
}
