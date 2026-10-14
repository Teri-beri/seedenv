import Link from "next/link";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata("Validator & Tester Terms", "SeedEnv payout, escrow, tax, and Stripe Express disclosures for validators and testers.", "/legal/validator-terms");

const sections = [
  {
    title: "Operator and legal entity",
    body: [
      "SeedEnv is operated by TERIMUS LLC, a Florida single-member LLC. Any legal, payment, tax, or operational disclosure on the platform is made under the authority of TERIMUS LLC unless a separate written agreement or invoice explicitly states otherwise.",
      "TERIMUS LLC is the entity responsible for platform operations, developer payouts, and the Stripe Express integration used by testers to receive approved rewards.",
    ],
  },
  {
    title: "Payout and escrow rules",
    body: [
      "Approved tester rewards are held in escrow and released through Stripe Express only after proof is approved or the default review window expires without a valid denial or revision request.",
      "The connected Stripe Express account determines bank routing, settlement timing, tax-document availability, and payout-readiness. SeedEnv does not file or store tax forms by itself.",
      "SeedEnv may temporarily hold a payout if a review, fraud check, or provider requirement prevents release. Any hold is specific to the disputed item and does not automatically revoke unrelated earnings or already-paid amounts.",
    ],
  },
  {
    title: "Tax and KYC compliance disclosures",
    body: [
      "SeedEnv does not collect SSNs, EINs, TINs, or other tax-identification numbers in the application database. Tax documents, 1099s, and identity verification are managed directly in Stripe Express when required by the connected account and local tax rules.",
      "You remain responsible for providing accurate tax and payout information to Stripe and for complying with the laws, reporting obligations, and withholding requirements applicable to your jurisdiction.",
      "If your payout, tax status, or bank account requires changes, update those details in Stripe Express rather than sending documents through SeedEnv messaging or direct email.",
    ],
  },
  {
    title: "Confidentiality and evidence",
    body: [
      "Testers must provide genuine evidence of completed work, including videos, screenshots, recorded logs, or mission-check evidence as required by the active campaign instructions.",
      "All pre-release software, builds, and campaign details remain confidential unless an explicit disclosure or public release has been approved by the developer and the platform. Do not redistribute or leak unreleased builds.",
    ],
  },
];

export default function ValidatorTermsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 text-zinc-100 sm:px-6 lg:px-8">
      <p className="text-xs font-mono uppercase tracking-[0.24em] text-emerald-400">SeedEnv · Validator & tester terms</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Payouts, escrow & tax disclaimer</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
        These terms govern how SeedEnv, operated by TERIMUS LLC, handles payouts, escrow, testing evidence, and tax-document routing for validation work. They supplement the general SeedEnv Terms and Privacy Policy.
      </p>

      <div className="mt-8 space-y-8">
        {sections.map((section) => (
          <section key={section.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <h2 className="text-xl font-semibold text-white">{section.title}</h2>
            <div className="mt-4 space-y-3 text-sm leading-7 text-zinc-400">
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-sm text-zinc-300">
        <p className="font-medium text-emerald-200">Need to open your Stripe dashboard?</p>
        <p className="mt-2 leading-6 text-zinc-400">
          You can manage connected bank details and access tax documents in Stripe Express from your account. For additional help, review the <Link href="/tester/faq" className="text-emerald-300 underline">tester FAQ</Link> or contact <a href="mailto:terimus@seedenv.com" className="text-emerald-300 underline">terimus@seedenv.com</a>.
        </p>
      </div>
    </main>
  );
}
