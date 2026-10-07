// Usage: npm run growth -- <content|ads|all> [--dry-run] [--mock] [--force]
//   --dry-run  in-memory store, notifications printed to stdout, ad kill-switch never enforced (no database writes)
//   --mock     force mock adapters even if credentials are set
//   --force    ignore the minimum interval between content drafts
import { loadGrowthConfig } from "@/lib/growth/config";
import { createLogger } from "@/lib/growth/log";
import { createGrowthContext, growthJobs, runGrowthJob, type GrowthJob } from "@/lib/growth/pipeline";
import { memoryGrowthStore } from "@/lib/growth/store";

async function main() {
  const args = process.argv.slice(2);
  const job = (args.find((arg) => !arg.startsWith("--")) ?? "all") as GrowthJob;
  if (!growthJobs.includes(job)) throw new Error(`Unknown job "${job}". Use one of: ${growthJobs.join(", ")}.`);
  const dryRun = args.includes("--dry-run");
  const forceMock = args.includes("--mock");
  const env = forceMock ? { ...process.env, NODE_ENV: "development", GEMINI_API_KEY: "", DATAFORSEO_LOGIN: "", AYRSHARE_API_KEY: "", META_ADS_ACCESS_TOKEN: "" } : process.env;
  const config = loadGrowthConfig(env);
  if (!config.enabled && !dryRun) throw new Error("GROWTH_ENABLED is not true. Use --dry-run to try the pipeline safely.");
  const logger = createLogger({ service: "growth-runner", job, dryRun });
  const store = dryRun ? memoryGrowthStore() : (await import("@/lib/growth/store")).prismaGrowthStore((await import("@/lib/prisma")).prisma);
  logger.info("runner_start", { llm: config.llm.mode, keywords: config.keywords.mode, social: config.social.mode, ads: config.ads.mode, enforce: config.ads.enforce && !dryRun });
  const result = await runGrowthJob(createGrowthContext({ config, store, logger, dryRun }), job, { force: args.includes("--force") || dryRun });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!process.argv.includes("--dry-run")) await import("@/lib/prisma").then(({ prisma }) => prisma.$disconnect()).catch(() => undefined);
  });
