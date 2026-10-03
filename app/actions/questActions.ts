"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/member";
import { serializable, awardQuestXp, qualifyReferral, spendQuestXp } from "@/lib/quest-ledger";
import { academyQuests, dailyQuestXp, exchangeItems, utcDay } from "@/lib/quest-rules";

export async function claimDailyQuest() {
  const member = await requireMember("TESTER");
  const awarded = await serializable(async (tx) => {
    await qualifyReferral(tx, member.id);
    return awardQuestXp(tx, member.id, `daily:${utcDay(new Date())}`, dailyQuestXp, "Daily tester check-in");
  });
  revalidatePath("/quests");
  return awarded ? `+${dailyQuestXp} Quest XP. Welcome back!` : "Today's check-in is already rewarded. Come back tomorrow.";
}

export async function completeAcademyQuest(id: string, answer: number) {
  const member = await requireMember("TESTER");
  const quest = academyQuests.find((item) => item.id === id);
  if (!quest || !Number.isInteger(answer) || !quest.options[answer]) throw new Error("Choose a valid exercise and answer.");
  if (quest.answer !== answer) throw new Error("Not quite. Review the question and try again.");
  const day = utcDay(new Date());
  const awarded = await serializable((tx) => awardQuestXp(tx, member.id, `academy:${id}:${day}`, 10, quest.title));
  revalidatePath("/quests");
  return awarded ? "+10 Quest XP. Exercise completed!" : "You have already earned this exercise's XP today.";
}

export async function redeemQuestItem(id: string) {
  const member = await requireMember("TESTER");
  const item = exchangeItems.find((entry) => entry.id === id);
  if (!item) throw new Error("That exchange item is unavailable.");
  await serializable((tx) => spendQuestXp(tx, member.id, id));
  revalidatePath("/quests");
  return `${item.name} unlocked.`;
}

export async function selectQuestTheme(id: string) {
  const member = await requireMember("TESTER");
  if (!["classic", "violet", "emerald"].includes(id)) throw new Error("Choose a valid accent.");
  await serializable(async (tx) => {
    if (id !== "classic" && !await tx.questReward.findUnique({ where: { userId_key: { userId: member.id, key: `unlock:${id}` } } })) throw new Error("Unlock this accent in the exchange first.");
    await tx.user.update({ where: { id: member.id }, data: { questTheme: id } });
  });
  revalidatePath("/quests");
  return "Console accent updated.";
}

export async function attachReferral(code: string) {
  const member = await requireMember();
  if (member.role === "ADMIN") throw new Error("Referrals are for member accounts.");
  const normalized = z.string().trim().min(8).max(32).regex(/^[a-zA-Z0-9]+$/).parse(code).toUpperCase();
  await serializable(async (tx) => {
    if (Date.now() - member.createdAt.getTime() > 7 * 86400000) throw new Error("Referral codes must be entered within seven days of joining.");
    if (await tx.referral.findUnique({ where: { friendId: member.id } })) throw new Error("Your account already has an inviter.");
    if (await tx.submission.count({ where: { testerId: member.id, status: "APPROVED" } })) throw new Error("Enter your referral before your first approved task.");
    const inviter = await tx.user.findUnique({ where: { referralCode: normalized } });
    if (!inviter || inviter.id === member.id) throw new Error("Enter another tester's valid referral code.");
    if (await tx.referral.findUnique({ where: { friendId: inviter.id }, select: { inviterId: true } }).then((entry) => entry?.inviterId === member.id)) throw new Error("Reciprocal referrals are not eligible.");
    await tx.referral.create({ data: { inviterId: inviter.id, friendId: member.id } });
  });
  revalidatePath("/quests");
  return "Referral saved. Verify your email and complete your first approved task to qualify.";
}
