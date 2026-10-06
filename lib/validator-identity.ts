import type { RankTier } from "@prisma/client";

const rankLevels: Record<RankTier, number> = { ALPHA_SEEDER: 1, CORE_VALIDATOR: 2, APEX_ARCHITECT: 3 };

export function rankLevel(rank: RankTier) {
  return rankLevels[rank] ?? 1;
}

export function formatRankLevel(rank: RankTier) {
  return `LEVEL ${String(rankLevel(rank)).padStart(2, "0")}`;
}

// Stable display identifier derived from the account id (FNV-1a), so it never changes between visits.
export function validatorNodeId(userId: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < userId.length; index++) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `NODE-SE-${String(hash % 10000).padStart(4, "0")}`;
}

export function describeDevice(userAgent: string) {
  const ios = userAgent.match(/(iPhone|iPad|iPod).*?OS (\d+)[_.](\d+)/i);
  if (ios) return { model: ios[1], os: `iOS ${ios[2]}.${ios[3]}`, platform: "iOS" as const };
  const android = userAgent.match(/Android (\d+(?:\.\d+)?)(?:;[^;)]*)*?;\s*([^;)]+?)(?:\sBuild\/[^;)]*)?\)/i);
  if (android) {
    const model = android[2].trim();
    return { model: model && !/^(K|wv|Mobile)$/i.test(model) ? model : "Android device", os: `Android ${android[1]}`, platform: "Android" as const };
  }
  if (/Macintosh|Mac OS X/i.test(userAgent)) return { model: "Mac", os: "macOS", platform: "Desktop" as const };
  if (/Windows/i.test(userAgent)) return { model: "PC", os: "Windows", platform: "Desktop" as const };
  if (/Linux|CrOS/i.test(userAgent)) return { model: "Computer", os: /CrOS/i.test(userAgent) ? "ChromeOS" : "Linux", platform: "Desktop" as const };
  return { model: "Unknown device", os: "Unknown OS", platform: "Desktop" as const };
}
