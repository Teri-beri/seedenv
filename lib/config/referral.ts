export const REFERRAL_RULES = {
  MIN_QUALIFYING_ESCROW_CENTS: 5000,
  FIRST_COHORT_PLATFORM_DISCOUNT: 1,
  REFERRAL_DISCOUNT_PER_STACK: 0.5,
  MAX_FEE_DISCOUNT_PERCENT: 0.75,
  VOUCHER_EXPIRY_DAYS: 90,
  POLICY_VERSION: 1,
} as const;

export function referralStackDiscountPercent(stackCount: number) {
  if (!Number.isSafeInteger(stackCount) || stackCount < 0) throw new Error("Invalid referral stack count.");
  const multiplier = Math.max(Math.pow(1 - REFERRAL_RULES.REFERRAL_DISCOUNT_PER_STACK, stackCount), 1 - REFERRAL_RULES.MAX_FEE_DISCOUNT_PERCENT);
  return Math.round((1 - multiplier) * 100);
}
