import Link from "next/link";
import { PricingCalculator } from "@/components/PricingCalculator";
import { publicPageMetadata } from "@/lib/seo";
import { COHORT_BUNDLES, COHORT_MIN_PLATFORM_FEE_CENTS, COHORT_PLATFORM_FEE_RATE, quoteCampaignFunding } from "@/lib/pricing";

const feePercent = Math.round(COHORT_PLATFORM_FEE_RATE * 100);
const minFee = COHORT_MIN_PLATFORM_FEE_CENTS / 100;
const playBundle = COHORT_BUNDLES.GOOGLE_PLAY_14_DAY;
const flashBundle = COHORT_BUNDLES.LIVE_STRESS_DROP;

export const metadata = publicPageMetadata("Pricing", `Browse SeedEnv for free. Custom tester cohorts add a ${feePercent}% platform fee ($${minFee} minimum); Google Play 14-day closed tests are $199 flat.`, "/pricing");

export default function PricingPage() {
  const example = quoteCampaignFunding(100);
  const small = quoteCampaignFunding(40);

  return (
    <>
      <h1>SeedEnv Pricing</h1>
      <p>Browsing public missions is free. Developers fund each cohort individually: there are no monthly seats or subscriptions.</p>
      <div className="my-8 max-w-2xl"><PricingCalculator href="/auth/signin?role=DEVELOPER&callbackUrl=%2Fconsole%3Fview%3Dnew-drop" /></div>

      <h2>Custom Mission Drop</h2>
      <p>Choose the number of testers and the reward per tester. SeedEnv adds a {feePercent}% platform fee on the reward pool, with a ${minFee}.00 minimum per cohort to cover payment processing and proof storage. The fee is added at checkout, never deducted from the advertised tester reward.</p>
      <dl className="mt-6 grid max-w-2xl grid-cols-[1fr_auto] gap-4 border-y border-white/10 py-6 text-sm sm:text-base">
        <dt className="text-neutral-300">$100 reward pool</dt><dd>${example.payoutPoolUsd.toFixed(2)} + ${example.platformFeeUsd.toFixed(2)} fee = <span className="font-semibold text-emerald-300">${example.totalBudgetUsd.toFixed(2)}</span></dd>
        <dt className="text-neutral-300">$40 reward pool (minimum fee applies)</dt><dd>${small.payoutPoolUsd.toFixed(2)} + ${small.platformFeeUsd.toFixed(2)} fee = <span className="font-semibold text-emerald-300">${small.totalBudgetUsd.toFixed(2)}</span></dd>
      </dl>

      <h2 id="google-play">{playBundle.name} — $199 flat</h2>
      <p>Google requires new personal developer accounts to run a closed test with at least 12 opted-in testers for 14 continuous days before applying for production access. This bundle recruits {playBundle.slots} testers ({playBundle.slots} × ${(playBundle.bountyCents / 100).toFixed(2)} = ${(playBundle.slots * playBundle.bountyCents / 100).toFixed(2)} in tester rewards, plus a ${(playBundle.platformFeeCents / 100).toFixed(2)} platform fee).</p>
      <p><strong>Retention guarantee:</strong> if fewer than 12 SeedEnv testers remain opted in to your closed test for 14 continuous days, we refund the full $199, including the platform fee. Google decides production access on its own criteria; SeedEnv does not guarantee that outcome. Request a refund through <Link href="/contact">contact</Link> within 30 days of the cohort window ending.</p>

      <h2 id="flash-drop">{flashBundle.name} — $349 flat</h2>
      <p>{flashBundle.summary} Includes {flashBundle.slots} tester slots ({flashBundle.slots} × ${(flashBundle.bountyCents / 100).toFixed(2)} in rewards, plus a ${(flashBundle.platformFeeCents / 100).toFixed(2)} platform fee). You set the session time and script in the cohort brief; testers use their own devices and networks.</p>

      <h2>For testers</h2>
      <p>Review each mission&apos;s reward and proof requirements before claiming a slot. Rewards are credited after approval; signing up or submitting work does not guarantee approval or earnings.</p>
      <p>Connect an eligible Stripe payout account before receiving rewards. Approved work remains pending until its payment transfer succeeds. Payment-provider eligibility requirements apply.</p>
      <p><Link href="/auth/signin?callbackUrl=%2Fconsole" className="font-semibold text-emerald-300 underline underline-offset-4">Open the developer console</Link></p>
    </>
  );
}
