import { NextRequest, NextResponse } from "next/server";
import { loadGrowthConfig } from "@/lib/growth/config";
import { growthJobs, runGrowthJob, type GrowthJob } from "@/lib/growth/pipeline";
import { productionGrowthContext } from "@/lib/growth/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

async function handle(request: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { job } = await params;
  if (!growthJobs.includes(job as GrowthJob)) return NextResponse.json({ message: "Unknown job" }, { status: 404 });
  let config;
  try {
    config = loadGrowthConfig();
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Invalid growth configuration" }, { status: 500 });
  }
  if (!config.enabled) return NextResponse.json({ ok: true, skipped: true, reason: "GROWTH_ENABLED is not true" });
  const result = await runGrowthJob(productionGrowthContext(), job as GrowthJob, { force: request.nextUrl.searchParams.get("force") === "1" });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export const POST = handle;
export const GET = handle;
