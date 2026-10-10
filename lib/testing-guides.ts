export type TestingGuide = {
  slug: string;
  title: string;
  description: string;
  intro: string;
  sections: Array<{ title: string; text: string; checklist?: string[] }>;
  sources?: Array<{ title: string; url: string }>;
};

export const testingGuides: TestingGuide[] = [
  {
    slug: "find-beta-testers",
    title: "How to find beta testers for your app",
    description: "Recruit beta testers for iOS, Android or web apps. Plan your audience, write a useful testing brief and collect actionable feedback before launch.",
    intro: "A beta test is useful when it answers a release question: can new users finish onboarding, does the core workflow make sense, or can a bug be reproduced on another device? Start with that question before deciding how many people to recruit.",
    sections: [
      {
        title: "Choose testers who match the problem",
        text: "Friends and other developers can help you catch obvious failures, but they may already understand your product. For usability feedback, include people who resemble your intended users and have not seen the interface. For compatibility testing, recruit around specific devices, operating systems and networks rather than a large, undifferentiated signup list.",
        checklist: ["Define the audience and supported devices.", "Separate first-time users from experienced users.", "Write down the release decision this test should inform."],
      },
      {
        title: "Recruit where your users already spend time",
        text: "Try your waitlist, relevant professional groups, local communities and developer networks. Ask community moderators before posting and explain what participants will do, how long it takes and whether there is a reward. A tester marketplace can complement those channels when you need a defined cohort and a consistent report format. Do not treat recruitment as buying store reviews: beta feedback should be private, honest and focused on improving the product.",
      },
      {
        title: "Make your invitation specific",
        text: "Include the build link, eligibility requirements, estimated time and the exact workflow to explore. Provide dedicated test accounts when needed, never production credentials. Describe acceptable evidence and reward conditions before someone starts. A small, clear mission is easier to complete and review than an invitation to test every feature.",
        checklist: ["State the task, time commitment and reward.", "Explain how to install or access the build.", "Request steps, expected behavior and observed behavior.", "Ask testers to redact personal information from screenshots and recordings."],
      },
      {
        title: "Turn feedback into a release checklist",
        text: "Group findings by workflow and severity. Reproduce reported failures on the same build before changing code. Fix the issues that block the main user journey, then ask for a focused retest. Keep the original evidence alongside your issue tracker so a later reviewer can understand what changed.",
      },
      {
        title: "Use SeedEnv for a focused testing cohort",
        text: "SeedEnv lets developers publish a build, define testing instructions, fund tester rewards and review submitted evidence. Choose a custom cohort or a bundle that matches your testing window. Platform fees are separate from tester rewards; published acceptance criteria and manual-review policies still apply. Recruiting testers does not guarantee store approval or product-market fit.",
      },
    ],
  },
  {
    slug: "testflight-beta-testing",
    title: "TestFlight beta testing: a developer checklist",
    description: "Prepare an iOS TestFlight beta: external tester access, build instructions, device coverage, bug reports and a focused retest before App Store submission.",
    intro: "TestFlight distributes your beta build; a testing plan makes the feedback useful. Before inviting people, decide which workflows need validation and make sure someone outside your development team can install and use the build.",
    sections: [
      {
        title: "Prepare your build and external testing group",
        text: "Upload the beta build to App Store Connect and complete the required testing information. Set up an external group and follow Apple's current beta review requirements before sharing it. Confirm that your invitation works for someone who is not on your development team. Apple manages distribution and review; SeedEnv does not bypass those processes.",
        checklist: ["Confirm the correct build is available to your tester group.", "Supply a working TestFlight invitation in your brief.", "List supported iOS versions and device requirements.", "Provide safe test accounts and explain any sandbox-only features."],
      },
      {
        title: "Choose scenarios, not a feature tour",
        text: "Ask testers to complete realistic tasks such as creating an account, recovering a session or finishing the core action. Include the expected result without telling them exactly which controls to press when usability is the question. For technical regression tests, explicit steps are appropriate. Keep production purchases and real customer data outside the testing plan.",
        checklist: ["Test first launch and permission prompts.", "Exercise the primary user workflow.", "Check session restore after closing the app.", "Include weak-network or offline behavior when supported."],
      },
      {
        title: "Capture evidence you can reproduce",
        text: "Request the device model, OS version, app build, reproduction steps and expected versus observed results. A short recording can explain an interaction problem; a screenshot may be enough for layout issues. Apple's TestFlight feedback also provides useful context, so review it alongside the reports your cohort submits. Remove access tokens, account details and other sensitive information before sharing logs.",
      },
      {
        title: "Review, fix and run a focused retest",
        text: "Prioritize crashes, blocked workflows and data-loss risks before cosmetic improvements. Track which build contained each issue and ask testers to confirm the fix on the new build. If a report comes from an older build, verify the behavior on your release candidate before marking it resolved. A passed beta scenario is evidence about that scenario, not a promise that the App Store will approve the app.",
      },
      {
        title: "Recruit a TestFlight cohort with SeedEnv",
        text: "Publish your working invitation, device requirements and proof standards in a SeedEnv cohort. Testers can apply, complete the instructions and submit evidence for review. Fund the advertised rewards and review work against the original brief. See pricing before launching and use the documentation for reporting and payout details.",
      },
    ],
    sources: [{ title: "Apple: TestFlight distribution and feedback", url: "https://developer.apple.com/testflight/" }],
  },
  {
    slug: "google-play-closed-testing",
    title: "Google Play closed testing: plan your 14-day test",
    description: "Understand Google's closed-testing requirements for new personal developer accounts, recruit Android testers and prepare honest production-access feedback.",
    intro: "Google Play closed testing is a testing process, not just a tester-count target. Plan a stable testing window, invite people who can participate, and record what you learned about your Android app before applying for production access.",
    sections: [
      {
        title: "Check whether the requirement applies to your account",
        text: "Google's published policy for personal developer accounts created after November 13, 2023 requires a closed test with at least 12 testers opted in continuously for at least 14 days before applying for production access. Requirements can change, and account circumstances differ. Read the current policy and the instructions in your own Play Console before scheduling a cohort.",
      },
      {
        title: "Prepare the closed track before recruiting",
        text: "Complete the required app setup, prepare a test release and configure tester access in Play Console. Verify the opt-in and installation journey with an eligible account. Share the appropriate invitation and explain which account testers should use. Internal testing can help catch early installation problems, but it is not a substitute for a required closed test.",
        checklist: ["Check the current requirements in Play Console.", "Confirm testers can opt in and install the intended release.", "Explain the testing dates and expected participation.", "Provide test accounts without exposing production credentials."],
      },
      {
        title: "Plan for participation, not just signups",
        text: "Recruit people who understand the full commitment, and leave room for dropouts rather than relying on the minimum number of invitations. Distinguish an invitation, an opt-in and actual feedback: they are not interchangeable. Monitor the status available in Play Console and follow up respectfully if a tester cannot access the build. Do not fabricate usage, evidence or feedback.",
      },
      {
        title: "Collect feedback throughout the test",
        text: "Give participants focused workflows and a way to report problems. Record device and build context, reproduction steps and usability observations. Keep a changelog of fixes made during the test, then ask testers to check those fixes. Meeting the opt-in duration alone does not tell you whether the app is ready for a wider audience.",
        checklist: ["Test onboarding and the main app workflow.", "Review crash, layout and network failures.", "Document feedback and the improvements it prompted.", "Keep a truthful record for the production-access questions."],
      },
      {
        title: "Apply for access with an honest testing summary",
        text: "When Play Console confirms eligibility, answer Google's production-access questions about your testers, feedback, changes and readiness. Google decides whether to grant access; a tester service cannot guarantee approval. SeedEnv offers a Google Play 14-Day cohort bundle to organize recruitment and evidence. Review the current pricing, acceptance criteria and terms before purchasing.",
      },
    ],
    sources: [{ title: "Google: testing requirements for new personal developer accounts", url: "https://support.google.com/googleplay/android-developer/answer/14151465?hl=en" }],
  },
];

export function getTestingGuide(slug: string) {
  return testingGuides.find((guide) => guide.slug === slug);
}
