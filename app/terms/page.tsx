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
      { label: "Platform Fees", text: "SeedEnv may charge platform fees, processing fees, or commissions on campaign transactions. Any applicable fees will be disclosed prior to checkout or funding." },
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
    <main className="min-h-screen bg-[#090A0F] px-4 py-16 text-white">
      <article className="mx-auto max-w-4xl rounded-2xl border border-white/[0.08] bg-zinc-950/75 p-6 shadow-2xl shadow-black/80 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">SeedEnv</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-3 text-sm text-zinc-500">Last Updated: September 24, 2026</p>

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
