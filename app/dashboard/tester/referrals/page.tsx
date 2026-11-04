import { after } from "next/server";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { requireMember } from "@/lib/member";
import { getTesterReferralStats, awardTesterReferralBounty } from "@/lib/tester-referrals";
import { serializable } from "@/lib/quest-ledger";
import { releaseTesterPayouts } from "@/lib/submission-approval";
import { TesterReferralCard } from "@/components/tester-referral-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tester referral rewards", robots: { index: false, follow: false } };

export default async function ReferralsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin?role=TESTER&callbackUrl=%2Fdashboard%2Ftester%2Freferrals");
  if (session.user.role !== "TESTER") redirect("/account");
  const tester = await requireMember("TESTER");
  const reward = await serializable((tx) => awardTesterReferralBounty(tx, tester.id));
  if (reward) after(() => releaseTesterPayouts(reward.userId).then(() => undefined));
  const stats = await getTesterReferralStats(tester.id);
  return <main id="main-content" className="min-h-screen bg-[#09090b] px-4 py-8 text-zinc-200 sm:px-6"><div className="mx-auto max-w-3xl"><Link href="/dashboard?view=missions" className="mb-6 inline-flex min-h-11 items-center text-sm text-zinc-400 hover:text-emerald-300">Back to tester dashboard</Link><TesterReferralCard stats={stats} expanded /></div></main>;
}
