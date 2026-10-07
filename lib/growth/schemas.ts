import { z } from "zod";

export const slugSchema = z.string().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase words separated by hyphens");

export const keywordMetricsSchema = z.object({
  keyword: z.string().min(1).max(200),
  searchVolume: z.number().int().nonnegative().nullable(),
  competition: z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]),
  competitionIndex: z.number().min(0).max(100).nullable(),
  cpcUsd: z.number().nonnegative().nullable(),
  relatedKeywords: z.array(z.object({ keyword: z.string().min(1).max(200), searchVolume: z.number().int().nonnegative().nullable() })).max(20),
  source: z.enum(["dataforseo", "mock", "unavailable"]),
});
export type KeywordMetrics = z.infer<typeof keywordMetricsSchema>;

export const researchBriefSchema = z.object({
  targetKeyword: z.string().min(2).max(200).describe("Exactly one of the keywords you looked up with fetch_keyword_metrics."),
  secondaryKeywords: z.array(z.string().min(2).max(200)).min(2).max(8).describe("Related keywords returned by the tool to weave in naturally."),
  searchIntent: z.enum(["informational", "commercial", "transactional", "navigational"]),
  audience: z.string().min(10).max(300),
  angle: z.string().min(20).max(500).describe("Why this article can rank and how it differs from existing results."),
  outline: z.array(z.object({ heading: z.string().min(3).max(120), points: z.array(z.string().min(3).max(300)).min(1).max(6) })).min(4).max(9),
  rationale: z.string().min(20).max(800).describe("Cite the search volume and competition numbers that justify the choice."),
});
export type ResearchBrief = z.infer<typeof researchBriefSchema>;

