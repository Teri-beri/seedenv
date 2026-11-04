import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { reserveBillingOperation } from "@/lib/billing-operations";
import { isPublicHandle } from "@/lib/public-profile";
import { TESTER_REFERRAL_BOUNTY_CENTS } from "@/lib/organic-growth";
import { SITE_URL } from "@/lib/seo";

export async function awardTesterReferralBounty(tx: Prisma.TransactionClient, friendId: string) {
  const referral = await tx.referral.findUnique({
    where: { friendId },
    include: { friend: true, inviter: true },
  });
  if (!referral || referral.rewardedAt || referral.rewardTransactionId) return null;
  const { friend, inviter } = referral;
  if (!friend.emailVerified || !friend.testerWorkspaceEnabled || !isPublicHandle(friend.username) || !friend.name?.trim() || !friend.bio?.trim()
    || !inviter.testerWorkspaceEnabled || !inviter.emailVerified || inviter.id === friend.id
    || inviter.email.toLowerCase() === friend.email.toLowerCase()) return null;

  const visited = new Set([friend.id]);
  let ancestor: string | null = inviter.id;
  while (ancestor) {
    if (visited.has(ancestor)) return null;
    visited.add(ancestor);
    const parent: { inviterId: string } | null = await tx.referral.findUnique({ where: { friendId: ancestor }, select: { inviterId: true } });
    ancestor = parent?.inviterId ?? null;
  }

  const approvals = await tx.submission.findMany({
    where: { testerId: friendId, status: "APPROVED", approvedById: { not: null }, bugTitle: { not: null }, hardwareStatus: "VERIFIED_PHYSICAL_NODE", denialReviewPending: false },
    select: { approvedById: true, bugSeverity: true, reproSteps: true, deviceModel: true, osBuild: true, campaign: { select: { developerId: true } } },
    orderBy: { reviewedAt: "asc" },
  });
  const eligible = approvals.some((report) => report.approvedById === report.campaign.developerId
    && report.campaign.developerId !== friendId && report.campaign.developerId !== inviter.id
    && report.bugSeverity && report.reproSteps.length >= 2 && report.deviceModel?.trim() && report.osBuild?.trim());
  if (!eligible) return null;

  const claimed = await tx.referral.updateMany({
    where: { id: referral.id, rewardedAt: null, rewardTransactionId: null },
    data: { rewardedAt: new Date() },
  });
  if (claimed.count !== 1) return null;
  const payout = await tx.walletTransaction.create({
    data: { userId: inviter.id, amountCents: TESTER_REFERRAL_BOUNTY_CENTS, type: "REFERRAL_REWARD", status: "PENDING", description: "Qualified tester referral reward pending Stripe transfer" },
    select: { id: true },
  });
  await tx.referral.update({ where: { id: referral.id }, data: { rewardTransactionId: payout.id } });
  await reserveBillingOperation(tx, {
    id: `seedenv-payout-${payout.id}`, kind: "REFERRAL_PAYOUT", resourceId: payout.id,
    ledgerId: payout.id, userId: inviter.id, amountCents: TESTER_REFERRAL_BOUNTY_CENTS,
    destinationId: inviter.stripeConnectAccountId,
  });
  return { userId: inviter.id, transactionId: payout.id };
}

export type TesterReferralStats = {
  inviteUrl: string;
  totalInvited: number;
  pendingFirstBug: number;
  earnedCents: number;
  pendingPayoutCents: number;
};

export async function getTesterReferralStats(userId: string): Promise<TesterReferralStats> {
  const [totalInvited, pendingFirstBug, earned, pending] = await Promise.all([
    prisma.referral.count({ where: { inviterId: userId } }),
    prisma.referral.count({ where: { inviterId: userId, rewardedAt: null } }),
    prisma.walletTransaction.aggregate({ where: { userId, type: "REFERRAL_REWARD", status: { in: ["PENDING", "COMPLETED"] } }, _sum: { amountCents: true } }),
    prisma.walletTransaction.aggregate({ where: { userId, type: "REFERRAL_REWARD", status: "PENDING" }, _sum: { amountCents: true } }),
  ]);
  return { inviteUrl: `${SITE_URL}/join?ref=${encodeURIComponent(userId)}`, totalInvited, pendingFirstBug, earnedCents: earned._sum.amountCents ?? 0, pendingPayoutCents: pending._sum.amountCents ?? 0 };
}
