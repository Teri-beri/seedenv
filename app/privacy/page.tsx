const sections = [
  {
    title: "1. Information We Collect",
    body: ["We collect information directly from you, automatically through your use of the Platform, and from third-party services."],
    bullets: [
      { label: "Account & Authentication Information", text: "When you sign up or log in (via email magic links, GitHub, or Google OAuth), we collect your name, email address, username, and authentication identifiers." },
      { label: "Developers", text: "Organization details, project URLs, test build files/links, campaign specifications, and payout/funding preferences." },
      { label: "Testers", text: "Device specifications, operating system versions, testing hardware profiles, and feedback submissions." },
      { label: "Test Submissions & Proof Files", text: "Files uploaded to verify completed tasks, including bug reports, crash logs, system diagnostics, feedback notes, screenshots, and screen recordings." },
      { label: "Payment & Transaction Details", text: "Payment processing, campaign escrow, and tester reward payouts are handled by third-party payment processors (such as Stripe). We do not store complete credit card numbers or banking account credentials directly on our servers; we retain only reference transaction tokens, payout status, and invoice histories." },
      { label: "Automated Technical Data", text: "IP addresses, browser type, device identifiers, session timestamps, and interaction events recorded via server logs and privacy-preserving analytics." },
    ],
  },
  {
    title: "2. How We Use Your Information",
    body: ["We use the collected information strictly to provide, maintain, and secure the Platform, including:"],
    list: [
      "Creating and managing your user account and role settings (Developer vs. Tester).",
      "Facilitating beta campaigns, distributing test instructions, and delivering tester proof files to developers for review.",
      "Managing campaign rewards, bounties, and escrow disbursement via our payment partners.",
      "Detecting, preventing, and mitigating fraudulent behavior, bot registrations, duplicate accounts, and invalid submission proofs.",
      "Sending essential service communications, such as authentication links, campaign updates, submission approvals, and security alerts.",
    ],
  },
  {
    title: "3. How We Share Your Information",
    body: ["We do not sell, rent, or trade your personal information. We only share data in the following operational scenarios:"],
    bullets: [
      { label: "Between Developers and Testers", text: "When a tester submits proof of completion for a campaign, the associated developer receives access to the submitted feedback, uploaded proof files, screenshots/recordings, and tester platform username to verify campaign completion." },
      { label: "Cloud Storage", text: "Secure hosting for uploaded tester proof files, screenshots, and campaign assets." },
      { label: "Authentication & Email", text: "Providers delivering transactional emails and secure magic-link sign-ins." },
      { label: "Payment & Escrow Processors", text: "Stripe for processing developer campaign deposits and tester reward payouts." },
      { label: "Hosting & Analytics", text: "Cloud infrastructure hosts and monitoring services." },
      { label: "Legal Requirements", text: "We may disclose information if required by law, regulation, subpoena, or legal process, or to protect the vital interests, safety, and integrity of SeedEnv and its users." },
    ],
  },
  {
    title: "4. Data Security & Storage",
    body: [
      "We implement industry-standard technical and organizational security measures, including encrypted data transit (TLS/HTTPS), isolated cloud storage buckets, and restricted database access controls, to safeguard your information.",
      "Tester proof files and campaign submissions are stored for the duration necessary to satisfy campaign review windows, resolve verification disputes, and maintain platform records.",
    ],
  },
  {
    title: "5. Your Rights & Choices",
    body: ["Depending on your jurisdiction, you may have rights regarding your personal data, including:"],
    bullets: [
      { label: "Access & Portability", text: "Requesting a copy of the personal data we hold about you." },
      { label: "Correction", text: "Updating or amending inaccurate personal details through your account settings." },
      { label: "Deletion", text: "Requesting the deletion of your account and personal data, subject to legal or transactional retention obligations (e.g., historical tax or payment records)." },
      { label: "Communication Preferences", text: "Opting out of non-essential campaign notifications." },
    ],
  },
  {
    title: "6. Third-Party Links & External Software",
    body: ["The Platform may contain links to external developer websites, app stores, or third-party beta distribution tools (e.g., TestFlight, Google Play Internal Testing, Firebase App Distribution). We are not responsible for the privacy practices, content, or data collection policies of external developers or third-party platforms."],
  },
  {
    title: "7. Children's Privacy",
    body: ["SeedEnv is strictly intended for individuals who are 18 years of age or older. We do not knowingly collect or solicit personal information from children under 13 (or under 16 in certain jurisdictions)."],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#090A0F] px-4 py-16 text-white">
      <article className="mx-auto max-w-4xl rounded-2xl border border-white/[0.08] bg-zinc-950/75 p-6 shadow-2xl shadow-black/80 sm:p-10">
        <a className="inline-flex items-center rounded-lg border border-white/[0.08] bg-zinc-950/70 px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white" href="/auth/signin">← Back to sign up</a>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">SeedEnv</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-sm text-zinc-500">Last Updated: September 2026</p>

        <div className="mt-8 space-y-5 text-sm leading-7 text-zinc-400">
          <p>At <strong className="font-semibold text-zinc-200">SeedEnv</strong> (&quot;Company,&quot; &quot;we,&quot; &quot;our,&quot; or &quot;us&quot;), we respect your privacy and are committed to protecting the personal information you share with us.</p>
          <p>This Privacy Policy outlines how we collect, use, store, and protect your data when you visit our website, use our platform, or participate in beta testing campaigns (collectively, the &quot;Platform&quot;).</p>
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
            <h2 className="text-xl font-semibold tracking-tight text-white">8. Contact Us</h2>
            <p className="mt-4 text-sm leading-7 text-zinc-400">If you have questions, concerns, or requests regarding this Privacy Policy or your personal information, please contact us:</p>
            <p className="mt-3 text-sm leading-7 text-zinc-400"><strong className="font-semibold text-zinc-200">Email:</strong> <a className="text-amber-400 transition-colors hover:text-amber-300" href="mailto:terimus@seedenv.com">terimus@seedenv.com</a></p>
          </section>
        </div>
      </article>
    </main>
  );
}
