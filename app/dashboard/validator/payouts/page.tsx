import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth-options";
import { StripeSettingsCard } from "@/components/stripe-settings-card";
import { payoutScheduleLabel } from "@/lib/enterprise-rules";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { formatCents } from "@/lib/utils";

export const metadata = { title: "Stripe Connect Payouts", robots: { index: false, follow: false } };

export default async function ValidatorPayoutsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin?role=TESTER&callbackUrl=%2Fdashboard%2Fvalidator%2Fpayouts");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !["TESTER", "ADMIN"].includes(user.role)) redirect("/account");
  const [paid, pending, ledger] = await Promise.all([
    prisma.walletTransaction.aggregate({ where: { userId: user.id, type: "BOUNTY_PAYOUT", status: "COMPLETED" }, _sum: { amountCents: true } }),
    prisma.walletTransaction.aggregate({ where: { userId: user.id, type: "BOUNTY_PAYOUT", status: "PENDING" }, _sum: { amountCents: true }, _count: true }),
    prisma.walletTransaction.findMany({ where: { userId: user.id, type: "BOUNTY_PAYOUT" }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  let payoutsEnabled = false;
  let submitted = false;
  let country: string | null = null;
  let bankLabel = "No bank account connected";
  let schedule = "Set by your connected Stripe account";
  let providerError = false;
  if (process.env.STRIPE_SECRET_KEY && user.stripeConnectAccountId) {
    try {
      const stripe = getStripe();
      const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
      payoutsEnabled = account.payouts_enabled;
      submitted = account.details_submitted;
      country = account.country || null;
      schedule = payoutScheduleLabel(account.settings?.payouts?.schedule);
      const accounts = await stripe.accounts.listExternalAccounts(account.id, { object: "bank_account", limit: 10 });
      const bank = accounts.data.find((item) => item.object === "bank_account" && item.default_for_currency) || accounts.data[0];
      if (bank?.object === "bank_account") bankLabel = `${bank.bank_name || "Bank account"} ****${bank.last4}`;
    } catch { providerError = true; bankLabel = "Bank information unavailable"; schedule = "Schedule unavailable"; }
  }
  return <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 text-white sm:px-6 lg:px-8">
    <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white">Back to Validator Console</Link>
    <h1 className="mt-5 text-3xl font-semibold">Stripe Connect Payouts</h1>
    <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-400">Stripe Express receives payments for verified cohort work. Bank payout timing follows your connected account schedule and local settlement rules. Tax document availability depends on your country and the platform&apos;s Stripe tax-reporting configuration.</p>
    {providerError ? <p role="status" className="mt-4 text-sm text-amber-300">Stripe account data is temporarily unavailable. Recorded payout totals below remain available.</p> : null}
    <dl className="my-8 grid gap-6 border-y border-white/10 py-6 sm:grid-cols-3">
      <div><dt className="text-xs font-mono uppercase text-zinc-400">Connected Bank</dt><dd className="mt-2 text-sm">{bankLabel}</dd></div>
      <div><dt className="text-xs font-mono uppercase text-zinc-400">Payout Schedule</dt><dd className="mt-2 text-sm">{schedule}</dd></div>
      <div><dt className="text-xs font-mono uppercase text-zinc-400">Lifetime Earned</dt><dd className="mt-2 font-mono text-emerald-300">{formatCents((paid._sum.amountCents || 0) + (pending._sum.amountCents || 0))}</dd><dd className="mt-2 text-xs text-zinc-500">Paid {formatCents(paid._sum.amountCents || 0)} / pending {formatCents(pending._sum.amountCents || 0)}</dd></div>
    </dl>
    <StripeSettingsCard role="TESTER" stripeConfigured={Boolean(process.env.STRIPE_SECRET_KEY)} paymentMethodSaved={false} connectAccountId={user.stripeConnectAccountId} connectCountry={country} connectDetailsSubmitted={submitted} payoutsEnabled={payoutsEnabled} pendingPayoutCount={pending._count} pendingPayoutAmountCents={pending._sum.amountCents || 0} />
    <section className="mt-10"><h2 className="text-xl font-semibold">Earned Ledger</h2><div className="mt-5 divide-y divide-white/10 border-y border-white/10">{ledger.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="text-sm text-zinc-200">{item.description}</p><p className="mt-1 text-xs text-zinc-500">{item.createdAt.toISOString().slice(0, 10)} / {item.status.toLowerCase()}</p></div><span className="font-mono text-sm">{formatCents(item.amountCents)}</span></div>)}{!ledger.length ? <p className="py-6 text-sm text-zinc-400">No verified cohort payouts yet.</p> : null}</div></section>
  </main>;
}