import { RankTier } from "@prisma/client";

export const rankThresholds: Record<RankTier, { label: string; minXp: number; next?: RankTier }> = {
  ALPHA_SEEDER: { label: "Alpha Seeder", minXp: 0, next: "CORE_VALIDATOR" },
  CORE_VALIDATOR: { label: "Core Validator", minXp: 1500, next: "APEX_ARCHITECT" },
  APEX_ARCHITECT: { label: "Apex Architect", minXp: 6000 },
};

export function rankForXp(xp: number): RankTier {
  if (xp >= rankThresholds.APEX_ARCHITECT.minXp) return "APEX_ARCHITECT";
  if (xp >= rankThresholds.CORE_VALIDATOR.minXp) return "CORE_VALIDATOR";
  return "ALPHA_SEEDER";
}

export function rankProgress(rank: RankTier, xp: number) {
  const current = rankThresholds[rank];
  const nextRank = current.next;
  if (!nextRank) return { label: current.label, percent: 100, nextLabel: "Max rank", remainingXp: 0 };
  const next = rankThresholds[nextRank];
  const span = next.minXp - current.minXp;
  const percent = Math.min(100, Math.max(0, ((xp - current.minXp) / span) * 100));
  return {
    label: current.label,
    percent,
    nextLabel: next.label,
    remainingXp: Math.max(0, next.minXp - xp),
  };
}

export function xpForBounty(payoutCents: number) {
  return Math.max(75, Math.round((payoutCents / 100) * 32));
}