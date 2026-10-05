import Link from "next/link";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata("About", "Learn how SeedEnv connects indie developers with beta testers for structured app feedback and launch validation.", "/about");

export default function AboutPage() {
  return (
    <>
      <h1>About SeedEnv</h1>
      <p>SeedEnv connects indie developers with beta testers for mobile and web apps. Developers publish focused missions; testers submit real usage evidence and qualitative feedback.</p>
      <h2>Feedback before launch</h2>
      <p>Use TestFlight, Android, and web testing missions to identify confusing flows, reproduce bugs, and understand the experience before a wider release.</p>
      <h2>Evidence, not vanity metrics</h2>
      <p>Missions specify testing steps and proof requirements. Developers review submitted screenshots and feedback before approving rewards. Tester trust progresses with reviewed work.</p>
      <h2>Rewards for useful work</h2>
      <p>Developers fund campaign rewards up front. Approved submissions enter the payout ledger, and successful Stripe transfers credit tester balances.</p>
      <p><Link href="/explore" className="font-semibold text-emerald-300 underline underline-offset-4">Explore beta testing missions</Link></p>
    </>
  );
}