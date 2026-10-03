"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/member";
import { serializable, awardQuestXp, awardDailyCheckIn, saveMemberReferral, spendQuestXp } from "@/lib/quest-ledger";
import { academyQuests, dailyQuestXp, exchangeItems, utcDay } from "@/lib/quest-rules";

export async function claimDailyQuest() {
  const member = await requireMember("TESTER");
  const awarded = await awardDailyCheckIn(member.id);
  revalidatePath("/quests");
  revalidatePath("/dashboard");
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
  await saveMemberReferral(member, code);
  revalidatePath("/quests");
  return "Referral saved. Verify your email and complete your first approved task to qualify.";
}
