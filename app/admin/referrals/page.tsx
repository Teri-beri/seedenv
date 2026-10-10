import Link from "next/link";
import { requirePromoOperator } from "@/lib/cohort-promos";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReferralAudits() {
  await requirePromoOperator();
  const audits = await prisma.referralAudit.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100"><div className="mx-auto max-w-5xl">
    <Link href="/admin" className="text-emerald-300 underline">Back to admin</Link>
    <h1 className="mt-6 text-2xl font-semibold">Referral clawback audit</h1>
    <p className="mt-2 text-sm text-zinc-400">Latest 100 recoveries. These are actual servicing-fee savings, not tester reward deductions. Negative funding balances block spending until repaid.</p>
    <ul className="mt-6 space-y-3">{audits.map(audit => <li key={audit.id} className="rounded-lg border border-zinc-800 p-4">
      <p>{audit.reason} - {formatCents(audit.amountCents)}</p>
      <p className="mt-1 break-all font-mono text-xs text-zinc-400">Account {audit.userId} / credit {audit.creditId} / cohort {audit.campaignId} / {audit.createdAt.toISOString()}</p>
    </li>)}</ul>
    {!audits.length ? <p className="mt-6 text-zinc-400">No referral clawbacks recorded.</p> : null}
  </div></main>;
}
