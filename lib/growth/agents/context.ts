import { COHORT_BUNDLES, COHORT_MIN_PLATFORM_FEE_CENTS, COHORT_PLATFORM_FEE_RATE } from "@/lib/pricing";

const usd = (cents: number) => `$${(cents / 100).toFixed(0)}`;

// Single source of product facts for every growth agent, built from the same constants the app bills with.
export const PRODUCT_CONTEXT = `SeedEnv (seedenv.com, operated by TERIMUS LLC) is a pre-release beta testing marketplace. Developers fund cohorts of verified human testers for TestFlight, Google Play closed tests and web builds; testers complete defined tasks with proof (screen recordings, device telemetry) and are paid only for approved work.
Facts you may use: custom drops are pay-per-tester from a prepaid balance (top up from $10, no card processing fees) with a ${Math.round(COHORT_PLATFORM_FEE_RATE * 100)}% platform fee (${usd(COHORT_MIN_PLATFORM_FEE_CENTS)} minimum per cohort); ${Object.values(COHORT_BUNDLES).map((bundle) => `${bundle.name} is ${usd(bundle.totalCents)} flat for ${bundle.slots} testers`).join("; ")}. Unused paid places return to the balance.
Never invent statistics, customer names, testimonials, reviews, rankings or guarantees. Do not promise Google Play or App Store approval. If you mention a third-party rule (e.g. Google Play's closed-testing requirement), describe it generally and tell readers to check the official documentation.`;
