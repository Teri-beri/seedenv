import type { GrowthLogger } from "@/lib/growth/log";
import type { GrowthNotifier } from "@/lib/growth/notify";
import type { GrowthStore } from "@/lib/growth/store";
import type { createAdsTool } from "@/lib/growth/tools/ads";

const ALERT_DEDUPE_MS = 6 * 60 * 60 * 1000;

// Ad performance agent: deterministic on purpose. Spend decisions never depend on an LLM.
export async function runAdsAgent({ ads, store, notifier, logger, thresholdCpa }: { ads: ReturnType<typeof createAdsTool>; store: GrowthStore; notifier: GrowthNotifier; logger: GrowthLogger; thresholdCpa: number }) {
  if (ads.mode === "disabled") {
    logger.info("ads_skipped", { reason: "No ad account credentials configured." });
    return { mode: ads.mode, checked: 0, alerted: 0, paused: 0, skipped: true };
  }
  const report = await ads.checkAdPerformanceAndKillswitch(thresholdCpa);
  const notable: string[] = [];
  for (const row of report.results) {
    const previous = row.decision.action === "MAINTAINED" ? null : await store.lastAdAudit(row.campaignId, new Date(Date.now() - ALERT_DEDUPE_MS));
    await store.createAdAudit({ provider: row.provider, campaignId: row.campaignId, campaignName: row.campaignName, spend: row.spend, impressions: row.impressions, conversions: row.conversions, cpa: row.decision.cpa, thresholdCpa, actionTaken: row.decision.action, reason: row.decision.reason });
    if (row.decision.action !== "MAINTAINED" && previous?.actionTaken !== row.decision.action) {
      notable.push(`${row.decision.action === "PAUSED" ? "⛔ PAUSED" : "⚠️ ALERT"} **${row.campaignName}**: $${row.spend.toFixed(2)} spend, ${row.conversions} conversions, CPA ${row.decision.cpa === null ? "n/a" : `$${row.decision.cpa.toFixed(2)}`}. ${row.decision.reason}`);
    }
  }
  if (notable.length) {
    await notifier.alert(`Ad health check: ${notable.length} campaign${notable.length === 1 ? "" : "s"} need attention`, `${notable.join("\n")}\n\nThreshold CPA $${thresholdCpa.toFixed(2)} · kill-switch ${report.enforce ? "ENFORCING" : "dry run (set AD_KILLSWITCH_ENFORCE=true to pause automatically)"}${report.mode === "mock" ? " · mock data" : ""}`);
  }
  const count = (action: string) => report.results.filter((row) => row.decision.action === action).length;
  return { mode: report.mode, checked: report.results.length, alerted: count("ALERTED"), paused: count("PAUSED"), notified: notable.length, skipped: false };
}
