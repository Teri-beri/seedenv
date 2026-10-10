import Link from "next/link";
import { PricingCalculator } from "@/components/PricingCalculator";
import { publicPageMetadata } from "@/lib/seo";
import { COHORT_BUNDLES, COHORT_MIN_PLATFORM_FEE_CENTS, COHORT_PLATFORM_FEE_RATE, projectPerTesterCharges } from "@/lib/pricing";

const feePercent = Math.round(COHORT_PLATFORM_FEE_RATE * 100);
const minFee = COHORT_MIN_PLATFORM_FEE_CENTS / 100;
const playBundle = COHORT_BUNDLES.GOOGLE_PLAY_14_DAY;
const flashBundle = COHORT_BUNDLES.LIVE_STRESS_DROP;

export const metadata = publicPageMetadata("Pricing", `Browse SeedEnv for free. Cohorts add a ${feePercent}% platform fee ($${minFee} minimum); Google Play 14-day closed tests are $${playBundle.totalCents / 100} flat.`, "/pricing");

export default function PricingPage() {
  const example = projectPerTesterCharges(25, 400);
  const small = projectPerTesterCharges(10, 400);
  const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <>
      <h1>SeedEnv Pricing</h1>
      <p>Browsing public missions is free. Developers fund each cohort individually: there are no monthly seats or subscriptions.</p>
      <div className="my-8 max-w-2xl"><PricingCalculator href="/auth/signin?role=DEVELOPER&callbackUrl=%2Fconsole%3Fview%3Dnew-drop" /></div>

      <h2>Custom Mission Drop</h2>
      <p>Choose the number of testers and the reward per tester. You fund a <strong>prepaid balance</strong> (top-ups from $10) instead of paying the whole budget up front. Each time you accept a tester, their reward plus a {feePercent}% platform fee (with a ${minFee}.00 minimum per cohort, taken with the first accepted tester) is drawn from the balance, with no card charge per tester. There are no card processing or top-up fees: SeedEnv covers those. Fees are never deducted from the advertised tester reward.</p>
      <dl className="mt-6 grid max-w-2xl grid-cols-[1fr_auto] gap-4 border-y border-white/10 py-6 text-sm sm:text-base">
        <dt className="text-neutral-300">25 testers × $4, all accepted</dt><dd>{usd(example.stipendCents)} + {usd(example.platformFeeCents)} fee = <span className="font-semibold text-emerald-300">{usd(example.maxTotalCents)}</span></dd>
        <dt className="text-neutral-300">10 testers × $4 (minimum fee applies)</dt><dd>{usd(small.stipendCents)} + {usd(small.platformFeeCents)} fee = <span className="font-semibold text-emerald-300">{usd(small.maxTotalCents)}</span></dd>
      </dl>
      <p><strong>If testers don&apos;t show up:</strong> a paid place freed by a tester who withdraws, misses the 24-hour start window or receives a final denial after manual review is reused for your next acceptance before anything new is drawn. A developer denial holds the unpaid reward and place until manual review is resolved; neither can be refunded or reused during the hold. End the cohort at any time, or let it reach its 30-day expiry, and every unused paid place goes back to your balance automatically (reward + platform fee). Claimed places and rewards under review remain reserved. Testers already working are still paid for approved work.</p>
      <p><strong>Your balance is yours:</strong> reuse it for your next cohort, or refund it in full to your card from Billing at any time. Optional auto-reload tops up your saved card when an acceptance would exceed your balance.</p>

      <h2 id="google-play">{playBundle.name} — {usd(playBundle.totalCents)} flat</h2>
      <p>Google requires new personal developer accounts to run a closed test with at least 12 opted-in testers for 14 continuous days before applying for production access. This bundle recruits {playBundle.slots} testers ({playBundle.slots} × ${(playBundle.bountyCents / 100).toFixed(2)} = ${(playBundle.slots * playBundle.bountyCents / 100).toFixed(2)} in tester rewards, plus a ${(playBundle.platformFeeCents / 100).toFixed(2)} platform fee).</p>
      <p><strong>Retention guarantee:</strong> if fewer than 12 SeedEnv testers remain opted in to your closed test for 14 continuous days, we refund the full amount paid, including the platform fee. Google decides production access on its own criteria; SeedEnv does not guarantee that outcome. Request a refund through <Link href="/contact">contact</Link> within 30 days of the cohort window ending.</p>

      <h2 id="flash-drop">{flashBundle.name} — {usd(flashBundle.totalCents)} flat</h2>
      <p>{flashBundle.summary} Includes {flashBundle.slots} tester slots ({flashBundle.slots} × ${(flashBundle.bountyCents / 100).toFixed(2)} in rewards, plus a ${(flashBundle.platformFeeCents / 100).toFixed(2)} platform fee). You set the session time and script in the cohort brief; testers use their own devices and networks.</p>
      <p>New bundles use the same {feePercent}% platform fee on tester rewards (${minFee} minimum) as custom cohorts. Existing paid cohorts retain their recorded funding and refund terms.</p>

      <h2>For testers</h2>
      <p>Review each mission&apos;s reward and proof requirements before claiming a slot. Rewards are credited after approval; signing up or submitting work does not guarantee approval or earnings.</p>
      <p>Connect an eligible Stripe payout account before receiving rewards. Approved work remains pending until its payment transfer succeeds. Payment-provider eligibility requirements apply.</p>
      <p><Link href="/auth/signin?callbackUrl=%2Fconsole" className="font-semibold text-emerald-300 underline underline-offset-4">Open the developer console</Link></p>
    </>
  );
}
