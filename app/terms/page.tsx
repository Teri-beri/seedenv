import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata("Terms", "Read SeedEnv's terms for beta testing missions, developer campaigns, submitted feedback, and tester rewards.", "/terms");

const sections = [
  {
    title: "1. The SeedEnv Platform",
    body: [
      "SeedEnv provides a specialized two-sided marketplace connecting software creators and teams (\"Developers\") with community members and QA specialists (\"Testers\") for structured beta testing, feature validation, and user feedback campaigns (\"Campaigns\").",
      "SeedEnv acts as a facilitator and platform provider. SeedEnv is not an employer, contractor, agent, or representative of either Developers or Testers.",
    ],
  },
  {
    title: "2. Eligibility & Account Registration",
    bullets: [
      { label: "Age Requirement", text: "You must be at least 18 years old (or the legal age of majority in your jurisdiction) to create an account." },
      { label: "Account Integrity", text: "You agree to provide accurate, current, and complete information during registration. You may not maintain multiple accounts, impersonate another entity, or use automated systems (bots/scrapers) to register or interact with the Platform." },
      { label: "Account Security", text: "You are responsible for safeguarding your credentials and for all activities that occur under your account. Notify us immediately if you suspect unauthorized access." },
    ],
  },
  {
    title: "3. Developer Terms & Obligations",
    bullets: [
      { label: "Campaign Rules & Instructions", text: "Developers are solely responsible for setting clear test criteria, device/environment requirements, instructions, and review benchmarks." },
      { label: "App Safety & Compliance", text: "Software, builds, URLs, and test packages provided to Testers must be lawful, free from malicious code, spyware, or harmful payloads, and compliant with all third-party platform rules (e.g., Apple App Store, Google Play Store)." },
      { label: "Funding & Reviews", text: "Developers must pre-fund or commit campaign rewards as required by the Platform. Campaign submissions must be reviewed in good faith and in a timely manner. Arbitrary rejections or bad-faith refusals to approve valid proof of completion violate these Terms and may result in immediate suspension." },
    ],
  },
  {
    title: "4. Tester Terms & Obligations",
    bullets: [
      { label: "Independent Status", text: "Testers participate in campaigns as independent third parties. Participation does not create an employment, partnership, or joint-venture relationship with SeedEnv or any Developer." },
      { label: "Authenticity of Feedback", text: "All feedback, bug reports, logs, and completion proofs must be genuine, accurate, and produced by you on qualifying hardware/software. The use of emulators (unless explicitly permitted), fake screenshots, duplicate submissions, or synthetic AI-generated feedback is strictly prohibited." },
      { label: "Confidentiality", text: "Pre-release software, unannounced features, and proprietary campaign details shared through SeedEnv are strictly confidential. You agree not to distribute, leak, screenshot, stream, or publicly discuss any beta build without express written consent from the Developer." },
    ],
  },
  {
    title: "5. Rewards, Fees, and Payouts",
    bullets: [
      { label: "Reward Eligibility", text: "Testers are only eligible for campaign rewards, bounties, or incentives upon meeting all verified requirements set by the Developer and approved under SeedEnv platform standards." },
      { label: "Review Window & Auto-Approval", text: "Developers have 48 hours from the time a Tester submits proof to approve it, reject it, or request a revision. If a submission receives no review decision within 48 hours, SeedEnv automatically approves it and releases the posted reward to the Tester from the campaign's funded reward pool. A revision request pauses this window until the Tester resubmits, which starts a new 48-hour window. Automatic approval does not limit SeedEnv's rights under Fraud & Chargebacks." },
      { label: "Platform Fees", text: "SeedEnv may charge platform fees, processing fees, or commissions on campaign transactions. Any applicable fees will be disclosed prior to checkout or funding." },
      { label: "Prepaid Balance", text: "Custom campaigns are funded from a prepaid SeedEnv balance. Developers add funds through Stripe Checkout; each top-up is charged the credited amount plus a card processing charge equal to Stripe's 2.9% + $0.30, itemized on a receipt. Each time the Developer accepts a tester, that tester's reward and the platform fee (20% of rewards, with a $15.00 minimum per campaign taken on the first acceptance) are deducted from the balance; each amount is shown before acceptance and itemized on a receipt. If the balance is insufficient, the tester is not accepted unless the Developer has enabled auto-reload, in which case the Developer authorizes SeedEnv to charge the saved payment method for the selected reload amount (or the shortfall, if larger) plus card processing. The balance does not earn interest, is not a deposit account, and can be used only for SeedEnv campaigns." },
      { label: "Balance Refunds", text: "The Developer may request a refund of the available balance at any time from Billing. Refunds are returned to the payment methods that funded the balance, most recent top-up first. Card processing charges are non-refundable. Amounts that cannot be refunded automatically remain in the balance, and SeedEnv will assist through support." },
      { label: "Refunds", text: "When a campaign is ended by the Developer or reaches its expiry, SeedEnv automatically returns unused funds. For custom campaigns, the reward and platform fee for each unused paid place are credited back to the Developer's prepaid balance. For bundles, unused tester rewards are refunded to the original payment method. For bundles, the fixed platform fee is refunded only if no tester started the campaign, except as stated in the Google Play 14-Day retention guarantee. Testers already working when a campaign ends may still submit, and approved work is paid from the held funds. Rewards already approved or paid to testers cannot be refunded. Questions: terimus@seedenv.com." },
      { label: "Google Play 14-Day Retention Guarantee", text: "For the Google Play 14-Day Closed Test bundle, if fewer than 12 SeedEnv testers remain opted in to the Developer's closed testing track for 14 continuous days during the cohort window, SeedEnv will refund the full bundle price, including the platform fee, to the original payment method. Requests must be made within 30 days after the cohort window ends and are verified against the Developer's Play Console tester data. The guarantee covers tester retention only; Google decides production access independently and SeedEnv does not guarantee approval, ranking, or store listing outcomes. The guarantee does not apply if the Developer removes testers, pauses or unpublishes the test track, or ships a build that testers cannot install." },
      { label: "Fraud & Chargebacks", text: "SeedEnv reserves the right to withhold, freeze, or reverse pending payouts, rewards, or wallet balances if fraudulent activity, manipulated submissions, or abusive payment chargebacks are detected." },
      { label: "Taxes", text: "Users are solely responsible for determining and paying any applicable income, sales, or local taxes arising from payments or rewards received." },
    ],
  },
  {
    title: "6. Intellectual Property",
    bullets: [
      { label: "SeedEnv IP", text: "All branding, interfaces, code, designs, and content provided directly by SeedEnv remain the exclusive property of SeedEnv." },
      { label: "Developer IP", text: "Developers retain full ownership of their software, applications, assets, and trade secrets." },
      { label: "Feedback License", text: "By submitting feedback, issue reports, logs, or suggestions to a Campaign, Testers grant the respective Developer a non-exclusive, perpetual, worldwide, royalty-free license to use, incorporate, and implement that feedback into their products without further compensation beyond agreed campaign rewards." },
    ],
  },
  {
    title: "Clippers Creator Agreements",
    body: [
      "Clippers is a separate paid-content collaboration area. Creators retain ownership of their videos. Upon successful payment, the developer receives a non-exclusive, 90-day organic repost license to the approved video. This specific license overrides the general feedback license for Clippers videos. Paid advertising, boosting, whitelisting, raw footage, and ownership transfer are excluded and require a separate agreement.",
      "Each agreement records a fixed creator fee, revision limit, delivery deadline, publication platform, and minimum period the post must remain public. The developer pre-funds the fee and disclosed platform charge through Stripe. This marketplace payment flow is not represented as legal escrow. Draft approval alone does not release payment; publication evidence and verification are required, followed by developer confirmation that the published video matches the approved draft.",
      "Developer review and payment release are due within 72 hours of submission, included revisions within three days of a revision request, and publication within seven days of draft approval. Creators must provide honest content, required sponsorship disclosure, and appropriate rights to music and other media. Views, conversions, and follower growth are not guaranteed. Deadlines and post-retention breaches require human dispute review; no automatic refund, payout forfeiture, or clawback is performed.",
      "Either party may raise an agreement dispute for administrator review. Unreleased funds and further work are frozen during review. Developers may cancel before creator upload starts; later refunds require administrator review. Already initiated or completed transfers require payment-provider reconciliation and are not automatically reversed. Stripe charges, transfers, and bank payouts can have different settlement times. Creators should not start work until the agreement is marked funded.",
      "Review watermarks are interface overlays, not burned-in file watermarks or copy protection. Drafts may not be reused without the agreed license. Social API verification establishes account ownership and selected post metadata, not visual identity, permanent availability, or compliance certification. Developers remain responsible for reviewing the actual public content. SeedEnv does not automatically publish to social accounts.",
    ],
  },
  {
    title: "7. Prohibited Conduct",
    body: ["You agree not to:"],
    list: [
      "Exploit, reverse-engineer, decompile, or tamper with the Platform or other users' beta builds.",
      "Sybil attack or game the platform using automated tools, scripts, or multiple accounts.",
      "Harass, threaten, or abuse other users or SeedEnv staff.",
      "Circumvent the platform by attempting to solicit off-platform payments to avoid platform fees.",
    ],
  },
  {
    title: "8. Suspension & Termination",
    body: ["We reserve the right to suspend or terminate your account and access to the Platform at our sole discretion, without prior notice, for conduct that violates these Terms, harms other users, or exposes SeedEnv to legal liability."],
  },
  {
    title: "9. Disclaimers & Limitation of Liability",
    bullets: [
      { label: "As-Is Service", text: "The Platform is provided \"as is\" and \"as available\" without warranties of any kind, whether express or implied." },
      { label: "Pre-Release Software Risk", text: "You acknowledge that beta software tested via the Platform is experimental and may contain bugs, crashes, or data-loss risks. SeedEnv is not liable for any system instability, device damage, or data loss resulting from installing third-party developer builds." },
      { label: "Limitation of Liability", text: "To the maximum extent permitted by applicable law, SeedEnv shall not be liable for any indirect, incidental, punitive, or consequential damages, or any loss of profits, data, or goodwill arising out of or related to your use of the Platform." },
    ],
  },
  {
    title: "10. Governing Law & Dispute Resolution",
    body: ["These Terms shall be governed by and construed in accordance with the laws of the State of Florida, United States, without regard to its conflict of law principles. Any legal action or proceeding arising under these Terms shall be brought exclusively in the state or federal courts located in Florida."],
  },
];

