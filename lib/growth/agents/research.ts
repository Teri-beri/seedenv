import { Type } from "@google/genai";
import type { GrowthLlm, GrowthTool } from "@/lib/growth/llm";
import { researchBriefSchema, type KeywordMetrics, type ResearchBrief } from "@/lib/growth/schemas";
import type { KeywordTool } from "@/lib/growth/tools/keywords";
import { PRODUCT_CONTEXT } from "@/lib/growth/agents/context";

export type ResearchResult = { brief: ResearchBrief; metrics: KeywordMetrics; lookups: KeywordMetrics[] };

// Research/SEO agent: uses function calling to pull real keyword data, then commits to a typed brief.
export async function runResearchAgent({ llm, keywords, candidates }: { llm: GrowthLlm; keywords: KeywordTool; candidates: string[] }): Promise<ResearchResult> {
  const tools: Record<string, GrowthTool> = {
    fetch_keyword_metrics: {
      declaration: { name: "fetch_keyword_metrics", description: "Search volume (monthly, US), competition and related semantic keywords for one keyword.", parameters: { type: Type.OBJECT, properties: { keyword: { type: Type.STRING } }, required: ["keyword"] } },
      execute: async (args) => keywords.fetchKeywordMetrics(String(args.keyword ?? "")),
    },
  };
  const system = `You are SeedEnv's SEO research agent.\n${PRODUCT_CONTEXT}\nPick one keyword a small, new site can realistically rank for and that attracts buyers or testers. Prefer meaningful volume with LOW or MEDIUM competition. Use the tool; never guess numbers.`;
  const notes = await llm.runTools({
    agent: "research",
    system,
    prompt: `Candidate keywords (not covered recently): ${candidates.map((item) => `"${item}"`).join(", ")}.\nLook up 3-6 candidates or related variations, then summarise which keyword you recommend and why, quoting the numbers.`,
    tools,
    mock: async (available) => {
      for (const keyword of candidates.slice(0, 3)) await available.fetch_keyword_metrics.execute({ keyword });
      return `Recommend "${candidates[0]}".`;
    },
  });

  const lookups = await keywords.lookups();
  const data = JSON.stringify(lookups.map((row) => ({ keyword: row.keyword, volume: row.searchVolume, competition: row.competition, related: row.relatedKeywords.slice(0, 8) })));
  const brief = await llm.generateStructured({
    agent: "research-brief",
    system,
    prompt: `Keyword data from the tool:\n${data}\n\nYour research notes:\n${notes}\n\nWrite the content brief. targetKeyword must be one of the looked-up keywords.`,
    schema: researchBriefSchema,
    temperature: 0.3,
    mock: () => {
      const metrics = lookups[0];
      return {
        targetKeyword: metrics.keyword,
        secondaryKeywords: metrics.relatedKeywords.slice(0, 4).map((item) => item.keyword),
        searchIntent: "commercial" as const,
        audience: "Indie and small-team mobile developers preparing a TestFlight or Google Play release.",
        angle: "A practical, step-by-step guide grounded in what real pre-release cohorts need, with costs spelled out.",
        outline: ["Why it matters before launch", "What good testers look like", "Step-by-step setup", "Costs and timelines", "Common mistakes"].map((heading) => ({ heading, points: [`Explain ${heading.toLowerCase()} for ${metrics.keyword}.`] })),
        rationale: `Mock data: ${metrics.searchVolume} monthly searches with ${metrics.competition} competition.`,
      };
    },
  });

  // Numbers always come from the tool, never from the model; an unlooked-up pick is fetched now so the draft stays data-backed.
  const metrics = lookups.find((row) => row.keyword === brief.targetKeyword.toLowerCase()) ?? await keywords.fetchKeywordMetrics(brief.targetKeyword);
  return { brief: { ...brief, targetKeyword: metrics.keyword }, metrics, lookups: await keywords.lookups() };
}
