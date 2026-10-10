import { Prisma, type User } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dailyQuestXp, referralMonthlyLimit, referralQuestXp, utcDay } from "@/lib/quest-rules";
import { exchangeItems } from "@/lib/quest-rules";
import { randomBytes } from "node:crypto";

export async function serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue;
      throw error;
    }
  }
}

export async function awardQuestXp(tx: Prisma.TransactionClient, userId: string, key: string, amount: number, label: string) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Quest awards must be positive whole points.");
  const result = await tx.questReward.createMany({ data: [{ userId, key, amount, label }], skipDuplicates: true });
  if (result.count === 0) return false;
  await tx.user.update({ where: { id: userId }, data: { questXp: { increment: amount } } });
  return true;
}

export async function awardDailyCheckIn(userId: string) {
  return serializable(async (tx) => {
    await qualifyReferral(tx, userId);
    return awardQuestXp(tx, userId, `daily:${utcDay(new Date())}`, dailyQuestXp, "Daily tester check-in");
  });
}

export async function saveMemberReferral(member: Pick<User, "id" | "role" | "createdAt">, code: string) {
  if (member.role === "ADMIN") throw new Error("Referrals are for member accounts.");
  const normalized = z.string().trim().min(8).max(32).regex(/^[a-zA-Z0-9]+$/).parse(code).toUpperCase();
  await serializable(async (tx) => {
    if (Date.now() - member.createdAt.getTime() > 7 * 86400000) throw new Error("Referral codes must be entered within seven days of joining.");
    if (await tx.referral.findUnique({ where: { friendId: member.id } })) throw new Error("Your account already has an inviter.");
    if (await tx.submission.count({ where: { testerId: member.id, status: "APPROVED" } })) throw new Error("Enter your referral before your first approved task.");
    const inviter = await tx.user.findFirst({ where: { referralCode: { equals: normalized, mode: "insensitive" } } });
    if (!inviter || inviter.id === member.id) throw new Error("Enter another tester's valid referral code.");
    if (await tx.referral.findUnique({ where: { friendId: inviter.id }, select: { inviterId: true } }).then((entry) => entry?.inviterId === member.id)) throw new Error("Reciprocal referrals are not eligible.");
    await tx.referral.create({ data: { inviterId: inviter.id, friendId: member.id } });
  });
}

export async function spendQuestXp(tx: Prisma.TransactionClient, userId: string, id: string) {
  const item = exchangeItems.find((entry) => entry.id === id);
  if (!item) throw new Error("That exchange item is unavailable.");
  const key = item.repeatable ? `exchange:${randomBytes(16).toString("hex")}` : `unlock:${item.id}`;
  if (!item.repeatable && await tx.questReward.findUnique({ where: { userId_key: { userId, key } } })) throw new Error("You already own this accent.");
  const spent = await tx.user.updateMany({ where: { id: userId, questXp: { gte: item.cost } }, data: { questXp: { decrement: item.cost }, ...(item.id === "pass" ? { discoveryPasses: { increment: 1 } } : { questTheme: item.id }) } });
  if (!spent.count) throw new Error("You need more Quest XP for this item.");
  await tx.questReward.create({ data: { userId, key, amount: -item.cost, label: item.name } });
  return item.name;
}

export async function qualifyReferral(tx: Prisma.TransactionClient, friendId: string) {
  const referral = await tx.referral.findUnique({ where: { friendId }, include: { friend: true } });
  if (!referral || referral.qualifiedAt || !referral.friend.emailVerified) return;
  const firstApproval = await tx.submission.count({ where: { testerId: friendId, status: "APPROVED" } });
  if (firstApproval === 0) return;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const count = await tx.referral.count({ where: { inviterId: referral.inviterId, qualifiedAt: { gte: monthStart } } });
  if (count >= referralMonthlyLimit) return;
  const qualified = await tx.referral.updateMany({ where: { id: referral.id, qualifiedAt: null }, data: { qualifiedAt: now } });
  if (!qualified.count) return;
  if (await awardQuestXp(tx, referral.inviterId, `referral:${referral.id}`, referralQuestXp, "Qualified friend referral")) {
    await tx.user.update({ where: { id: referral.inviterId }, data: { discoveryPasses: { increment: 1 } } });
  }
  await awardQuestXp(tx, friendId, `referral-welcome:${referral.id}`, 100, "First approved referral contribution");
}
