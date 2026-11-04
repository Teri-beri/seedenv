import Link from "next/link";
import { RefundsAdminPanel } from "@/components/admin/refunds-admin-panel";
import { requirePromoOperator } from "@/lib/cohort-promos";
import { listStuckPayouts } from "@/lib/payout-repair";
import { listRefundQueue } from "@/lib/refunds";

export const dynamic = "force-dynamic";

export default async function AdminRefundsPage() {
  await requirePromoOperator();
  const [requests, payouts] = await Promise.all([listRefundQueue(), listStuckPayouts()]);
  return <main className="min-h-screen bg-[#0A0D12] px-4 py-8 text-white">
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/account?tab=resources" className="inline-flex min-h-11 items-center text-sm text-zinc-400 transition-colors hover:text-zinc-200">← Back to settings</Link>
      <div>
        <p className="font-mono text-xs uppercase tracking-wider text-amber-400/80">Operator only</p>
        <h1 className="mt-1 text-2xl font-semibold">Refunds &amp; payout repair</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Every developer refund is decided here. Card refunds go back to the original Stripe payment; balance credit is available immediately. Unused escrow is still refunded automatically when a cohort ends, so only exceptional cases arrive in this queue.</p>
      </div>
      <RefundsAdminPanel requests={requests} payouts={payouts} />
    </div>
  </main>;
}
