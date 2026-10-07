import Link from "next/link";
import { faqGroups as groups } from "@/lib/faq-content";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata("FAQ", "Answers to common questions about SeedEnv cohorts, fees, escrow, tester rewards, payouts, and refunds.", "/faq");


const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: groups.flatMap((group) => group.items.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } }))),
};

export default function FaqPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c") }} />
      <h1>Frequently Asked Questions</h1>
      <p>Can&apos;t find what you need? <Link href="/contact" className="text-emerald-300 underline">Contact us</Link> or read the <Link href="/docs" className="text-emerald-300 underline">documentation</Link>.</p>
      {groups.map((group) => (
        <section key={group.title} className="mt-10">
          <h2>{group.title}</h2>
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
    </>
  );
}
