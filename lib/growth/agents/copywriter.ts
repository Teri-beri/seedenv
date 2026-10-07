import type { GrowthLlm } from "@/lib/growth/llm";
import { blogPostSchema, socialPackSchema, type BlogPost, type KeywordMetrics, type ResearchBrief, type SocialPack } from "@/lib/growth/schemas";
import { PRODUCT_CONTEXT } from "@/lib/growth/agents/context";

export function slugify(text: string) {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g, "").trim().replace(/[\s-]+/g, "-").slice(0, 70).replace(/-+$/, "");
}

// Copywriting agent: turns the brief into a typed, schema-validated article.
export async function writeBlogPost({ llm, brief, metrics, siteUrl }: { llm: GrowthLlm; brief: ResearchBrief; metrics: KeywordMetrics; siteUrl: string }): Promise<BlogPost> {
  return llm.generateStructured({
    agent: "copywriter",
    system: `You are SeedEnv's senior technical copywriter.\n${PRODUCT_CONTEXT}\nWrite genuinely useful, specific articles for developers. Plain, confident language. No fluff, no keyword stuffing, no clickbait. Markdown body: start with an H2, use H2/H3 sections, short paragraphs, lists where helpful, and one natural call to action linking to ${siteUrl}/pricing or ${siteUrl}/console. Relative links to SeedEnv pages are fine; do not link to other sites you have not been given.`,
    prompt: `Brief:\n${JSON.stringify(brief, null, 2)}\n\nKeyword data (from DataForSEO or marked unavailable): volume ${metrics.searchVolume ?? "unknown"}, competition ${metrics.competition}.\nUse the exact target keyword "${brief.targetKeyword}" in the title or meta description, in the first paragraph and in at least one H2. Write 900-2000 words. The slug should be short and keyword-based.`,
    schema: blogPostSchema,
    temperature: 0.7,
    mock: () => {
      const keyword = brief.targetKeyword;
      const filler = `This paragraph is placeholder copy generated in mock mode for the ${keyword} draft, so the research, drafting, review and scheduling steps can be exercised end to end without an LLM key. A live run replaces it with a full article written from the research brief.`;
      const sections = brief.outline.map((section) => `## ${section.heading}\n\n${section.points.map((point) => `${point} ${filler}`).join("\n\n")}\n\n${filler}\n\n- Concrete step one for ${keyword}\n- Concrete step two\n- Concrete step three`).join("\n\n");
      return {
        title: `A Practical Guide to ${keyword.replace(/\b\w/g, (letter) => letter.toUpperCase())}`.slice(0, 70),
        slug: slugify(keyword),
        metaDescription: `Learn how ${keyword} works, what it costs and how to run it well before launch, with a step-by-step checklist for small app teams.`.slice(0, 160),
        excerpt: `A step-by-step look at ${keyword} for small app teams preparing a release.`,
        targetKeyword: keyword,
        secondaryKeywords: brief.secondaryKeywords.slice(0, 5),
        tags: ["beta testing", "mobile apps"],
        markdownBody: `## Why ${keyword} matters\n\nMock draft about ${keyword}.\n\n${sections}\n\n## Next steps\n\nSee [pricing](${siteUrl}/pricing) to plan a cohort.`,
        faq: [{ question: `How long does ${keyword} take?`, answer: "It depends on the build and the tasks; mock answer for pipeline testing." }],
        callToAction: "Plan your first cohort on SeedEnv.",
      };
    },
  });
}

// Social distribution agent: platform-specific variants validated against each network's limits.
export async function writeSocialPack({ llm, post }: { llm: GrowthLlm; post: BlogPost }): Promise<SocialPack> {
  return llm.generateStructured({
    agent: "social",
    system: `You are SeedEnv's social media editor.\n${PRODUCT_CONTEXT}\nWrite native posts per platform that make developers want to read the article. No engagement bait, no emojis walls, no fake urgency, no invented numbers. Do not include links; they are added automatically.`,
    prompt: `Article title: ${post.title}\nExcerpt: ${post.excerpt}\nKey points:\n${post.markdownBody.match(/^##\s.+$/gm)?.slice(0, 8).join("\n") ?? ""}\nTarget keyword: ${post.targetKeyword}`,
    schema: socialPackSchema,
    temperature: 0.8,
    mock: () => ({
      twitter: { text: `New guide: ${post.title}. What it takes, what it costs and the mistakes to avoid before launch.`.slice(0, 230), hashtags: ["#indiedev"] },
      linkedin: { text: `${post.title}\n\n${post.excerpt}\n\nWe wrote this for small teams shipping their first TestFlight or Google Play build: what to plan for, how long it takes and where projects usually stall. This is mock-mode copy used to exercise the growth pipeline end to end without calling a model.`, hashtags: ["#mobiledev", "#betatesting"] },
      instagram: { caption: `${post.title}\n\n${post.excerpt}\n\nFull guide at the link in bio. (Mock-mode caption for pipeline testing.)`, hashtags: ["#appdev", "#betatesting", "#indiedev"], imageAltText: `Title card for the article ${post.title}` },
    }),
  });
}
