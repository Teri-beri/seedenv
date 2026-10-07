// Usage: npm run growth -- <content|ads|all> [--dry-run] [--mock] [--force]
//        npm run growth -- update "What shipped and why it matters" [--link https://seedenv.com/...] [--dry-run] [--mock]
//   --dry-run  in-memory store, notifications printed to stdout, ad kill-switch never enforced (no database writes)
//   --mock     force mock adapters even if credentials are set
//   --force    ignore the minimum interval between content drafts
import { loadGrowthConfig } from "@/lib/growth/config";
import { createLogger } from "@/lib/growth/log";
import { createGrowthContext, growthJobs, runGrowthJob, runProductUpdate, type GrowthJob } from "@/lib/growth/pipeline";
import { memoryGrowthStore } from "@/lib/growth/store";

async function main() {
  const args = process.argv.slice(2);
  const linkIndex = args.indexOf("--link");
  const linkUrl = linkIndex >= 0 ? args[linkIndex + 1] : undefined;
  const positional = args.filter((arg, index) => !arg.startsWith("--") && !(linkIndex >= 0 && index === linkIndex + 1));
  const job = (positional[0] ?? "all") as GrowthJob | "update";
  if (job !== "update" && !growthJobs.includes(job)) throw new Error(`Unknown job "${job}". Use one of: ${growthJobs.join(", ")}, update.`);
  if (job === "update" && !positional[1]) throw new Error('Describe the update: npm run growth -- update "What shipped" [--link https://...]');
  const dryRun = args.includes("--dry-run");
  const forceMock = args.includes("--mock");
  const env = forceMock ? { ...process.env, NODE_ENV: "development", GEMINI_API_KEY: "", DATAFORSEO_LOGIN: "", AYRSHARE_API_KEY: "", META_ADS_ACCESS_TOKEN: "" } : process.env;
  const config = loadGrowthConfig(env);
  if (!config.enabled && !dryRun && job !== "update") throw new Error("GROWTH_ENABLED is not true. Use --dry-run to try the pipeline safely.");
  const logger = createLogger({ service: "growth-runner", job, dryRun });
  const store = dryRun ? memoryGrowthStore() : (await import("@/lib/growth/store")).prismaGrowthStore((await import("@/lib/prisma")).prisma);
  logger.info("runner_start", { llm: config.llm.mode, keywords: config.keywords.mode, social: config.social.mode, ads: config.ads.mode, enforce: config.ads.enforce && !dryRun });
  const ctx = createGrowthContext({ config, store, logger, dryRun });
  if (job === "update") {
    if (config.llm.mode === "disabled") throw new Error("GEMINI_API_KEY is required to draft update posts (or use --mock).");
    const result = await runProductUpdate(ctx, { details: positional[1], linkUrl });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const result = await runGrowthJob(ctx, job, { force: args.includes("--force") || dryRun });
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