export default function TermsPage() {
  return (
    <main id="main-content" className="min-h-screen bg-[#090A0F] px-4 py-16 text-white">
      <article className="mx-auto max-w-4xl rounded-2xl border border-white/[0.08] bg-zinc-950/75 p-6 shadow-2xl shadow-black/80 sm:p-10">
        <a className="inline-flex items-center rounded-lg border border-white/[0.08] bg-zinc-950/70 px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white" href="/auth/signin">← Back to sign up</a>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">SeedEnv</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-3 text-sm text-zinc-500">Last Updated: October 6, 2026</p>

        <div className="mt-8 space-y-5 text-sm leading-7 text-zinc-400">
          <p>Welcome to <strong className="font-semibold text-zinc-200">SeedEnv</strong> (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). These Terms of Service (&quot;Terms&quot;) govern your access to and use of the SeedEnv website, applications, APIs, and related services (collectively, the &quot;Platform&quot;).</p>
          <p>By registering for an account, accessing, or using the Platform, you agree to be bound by these Terms. If you do not agree, do not use the Platform.</p>
        </div>

        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold tracking-tight text-white">{section.title}</h2>
              {section.body ? <div className="mt-4 space-y-4 text-sm leading-7 text-zinc-400">{section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div> : null}
              {section.bullets ? <ul className="mt-4 space-y-3 text-sm leading-7 text-zinc-400">{section.bullets.map((item) => <li key={item.label}><strong className="font-semibold text-zinc-200">{item.label}:</strong> {item.text}</li>)}</ul> : null}
              {section.list ? <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-zinc-400">{section.list.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            </section>
          ))}

          <section>
            <h2 className="text-xl font-semibold tracking-tight text-white">11. Contact Information</h2>
            <p className="mt-4 text-sm leading-7 text-zinc-400">If you have questions about these Terms, please contact us at:</p>
            <p className="mt-3 text-sm leading-7 text-zinc-400"><strong className="font-semibold text-zinc-200">Email:</strong> <a className="text-amber-400 transition-colors hover:text-amber-300" href="mailto:terimus@seedenv.com">terimus@seedenv.com</a></p>
          </section>
        </div>
      </article>
    </main>
  );
}
