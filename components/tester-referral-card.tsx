import Link from "next/link";
import { ArrowUpRight, Users } from "lucide-react";
import { CopyTextButton } from "@/components/ui/copy-text-button";
import { testerReferralVerificationCopy } from "@/lib/organic-growth";
import type { TesterReferralStats } from "@/lib/tester-referrals";
import { formatCents } from "@/lib/utils";

export function TesterReferralCard({ stats, expanded = false }: { stats: TesterReferralStats; expanded?: boolean }) {
  return <section aria-labelledby="tester-referral-heading" className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-[#171923] to-zinc-950 p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-emerald-400"><Users className="size-4" /> Grow the tester network</p><h2 id="tester-referral-heading" className="mt-2 text-xl font-semibold tracking-tight text-zinc-200">Earn with your network</h2><p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">Invite a friend. Earn a $1 bounty when their first qualifying bug is approved by a developer.</p></div>
      <CopyTextButton text={stats.inviteUrl} label="Copy Invite Link" />
    </div>
    <p className="mt-4 select-all break-all rounded-lg border border-white/[0.08] bg-black/25 p-3 font-mono text-xs text-zinc-400">{stats.inviteUrl}</p>
    <div className="mt-4 grid grid-cols-1 gap-3 min-[400px]:grid-cols-3">{[
      ["Total Friends Invited", stats.totalInvited.toLocaleString("en-US")],
      ["Pending First Bug", stats.pendingFirstBug.toLocaleString("en-US")],
      ["Total Bounty Earned", formatCents(stats.earnedCents)],
    ].map(([label, value]) => <div key={label} className="rounded-xl border border-white/[0.08] bg-zinc-900/40 p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</p><p className="mt-2 font-mono text-xl text-zinc-200">{value}</p></div>)}</div>
    <p className="mt-4 text-xs leading-5 text-zinc-500">{testerReferralVerificationCopy}</p>
    {expanded ? <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <p className="text-sm text-zinc-300">{formatCents(stats.pendingPayoutCents)} in referral rewards awaiting Stripe transfer.</p>
      <p className="mt-2 text-xs leading-5 text-zinc-400">Rewards are credited to your earnings ledger once, then paid through your linked Stripe account. Your displayed wallet balance increases only after Stripe confirms the transfer. SeedEnv funds these rewards; developer escrow is never used.</p>
      <Link href="/account?tab=portfolio#stripe-setup" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-emerald-300">Payout setup &amp; retry<ArrowUpRight className="size-4" /></Link>
      <Link href="/account?tab=profile" className="ml-4 inline-flex min-h-11 items-center text-sm text-zinc-300">Complete profile</Link>
    </div> : <Link href="/dashboard/tester/referrals" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm text-emerald-300">Referral rules &amp; payouts<ArrowUpRight className="size-4" /></Link>}
  </section>;
}
