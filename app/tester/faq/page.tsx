import Link from "next/link";
import { faqGroups } from "@/lib/faq-content";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata("Tester FAQ", "Tester payout, escrow, and tax guidance for SeedEnv missions and Stripe Express withdrawals.", "/tester/faq");

export default function TesterFaqPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 text-zinc-100 sm:px-6 lg:px-8">
      <p className="text-xs font-mono uppercase tracking-[0.24em] text-emerald-400">SeedEnv · Tester guidance</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Payouts, escrow & tax guidance</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
        SeedEnv is operated by TERIMUS LLC, a Florida single-member LLC. We do not collect SSNs, EINs, or other tax-identification data in the platform database. Payout setup, bank information, tax forms, and Stripe Express management all happen in Stripe.
      </p>

      <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 text-sm text-zinc-300">
        <p className="font-medium text-zinc-100">Important disclosure</p>
        <p className="mt-2 leading-6 text-zinc-400">
          Approved rewards remain pending until the Stripe Express account successfully settles. SeedEnv does not hold or store separate tax documents or residential tax paperwork. If you need to update your bank account or access your 1099 forms, open the Stripe Express dashboard from your account or visit the <Link href="/legal/validator-terms" className="text-emerald-300 underline">validator terms</Link>.
        </p>
      </div>

      <div className="mt-10 space-y-10">
        {faqGroups.map((group) => (
          <section key={group.title}>
            <h2 className="text-xl font-semibold text-white">{group.title}</h2>
            <div className="mt-4 divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/40">
              {group.items.map((item) => (
                <details key={item.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-zinc-100">
                    {item.q}
                    <span aria-hidden className="font-mono text-zinc-500 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <div className="mt-3 text-sm leading-6 text-zinc-400">{item.a}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
