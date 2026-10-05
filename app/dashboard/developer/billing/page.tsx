import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { CompanyBillingForm } from "@/components/company-billing-form";
import { prisma } from "@/lib/prisma";
import { invoiceSnapshotSchema } from "@/lib/enterprise-rules";
import { formatCents } from "@/lib/utils";

export const metadata = { title: "Company Billing", robots: { index: false, follow: false } };

export default async function DeveloperBillingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin?role=DEVELOPER&callbackUrl=%2Fdashboard%2Fdeveloper%2Fbilling");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !["DEVELOPER", "ADMIN"].includes(user.role)) redirect("/account");
  const [profile, history] = await Promise.all([
    prisma.billingProfile.findUnique({ where: { userId: user.id } }),
    prisma.walletTransaction.findMany({ where: { userId: user.id, type: "ESCROW_DEPOSIT" }, orderBy: { createdAt: "desc" }, take: 100, include: { campaign: { select: { id: true } } } }),
  ]);
  const initial = { companyName: profile?.companyName || user.companyName || "", taxId: profile?.taxId || "", addressLine1: profile?.addressLine1 || "", addressLine2: profile?.addressLine2 || "", city: profile?.city || "", region: profile?.region || "", postalCode: profile?.postalCode || "", country: profile?.country || "US" };
  return <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 text-white sm:px-6 lg:px-8">
    <Link href="/console?view=billing" className="text-sm text-zinc-400 hover:text-white">Back to Developer Console</Link>
    <h1 className="mt-5 text-3xl font-semibold">Invoicing &amp; Billing</h1>
    <section className="mt-8 border-y border-white/10 py-7"><h2 className="mb-5 text-xl font-semibold">Company Billing Details</h2><CompanyBillingForm initial={initial} /></section>
    <section className="mt-10"><h2 className="text-xl font-semibold">Billing History</h2><p className="mt-2 text-sm text-zinc-400">Latest 100 funding records. Current pricing adds 5% to tester rewards; historical fees remain as charged. Completed payments with checkout snapshots include PDF receipts.</p>
      <div className="mt-5 overflow-x-auto rounded-lg border border-white/10"><table className="min-w-[640px] w-full text-left text-sm"><thead className="bg-[#12161F] text-zinc-400"><tr>{["Date", "Cohort ID", "Amount", "Fee (5% current)", "Invoice"].map((title) => <th key={title} className="px-4 py-3 font-medium">{title}</th>)}</tr></thead><tbody className="divide-y divide-white/10">
        {history.map((transaction) => { const snapshot = invoiceSnapshotSchema.safeParse(transaction.invoiceSnapshot); const downloadable = transaction.status === "COMPLETED" && snapshot.success; return <tr key={transaction.id}><td className="px-4 py-4">{transaction.createdAt.toISOString().slice(0, 10)}</td><td className="max-w-52 break-all px-4 py-4 font-mono text-xs">{snapshot.success ? snapshot.data.cohortId : transaction.campaignId || "Legacy funding record"}</td><td className="px-4 py-4 font-mono">{formatCents(transaction.amountCents)}<span className="mt-1 block font-sans text-xs text-zinc-500">{transaction.status.toLowerCase()}</span></td><td className="px-4 py-4 font-mono">{transaction.platformFeeCents === null ? "Not recorded" : formatCents(transaction.platformFeeCents)}</td><td className="px-4 py-4">{downloadable ? <a href={`/api/billing/invoices/${transaction.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/10 px-3" download title="Download PDF invoice"><Download className="size-4" />PDF Invoice</a> : <span className="text-xs text-zinc-500">{transaction.status === "COMPLETED" ? "Legacy receipt: contact support" : "Awaiting confirmed payment"}</span>}</td></tr>; })}
        {!history.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400">No cohort funding transactions yet.</td></tr> : null}
      </tbody></table></div>
    </section>
  </main>;
}