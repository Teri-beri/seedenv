import type { GrowthConfig } from "@/lib/growth/config";
import type { GrowthLogger } from "@/lib/growth/log";
import { fetchJson, withRetry } from "@/lib/growth/retry";
import { adCampaignMetricsSchema, adDecisionSchema, type AdCampaignMetrics, type AdDecision } from "@/lib/growth/schemas";

export type AdPolicy = { thresholdCpa: number; minSpend: number; alertRatio: number };

const money = (value: number) => `$${value.toFixed(2)}`;

// Pure decision rule so it can be unit-tested: never act on tiny samples, pause when a full target CPA is spent without results.
export function decideAdAction(metrics: AdCampaignMetrics, policy: AdPolicy): AdDecision {
  const cpa = metrics.conversions > 0 ? Number((metrics.spend / metrics.conversions).toFixed(2)) : null;
  const alertAt = policy.thresholdCpa * policy.alertRatio;
  let decision: AdDecision;
  if (metrics.spend < policy.minSpend) decision = { action: "MAINTAINED", cpa, reason: `Spend ${money(metrics.spend)} is below the ${money(policy.minSpend)} minimum sample.` };
  else if (cpa === null) decision = metrics.spend >= policy.thresholdCpa
    ? { action: "PAUSED", cpa, reason: `Spent ${money(metrics.spend)} with no conversions (limit ${money(policy.thresholdCpa)} per conversion).` }
    : metrics.spend >= alertAt ? { action: "ALERTED", cpa, reason: `Spent ${money(metrics.spend)} with no conversions yet; ${money(policy.thresholdCpa - metrics.spend)} until the kill switch.` }
    : { action: "MAINTAINED", cpa, reason: "No conversions yet, still within budget for one." };
  else if (cpa > policy.thresholdCpa) decision = { action: "PAUSED", cpa, reason: `CPA ${money(cpa)} exceeds the ${money(policy.thresholdCpa)} limit.` };
  else if (cpa > alertAt) decision = { action: "ALERTED", cpa, reason: `CPA ${money(cpa)} is above ${Math.round(policy.alertRatio * 100)}% of the ${money(policy.thresholdCpa)} limit.` };
  else decision = { action: "MAINTAINED", cpa, reason: `CPA ${money(cpa)} is within the ${money(policy.thresholdCpa)} limit.` };
  return adDecisionSchema.parse(decision);
}

type MetaInsight = { campaign_id?: string; campaign_name?: string; spend?: string; impressions?: string; actions?: Array<{ action_type?: string; value?: string }> };

const MOCK_CAMPAIGNS: AdCampaignMetrics[] = [
  { provider: "mock", campaignId: "mock_healthy", campaignName: "Mock: Developers - TestFlight", spend: 120, impressions: 18000, conversions: 9 },
  { provider: "mock", campaignId: "mock_warning", campaignName: "Mock: Play 14-day bundle", spend: 84, impressions: 9000, conversions: 4 },
  { provider: "mock", campaignId: "mock_burning", campaignName: "Mock: Broad interest test", spend: 61, impressions: 30000, conversions: 0 },
];

export function createAdsTool(config: GrowthConfig["ads"], logger: GrowthLogger) {
  const base = `https://graph.facebook.com/${config.graphVersion}`;

  async function listActiveCampaigns(): Promise<AdCampaignMetrics[]> {
    if (config.mode === "mock") return MOCK_CAMPAIGNS;
    if (config.mode === "disabled") return [];
    const rows: MetaInsight[] = [];
    const params = new URLSearchParams({ level: "campaign", fields: "campaign_id,campaign_name,spend,impressions,actions", date_preset: config.lookback, limit: "100", filtering: JSON.stringify([{ field: "campaign.effective_status", operator: "IN", value: ["ACTIVE"] }]), access_token: config.accessToken! });
    let url: string | undefined = `${base}/${config.accountId}/insights?${params}`;
    for (let page = 0; url && page < 10; page += 1) {
      const response: { data?: MetaInsight[]; paging?: { next?: string } } = await withRetry(() => fetchJson(url!), { label: "meta:insights", logger });
      rows.push(...(response.data ?? []));
      url = response.paging?.next;
    }
    return rows.flatMap((row) => {
      const parsed = adCampaignMetricsSchema.safeParse({ provider: "meta", campaignId: row.campaign_id, campaignName: row.campaign_name ?? row.campaign_id, spend: Number(row.spend ?? 0), impressions: Number(row.impressions ?? 0), conversions: Math.round(Number(row.actions?.find((action) => action.action_type === config.conversionAction)?.value ?? 0)) });
      if (!parsed.success) logger.warn("ad_row_invalid", { campaignId: row.campaign_id, issues: parsed.error.issues.length });
      return parsed.success ? [parsed.data] : [];
    });
  }

  async function pauseCampaign(campaignId: string) {
    if (config.mode === "mock") return;
    const response = await withRetry(() => fetchJson<{ success?: boolean }>(`${base}/${encodeURIComponent(campaignId)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ status: "PAUSED", access_token: config.accessToken! }).toString() }), { label: "meta:pause", logger });
    if (response.success === false) throw new Error(`Meta refused to pause campaign ${campaignId}.`);
  }

  // check_ad_performance_and_killswitch(threshold_cpa): evaluates active campaigns and pauses the ones over the limit when enforcement is on.
  async function checkAdPerformanceAndKillswitch(thresholdCpa = config.thresholdCpa) {
    const policy: AdPolicy = { thresholdCpa, minSpend: config.minSpend, alertRatio: config.alertRatio };
    const campaigns = await listActiveCampaigns();
    const results: Array<AdCampaignMetrics & { decision: AdDecision; error?: string }> = [];
    for (const campaign of campaigns) {
      const decision = decideAdAction(campaign, policy);
      if (decision.action !== "PAUSED") {
        results.push({ ...campaign, decision });
        continue;
      }
      if (!config.enforce) {
        results.push({ ...campaign, decision: { ...decision, action: "ALERTED", reason: `[dry run] Would pause: ${decision.reason}`.slice(0, 500) } });
        continue;
      }
      try {
        await pauseCampaign(campaign.campaignId);
        logger.warn("ad_campaign_paused", { campaignId: campaign.campaignId, reason: decision.reason });
        results.push({ ...campaign, decision });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("ad_pause_failed", { campaignId: campaign.campaignId, error: message });
        results.push({ ...campaign, decision: { ...decision, action: "ALERTED", reason: `Pause FAILED, act manually: ${decision.reason}`.slice(0, 500) }, error: message });
      }
    }
    return { mode: config.mode, enforce: config.enforce, policy, results };
  }

  return { mode: config.mode, checkAdPerformanceAndKillswitch };
}
