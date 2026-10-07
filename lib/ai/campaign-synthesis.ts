import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/growth/log";
import { getGeminiClient, type GeminiClient } from "@/lib/ai/gemini-client";
import { runSynthesisAgent } from "@/lib/ai/agents/synthesis.agent";

const logger = createLogger({ scope: "qa-ai" });
export const SYNTHESIS_MAX_SUBMISSIONS = 150;
export const SYNTHESIS_COOLDOWN_MS = 10 * 60_000;
const recentFailures = new Map<string, number>();
const inFlight = new Map<string, Promise<SynthesisOutcome>>();

export type SynthesisOutcome = { ok: true; id: string } | { ok: false; error: string; status: number };

export async function synthesizeCampaign(campaignId: string, options: { client?: GeminiClient; force?: boolean } = {}): Promise<SynthesisOutcome> {
  const running = inFlight.get(campaignId);
  if (running) return running;
  const work = runSynthesis(campaignId, options).finally(() => inFlight.delete(campaignId));
  inFlight.set(campaignId, work);
  return work;
}

async function runSynthesis(campaignId: string, { client = getGeminiClient(), force = false }: { client?: GeminiClient; force?: boolean }): Promise<SynthesisOutcome> {
  const campaign = await prisma.appCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, title: true, platform: true, status: true, cancelledAt: true, expiresAt: true, synthesis: { select: { id: true, updatedAt: true } }, instructions: { orderBy: { stepNumber: "asc" }, select: { instructionTitle: true, instructionDetail: true } } },
  });
  if (!campaign) return { ok: false, error: "Cohort not found.", status: 404 };
  const ended = campaign.status === "COMPLETED" || Boolean(campaign.cancelledAt) || campaign.expiresAt <= new Date();
  if (!ended) return { ok: false, error: "Release reports are generated once a cohort has ended.", status: 409 };
  if (campaign.synthesis && (!force || Date.now() - campaign.synthesis.updatedAt.getTime() < SYNTHESIS_COOLDOWN_MS)) {
    return force ? { ok: false, error: "This report was regenerated recently. Try again in a few minutes.", status: 429 } : { ok: true, id: campaign.synthesis.id };
  }
  const submissions = await prisma.submission.findMany({
    where: { campaignId, status: "APPROVED", feedbackText: { not: null } },
    orderBy: { reviewedAt: "desc" },
    take: SYNTHESIS_MAX_SUBMISSIONS,
    select: { id: true, feedbackText: true, deviceModel: true, osBuild: true, networkType: true, appBuildVersion: true, crashLogs: true },
  });
  if (!submissions.length) return { ok: false, error: "There are no approved submissions to summarise yet.", status: 409 };
  try {
    const result = await runSynthesisAgent(client, {
      campaignTitle: campaign.title,
      platform: campaign.platform,
      missionSteps: campaign.instructions.map((step) => `${step.instructionTitle}: ${step.instructionDetail}`.slice(0, 1200)),
      submissions: submissions.map((item) => ({ id: item.id, feedbackText: (item.feedbackText ?? "").slice(0, 4000), deviceModel: item.deviceModel, osBuild: item.osBuild, networkType: item.networkType, appBuildVersion: item.appBuildVersion, crashLogExcerpt: item.crashLogs ? item.crashLogs.slice(0, 1500) : null })),
    });
    const data = {
      totalSubmissions: result.totalSubmissions,
      validBugsCount: result.validBugsCount,
      p0Count: result.p0Count,
      p1Count: result.p1Count,
      p2Count: result.p2Count,
      executiveSummary: result.executiveSummary,
      clusteredThemesJson: result.clusters.map((cluster) => ({ title: cluster.title, count: cluster.count, severity: cluster.severity, reproRate: cluster.reproRate, rootCause: cluster.rootCause, devices: cluster.devices, submissionIds: cluster.submissionIds })),
      githubMarkdownExport: result.githubMarkdownExport,
      model: client.modelFor("text"),
    };
    const saved = await prisma.campaignSynthesis.upsert({ where: { campaignId }, create: { campaignId, ...data }, update: data, select: { id: true } });
    recentFailures.delete(campaignId);
    logger.info("qa_synthesis_complete", { campaignId, clusters: result.validBugsCount, submissions: result.totalSubmissions });
    return { ok: true, id: saved.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recentFailures.set(campaignId, Date.now());
    logger.error("qa_ai_admin_alert", { campaignId, agent: "synthesis", error: message });
    return { ok: false, error: "The release report could not be generated right now. Try again shortly.", status: 503 };
  }
}

// Writes reports for ended cohorts that do not have one yet; failed cohorts back off for an hour.
export async function sweepCampaignSyntheses(limit = 2) {
  if (!getGeminiClient().configured) return { generated: 0 };
  const candidates = await prisma.appCampaign.findMany({
    where: { status: "COMPLETED", synthesis: { is: null }, submissions: { some: { status: "APPROVED" } } },
    orderBy: { expiresAt: "desc" },
    take: limit + recentFailures.size,
    select: { id: true },
  });
  let generated = 0;
  for (const { id } of candidates.filter(({ id }) => Date.now() - (recentFailures.get(id) ?? 0) > 3_600_000).slice(0, limit)) {
    if ((await synthesizeCampaign(id)).ok) generated += 1;
  }
  return { generated };
}