export const blogPostSchema = z.object({
  title: z.string().min(20).max(70).describe("SEO title, 20-70 characters, includes the target keyword."),
  slug: slugSchema,
  metaDescription: z.string().min(110).max(160).describe("110-160 characters, includes the target keyword."),
  excerpt: z.string().min(40).max(280),
  targetKeyword: z.string().min(2).max(200),
  secondaryKeywords: z.array(z.string().min(2).max(200)).max(8),
  tags: z.array(z.string().min(2).max(40)).min(1).max(8),
  markdownBody: z.string().min(2500).max(30_000).describe("Markdown article body starting with an H2 (no H1). 900-2000 words."),
  faq: z.array(z.object({ question: z.string().min(10).max(200), answer: z.string().min(20).max(800) })).max(6),
  callToAction: z.string().min(10).max(200),
}).superRefine((post, ctx) => {
  const keyword = post.targetKeyword.toLowerCase();
  if (!post.title.toLowerCase().includes(keyword) && !post.metaDescription.toLowerCase().includes(keyword)) ctx.addIssue({ code: "custom", path: ["title"], message: "Title or meta description must contain the target keyword." });
  if (!post.markdownBody.toLowerCase().includes(keyword)) ctx.addIssue({ code: "custom", path: ["markdownBody"], message: "Body must contain the target keyword." });
  if (/^#\s/m.test(post.markdownBody)) ctx.addIssue({ code: "custom", path: ["markdownBody"], message: "Use H2 and below; the page renders the title as H1." });
  if (/<\s*(script|iframe|style)/i.test(post.markdownBody)) ctx.addIssue({ code: "custom", path: ["markdownBody"], message: "Raw HTML tags are not allowed." });
});
export type BlogPost = z.infer<typeof blogPostSchema>;

const hashtag = z.string().regex(/^#[A-Za-z0-9_]{2,40}$/, "a single #hashtag");
const TWITTER_URL_LENGTH = 23;

export const socialPackSchema = z.object({
  twitter: z.object({
    text: z.string().min(40).max(280 - TWITTER_URL_LENGTH - 1).describe("Max 256 characters; the article link is appended automatically."),
    hashtags: z.array(hashtag).max(2),
  }),
  linkedin: z.object({
    text: z.string().min(300).max(2800).describe("300-2800 characters, professional tone, short paragraphs; the link is appended automatically."),
    hashtags: z.array(hashtag).max(5),
  }),
  instagram: z.object({
    caption: z.string().min(100).max(2000).describe("No URLs (Instagram links are not clickable); say 'link in bio'."),
    hashtags: z.array(hashtag).max(15),
    imageAltText: z.string().min(10).max(200),
  }),
  tiktok: z.object({
    caption: z.string().min(50).max(1500).describe("TikTok caption; no URLs. Say 'link in bio' if pointing to the site."),
    hashtags: z.array(hashtag).max(5),
    hook: z.string().min(10).max(150).describe("The spoken/on-screen line for the first 2-3 seconds that stops the scroll."),
    beats: z.array(z.object({
      visual: z.string().min(5).max(300).describe("What is on screen: screen recording, face to camera, b-roll."),
      voiceover: z.string().min(5).max(400).describe("What is said during this beat."),
      onScreenText: z.string().max(80).describe("Short caption overlay, may be empty."),
    })).min(3).max(8),
    durationSeconds: z.number().int().min(15).max(90),
  }).describe("A short vertical video the founder can film on a phone, typically a screen recording with voiceover."),
}).superRefine((pack, ctx) => {
  const withTags = (text: string, tags: string[]) => [text, tags.join(" ")].filter(Boolean).join("\n\n");
  if (withTags(pack.twitter.text, pack.twitter.hashtags).length > 280 - TWITTER_URL_LENGTH - 1) ctx.addIssue({ code: "custom", path: ["twitter"], message: "Text plus hashtags must fit in 256 characters." });
  if (/https?:\/\//i.test(pack.tiktok.caption)) ctx.addIssue({ code: "custom", path: ["tiktok", "caption"], message: "TikTok captions must not contain URLs." });
  if (/https?:\/\//i.test(pack.instagram.caption)) ctx.addIssue({ code: "custom", path: ["instagram", "caption"], message: "Instagram captions must not contain URLs." });
  for (const key of ["twitter", "linkedin"] as const) if (/https?:\/\//i.test(pack[key].text)) ctx.addIssue({ code: "custom", path: [key, "text"], message: "Leave the link out; it is appended automatically." });
});
export type SocialPack = z.infer<typeof socialPackSchema>;
export type TikTokScript = Pick<SocialPack["tiktok"], "hook" | "beats" | "durationSeconds">;

export const productUpdateInputSchema = z.object({
  details: z.string().trim().min(20, "Describe the update in at least 20 characters.").max(4000),
  linkUrl: z.string().trim().url("Link must be a full URL").refine((url) => url.startsWith("https://"), "Link must use https").optional(),
});
export type ProductUpdateInput = z.infer<typeof productUpdateInputSchema>;

export const adCampaignMetricsSchema = z.object({
  provider: z.string().min(1).max(40),
  campaignId: z.string().min(1).max(120),
  campaignName: z.string().min(1).max(300),
  spend: z.number().nonnegative(),
  impressions: z.number().int().nonnegative(),
  conversions: z.number().int().nonnegative(),
});
export type AdCampaignMetrics = z.infer<typeof adCampaignMetricsSchema>;

export const adDecisionSchema = z.object({
  action: z.enum(["MAINTAINED", "ALERTED", "PAUSED"]),
  cpa: z.number().nonnegative().nullable(),
  reason: z.string().min(1).max(500),
});
export type AdDecision = z.infer<typeof adDecisionSchema>;

// Gemini's responseJsonSchema accepts a subset of JSON Schema; length/pattern rules move into descriptions and Zod enforces them after parsing.
const GEMINI_SCHEMA_KEYS = new Set(["type", "properties", "required", "items", "enum", "description", "minItems", "maxItems", "minimum", "maximum", "nullable", "anyOf", "propertyOrdering"]);
export function toGeminiSchema(schema: z.ZodType): unknown {
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    if (!node || typeof node !== "object") return node;
    const input = node as Record<string, unknown>;
    const hints = [input.minLength !== undefined ? `min ${input.minLength} chars` : "", input.maxLength !== undefined ? `max ${input.maxLength} chars` : "", input.pattern ? `pattern ${input.pattern}` : ""].filter(Boolean).join(", ");
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (!GEMINI_SCHEMA_KEYS.has(key)) continue;
      output[key] = key === "properties" ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([name, child]) => [name, visit(child)])) : visit(value);
    }
    if (hints) output.description = [output.description, `(${hints})`].filter(Boolean).join(" ");
    return output;
  };
  return visit(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }));
}
