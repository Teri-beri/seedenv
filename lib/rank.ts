import { RankTier } from "@prisma/client";

export const rankThresholds: Record<RankTier, { label: string; minXp: number; next?: RankTier }> = {
  ROOKIE_RIDER: { label: "Rookie Rider", minXp: 0, next: "WAVE_CHASER" },
  WAVE_CHASER: { label: "Wave Chaser", minXp: 1000, next: "REEF_HUNTER" },
  REEF_HUNTER: { label: "Reef Hunter", minXp: 3500, next: "TSUNAMI_LEGEND" },
  TSUNAMI_LEGEND: { label: "Tsunami Legend", minXp: 9000 },
};

export function rankForXp(xp: number): RankTier {
  if (xp >= rankThresholds.TSUNAMI_LEGEND.minXp) return "TSUNAMI_LEGEND";
  if (xp >= rankThresholds.REEF_HUNTER.minXp) return "REEF_HUNTER";
  if (xp >= rankThresholds.WAVE_CHASER.minXp) return "WAVE_CHASER";
  return "ROOKIE_RIDER";
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