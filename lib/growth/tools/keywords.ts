import { createHash } from "node:crypto";
import type { GrowthConfig } from "@/lib/growth/config";
import type { GrowthLogger } from "@/lib/growth/log";
import { fetchJson, withRetry } from "@/lib/growth/retry";
import { keywordMetricsSchema, type KeywordMetrics } from "@/lib/growth/schemas";

type DataForSeoResponse = { status_code?: number; status_message?: string; tasks?: Array<{ status_code?: number; status_message?: string; result?: Array<Record<string, unknown>> | null }> };

const competitionLevel = (value: unknown): KeywordMetrics["competition"] => {
  if (typeof value === "string" && ["LOW", "MEDIUM", "HIGH"].includes(value.toUpperCase())) return value.toUpperCase() as KeywordMetrics["competition"];
  if (typeof value === "number") return value < 0.34 ? "LOW" : value < 0.67 ? "MEDIUM" : "HIGH";
  return "UNKNOWN";
};
const int = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;

function mockMetrics(keyword: string): KeywordMetrics {
  const seed = createHash("sha256").update(keyword).digest().readUInt32BE(0);
  const volume = 50 + (seed % 4000);
  return {
    keyword,
    searchVolume: volume,
    competition: (["LOW", "MEDIUM", "HIGH"] as const)[seed % 3],
    competitionIndex: seed % 100,
    cpcUsd: Number(((seed % 500) / 100).toFixed(2)),
    relatedKeywords: ["for ios", "for android", "free", "best", "how to"].map((suffix, index) => ({ keyword: suffix.startsWith("how") || suffix === "best" ? `${suffix} ${keyword}` : `${keyword} ${suffix}`, searchVolume: Math.round(volume / (index + 2)) })),
    source: "mock",
  };
}

export function createKeywordTool(config: GrowthConfig["keywords"], logger: GrowthLogger) {
  const cache = new Map<string, Promise<KeywordMetrics>>();
  const auth = `Basic ${Buffer.from(`${config.login}:${config.password}`).toString("base64")}`;
  const post = (path: string, body: unknown) => withRetry(async () => {
    const response = await fetchJson<DataForSeoResponse>(`https://api.dataforseo.com/v3/${path}`, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const task = response.tasks?.[0];
    if (response.status_code !== 20000 || !task || task.status_code !== 20000) throw new Error(`DataForSEO ${path}: ${task?.status_message ?? response.status_message ?? "no task"}`);
    return task.result ?? [];
  }, { label: `dataforseo:${path}`, logger });

  async function live(keyword: string): Promise<KeywordMetrics> {
    const target = { location_code: config.locationCode, language_code: "en" };
    const [volume, related] = await Promise.all([
      post("keywords_data/google_ads/search_volume/live", [{ ...target, keywords: [keyword] }]),
      post("dataforseo_labs/google/related_keywords/live", [{ ...target, keyword, limit: 10 }]).catch((error) => {
        logger.warn("related_keywords_failed", { keyword, error });
        return [];
      }),
    ]);
    const row = volume[0] ?? {};
    const items = ((related[0]?.items as Array<{ keyword_data?: { keyword?: string; keyword_info?: { search_volume?: number } } }> | undefined) ?? []);
    return {
      keyword,
      searchVolume: int(row.search_volume),
      competition: competitionLevel(row.competition),
      competitionIndex: int(row.competition_index),
      cpcUsd: typeof row.cpc === "number" ? row.cpc : null,
      relatedKeywords: items.flatMap((item) => item.keyword_data?.keyword ? [{ keyword: item.keyword_data.keyword, searchVolume: int(item.keyword_data.keyword_info?.search_volume) }] : []).slice(0, 10),
      source: "dataforseo",
    };
  }

  // fetch_keyword_metrics(keyword): search volume, competition and related semantic keywords.
  async function fetchKeywordMetrics(rawKeyword: string): Promise<KeywordMetrics> {
    const keyword = rawKeyword.trim().toLowerCase().slice(0, 200);
    if (!keyword) throw new Error("keyword is required");
    if (!cache.has(keyword)) {
      const result = config.mode === "live" ? live(keyword) : Promise.resolve(config.mode === "mock" ? mockMetrics(keyword) : { keyword, searchVolume: null, competition: "UNKNOWN" as const, competitionIndex: null, cpcUsd: null, relatedKeywords: [], source: "unavailable" as const });
      cache.set(keyword, result.then((metrics) => keywordMetricsSchema.parse(metrics)));
      cache.get(keyword)!.catch(() => cache.delete(keyword));
    }
    return cache.get(keyword)!;
  }

  return { mode: config.mode, fetchKeywordMetrics, lookups: () => Promise.all([...cache.values()].map((item) => item.catch(() => null))).then((rows) => rows.filter((row): row is KeywordMetrics => Boolean(row))) };
}
export type KeywordTool = ReturnType<typeof createKeywordTool>;
