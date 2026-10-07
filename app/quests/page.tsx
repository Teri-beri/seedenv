import { randomBytes } from "node:crypto";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { MemberShell } from "@/components/member-shell";
import { QuestCenter } from "@/components/quest-center";
import { requireMember } from "@/lib/member";
import { prisma } from "@/lib/prisma";
import { utcDay } from "@/lib/quest-rules";
import { qualifyReferral, serializable } from "@/lib/quest-ledger";

export const dynamic = "force-dynamic";

export default async function QuestsPage() {
  if (!await getServerSession(authOptions)) redirect("/auth/signin?callbackUrl=/quests");
  const member = await requireMember();
  if (member.role !== "TESTER") redirect(member.role === "ADMIN" ? "/admin" : "/console");
  const user = await serializable(async (tx) => {
    await qualifyReferral(tx, member.id);
    const current = await tx.user.findUniqueOrThrow({ where: { id: member.id } });
    if (current.referralCode) return current;
    return tx.user.update({ where: { id: member.id }, data: { referralCode: randomBytes(8).toString("hex").toUpperCase() } });
  });
  const [rewards, referrals, received, lifetime] = await Promise.all([
    prisma.questReward.findMany({ where: { userId: user.id, OR: [{ key: { startsWith: "unlock:" } }, { key: { endsWith: utcDay(new Date()) } }] }, select: { key: true } }),
    prisma.referral.groupBy({ by: ["qualifiedAt"], where: { inviterId: user.id }, _count: { _all: true } }),
    prisma.referral.findUnique({ where: { friendId: user.id }, select: { qualifiedAt: true } }),
    prisma.questReward.aggregate({ where: { userId: user.id, amount: { gt: 0 } }, _sum: { amount: true } }),
  ]);
  const qualified = referrals.filter((item) => item.qualifiedAt).reduce((total, item) => total + item._count._all, 0);
  const pending = referrals.filter((item) => !item.qualifiedAt).reduce((total, item) => total + item._count._all, 0);
  return <MemberShell title="Quest Center" home="/dashboard"><QuestCenter balance={user.questXp} lifetimeXp={lifetime._sum.amount || 0} passes={user.discoveryPasses} code={user.referralCode || ""} theme={user.questTheme} owned={rewards.filter((item) => item.key.startsWith("unlock:")).map((item) => item.key.split(":")[1])} completed={rewards.filter((item) => item.key.startsWith("academy:")).map((item) => item.key.split(":")[1])} dailyClaimed={rewards.some((item) => item.key === `daily:${utcDay(new Date())}`)} referralStatus={`${qualified} qualified / ${pending} pending. ${received ? received.qualifiedAt ? "Your inviter reward qualified." : "Your inviter is saved; verification and approval are still required." : "No inviter attached to your account."}`} /><p className="mt-6 text-xs text-neutral-500">Opening your authenticated Tester Console automatically grants the daily check-in once per UTC day. You can also collect it here. Verify your email using the email access link; OAuth connection alone does not qualify a referral.</p></MemberShell>;
}
