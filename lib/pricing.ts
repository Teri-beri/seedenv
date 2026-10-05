export const SEEDENV_PLATFORM_FEE_PERCENT = 0.05;

export function quoteCampaignFunding(payoutPoolUsd: number) {
  const payoutPoolCents = Math.round(payoutPoolUsd * 100);
  if (!Number.isSafeInteger(payoutPoolCents) || payoutPoolCents < 0) {
    throw new Error("The reward pool must be a finite, non-negative USD amount.");
  }
  const platformFeeCents = Math.round(payoutPoolCents * SEEDENV_PLATFORM_FEE_PERCENT);
  const escrowTotalCents = payoutPoolCents + platformFeeCents;
  return {
    payoutPoolUsd: payoutPoolCents / 100,
    platformFeeUsd: platformFeeCents / 100,
    totalBudgetUsd: escrowTotalCents / 100,
    escrowTotalCents,
  };
}