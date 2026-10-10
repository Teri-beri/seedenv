import { CampaignStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Demo accounts created by prisma/seed.ts must never surface as real public developers.
export const SEED_ACCOUNT_EMAIL_SUFFIX = "@seedenv.dev";

const handlePattern = /^[a-zA-Z0-9_]{3,32}$/;

export function normalizeProfileHandle(raw: string) {
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  value = value.trim().replace(/^@/, "");
  return handlePattern.test(value) ? value : null;
}

export function isPublicHandle(username: string) {
  return handlePattern.test(username.trim());
}

export function publicProfilePath(username: string) {
  return `/@${username.trim()}`;
}

export function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function getPublicDeveloperProfile(rawHandle: string) {
  const handle = normalizeProfileHandle(rawHandle);
  if (!handle) return null;
  // Usernames are unique case-insensitively at the application layer only, so refuse to guess on legacy collisions.
  const matches = await prisma.user.findMany({
    where: {
      username: { equals: handle, mode: "insensitive" },
      NOT: { email: { endsWith: SEED_ACCOUNT_EMAIL_SUFFIX } },
    },
    take: 2,
    select: {
      id: true, username: true, avatarUrl: true, bio: true, companyName: true,
      portfolioUrl: true, productUrl: true, githubUsername: true, discordUrl: true, twitterHandle: true, createdAt: true,
      role: true, developerWorkspaceEnabled: true, testerWorkspaceEnabled: true, xpPoints: true, rankTier: true,
    },
  });
  if (matches.length !== 1) return null;
  const profile = matches[0];
  const id = profile.id;
  const cohorts = await prisma.appCampaign.findMany({
    where: { developerId: id, status: CampaignStatus.ACTIVE, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, title: true, description: true, platform: true, bountyPerTaskUsd: true, totalSlots: true, claimedSlots: true },
  });
  const [followers, following, launched, approved, testerApproved, testerReviewed] = await Promise.all([
    prisma.userFollow.count({ where: { followingId: id } }),
    prisma.userFollow.count({ where: { followerId: id } }),
    prisma.appCampaign.count({ where: { developerId: id, status: { in: ["ACTIVE", "PAUSED", "COMPLETED"] } } }),
    prisma.submission.count({ where: { campaign: { developerId: id }, status: "APPROVED" } }),
    prisma.submission.count({ where: { testerId: id, status: "APPROVED" } }),
    prisma.submission.count({ where: { testerId: id, status: { in: ["APPROVED", "REJECTED"] }, denialReviewPending: false } }),
  ]);
  return { ...profile, cohorts, followers, following, launched, approved, testerApproved, testerReviewed };
}
