import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { referralMonthlyLimit, referralQuestXp } from "@/lib/quest-rules";
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
