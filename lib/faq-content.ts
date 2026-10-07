// Shared by the FAQ page and the AI support assistant so both give the same answers.
export const faqGroups = [
  {
    title: "For developers",
    items: [
      { q: "What is SeedEnv?", a: "SeedEnv is a pre-release QA and human validation platform. Developers fund a cohort for a TestFlight or Play testing build, and verified testers complete defined tasks and submit structured reports with proof." },
      { q: "How much does SeedEnv cost?", a: "You choose the reward per task and the number of tester slots. Custom drops are pay-per-tester from a prepaid balance: you top up (from $10) instead of paying the whole budget, and each tester you accept draws their reward plus a 20% platform fee (with a $15 minimum per cohort, taken with the first accepted tester). There are no card processing or top-up fees. For example, 25 testers at $4 is $100 in rewards and $20 in platform fees, $120 in total if every place fills. Flat bundles are also available: the Google Play 14-Day Closed Test is $199 and the Flash Concurrency Drop is $349. The fee is never deducted from the advertised tester reward." },
      { q: "How does escrow work?", a: "On custom drops, each tester's reward is drawn from your prepaid balance and held the moment you accept them, so testers always start against funded money. Bundles are paid in full through Stripe before the cohort goes live. Either way, rewards are released to testers only when you approve their submissions (or automatically after 48 hours without review)." },
      { q: "What if not enough testers join, or I cancel?", a: "On custom drops you only pay for testers you accept. If an accepted tester withdraws, misses the 24-hour start window or is rejected, their paid place is reused for your next acceptance before anything new is drawn. When you end a cohort, or it reaches its 30-day expiry, every paid place nobody is using goes back to your balance automatically (reward + platform fee). You can reuse the balance or refund it to your card any time from Billing. Testers already working when you end a cohort can still submit and are paid for approved work." },
      { q: "What happens if I don't review a submission?", a: "You have 48 hours after a tester submits proof to approve, reject, or request a revision. Submissions left unreviewed for 48 hours are approved automatically and the reward is released from your funded pool. Requesting a revision pauses the clock until the tester resubmits. The console shows how long each pending proof has left." },
      { q: "Can I get a refund?", a: "Yes. On custom drops, unused places (reward + platform fee) return to your prepaid balance when you end a cohort or it expires, and you can refund the balance in full to your card any time from Billing. On prepaid bundles, unused rewards are refunded, and the platform fee is refunded only if no tester ever started, except under the Google Play 14-Day retention guarantee: if fewer than 12 SeedEnv testers stay opted in to your closed test for 14 continuous days, the full $199 is refunded. Rewards already approved or paid cannot be refunded." },
      { q: "Do I get receipts for my company?", a: "Yes. Company billing details and downloadable PDF receipts are available in the Billing section of the developer console." },
    ],
  },
  {
    title: "For testers",
    items: [
      { q: "Who can become a tester?", a: "Anyone 18 or older who agrees to the Terms of Service. Some cohorts require specific devices, operating system versions, or reputation levels." },
      { q: "Am I guaranteed to be paid?", a: "No. Rewards are credited only when your submission is approved, either by the developer against the cohort's acceptance criteria or automatically if the developer makes no review decision within 48 hours of your submission. A rejection or revision request stops the automatic approval. Signing up or submitting work does not guarantee approval or earnings." },
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
