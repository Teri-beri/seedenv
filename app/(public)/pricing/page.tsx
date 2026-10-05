import Link from "next/link";
import { publicPageMetadata } from "@/lib/seo";
import { quoteCampaignFunding, SEEDENV_PLATFORM_FEE_PERCENT } from "@/lib/pricing";

const feePercent = Math.round(SEEDENV_PLATFORM_FEE_PERCENT * 100);

export const metadata = publicPageMetadata("Pricing", `Browse SeedEnv for free. Fund beta tester rewards with a transparent ${feePercent}% platform fee on the campaign reward pool.`, "/pricing");

export default function PricingPage() {
  const examplePool = 100;
  const fundingQuote = quoteCampaignFunding(examplePool);
  const exampleFee = fundingQuote.platformFeeUsd;

  return (
    <>
      <h1>SeedEnv Pricing</h1>
      <p>Browse public missions for free. Developer campaigns are funded through a tester reward pool plus a {feePercent}% SeedEnv platform fee.</p>
      <h2>For developers</h2>
      <p>Choose your reward per task and number of tester slots. The platform fee is calculated on the reward pool and added at checkout, not deducted from the advertised tester reward.</p>
      <dl className="mt-6 grid max-w-2xl grid-cols-[1fr_auto] gap-4 border-y border-white/10 py-6 text-sm sm:text-base">
        <dt className="text-neutral-300">Example tester reward pool</dt><dd>${examplePool.toFixed(2)}</dd>
        <dt className="text-neutral-300">Platform fee ({feePercent}%)</dt><dd>${exampleFee.toFixed(2)}</dd>
        <dt className="font-semibold">Campaign funding total</dt><dd className="font-semibold text-emerald-300">${fundingQuote.totalBudgetUsd.toFixed(2)}</dd>
      </dl>
      <h2>For testers</h2>
      <p>Review each mission&apos;s reward and proof requirements before claiming a slot. Rewards are credited after approval; signing up or submitting work does not guarantee approval or earnings.</p>
      <p>Connect an eligible Stripe payout account before receiving rewards. Approved work remains pending until its payment transfer succeeds. Payment-provider eligibility requirements apply.</p>
      <p><Link href="/auth/signin?callbackUrl=%2Fconsole" className="font-semibold text-emerald-300 underline underline-offset-4">Open the developer console</Link></p>
    </>
  );
}