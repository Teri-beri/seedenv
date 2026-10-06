import Link from "next/link";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata("FAQ", "Answers to common questions about SeedEnv cohorts, fees, escrow, tester rewards, payouts, and refunds.", "/faq");

const groups = [
  {
    title: "For developers",
    items: [
      { q: "What is SeedEnv?", a: "SeedEnv is a pre-release QA and human validation platform. Developers fund a cohort for a TestFlight or Play testing build, and verified testers complete defined tasks and submit structured reports with proof." },
      { q: "How much does SeedEnv cost?", a: "You choose the reward per task and the number of tester slots. SeedEnv adds a 5% platform fee on top of the reward pool at checkout. For example, $100 in rewards plus a $5 platform fee is $105 total, before separate Stripe fees where applicable. The fee is never deducted from the advertised tester reward." },
      { q: "How does escrow work?", a: "Your reward pool is funded through Stripe before the cohort goes live. Cohorts activate only after signed payment confirmation, and rewards are released to testers only when you approve their submissions." },
      { q: "Can I get a refund?", a: "Unused tester reward funds (rewards not yet approved or paid) are refundable on request, after manual review, minus any non-recoverable Stripe processing fees. The 5% platform fee is non-refundable once a cohort is funded, and rewards already approved or paid cannot be refunded." },
      { q: "Do I get receipts for my company?", a: "Yes. Company billing details and downloadable PDF receipts are available in the Billing section of the developer console." },
    ],
  },
  {
    title: "For testers",
    items: [
      { q: "Who can become a tester?", a: "Anyone 18 or older who agrees to the Terms of Service. Some cohorts require specific devices, operating system versions, or reputation levels." },
      { q: "Am I guaranteed to be paid?", a: "No. Rewards are credited only after the developer approves your submission against the cohort's acceptance criteria. Signing up or submitting work does not guarantee approval or earnings." },
      { q: "How do payouts work?", a: "Connect a Stripe Express account to receive approved rewards. Your connected account's schedule determines when funds reach your bank. Approved work stays pending until its payment transfer succeeds." },
      { q: "Can I share what I'm testing?", a: "No. Unreleased builds and confidential developer details must be kept private, as covered by the Terms of Service." },
    ],
  },
  {
    title: "Account & security",
    items: [
      { q: "How do I sign in?", a: "Use an email magic link, GitHub, or Google. SeedEnv staff will never ask you for a password or sign-in link." },
      { q: "How do I delete my account or request my data?", a: "Email terimus@seedenv.com from your account email. Some payment and tax records must be kept for legal reasons; see the Privacy Policy for details." },
      { q: "How do I report a security issue?", a: "Follow the security disclosure policy and email terimus@seedenv.com privately with the subject \"SeedEnv Security Disclosure\"." },
    ],
  },
];

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
