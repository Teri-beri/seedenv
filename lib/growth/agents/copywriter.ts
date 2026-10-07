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

export type SocialSource = { kind: "article"; post: BlogPost } | { kind: "update"; details: string };

// Social distribution agent: platform-specific variants validated against each network's limits, from either a blog article or a product update.
export async function writeSocialPack({ llm, source }: { llm: GrowthLlm; source: SocialSource }): Promise<SocialPack> {
  const brief = source.kind === "article"
    ? `Promote this new article so developers want to read it.\nArticle title: ${source.post.title}\nExcerpt: ${source.post.excerpt}\nKey points:\n${source.post.markdownBody.match(/^##\s.+$/gm)?.slice(0, 8).join("\n") ?? ""}\nTarget keyword: ${source.post.targetKeyword}`
    : `Announce this SeedEnv product update. Use only the facts given here and in the product context; do not invent features, numbers or dates.\nUpdate from the founder:\n"""\n${source.details}\n"""`;
  const title = source.kind === "article" ? source.post.title : "SeedEnv product update";
  const summary = source.kind === "article" ? source.post.excerpt : source.details.replace(/\s+/g, " ").slice(0, 200);
  return llm.generateStructured({
    agent: source.kind === "article" ? "social" : "social-update",
    system: `You are SeedEnv's social media director.\n${PRODUCT_CONTEXT}\nWrite native posts per platform for an audience of indie and small-team app developers. No engagement bait, no emoji walls, no fake urgency, no invented numbers or testimonials. Do not include links; they are added automatically. The TikTok entry is a script the founder films on a phone (usually a screen recording of SeedEnv with voiceover): open with a strong hook, keep beats concrete and filmable, end with a soft call to action ("link in bio").`,
    prompt: brief,
    schema: socialPackSchema,
    temperature: 0.8,
    mock: () => ({
      twitter: { text: `${title}: what changed, who it helps and how to try it.`.slice(0, 230), hashtags: ["#indiedev"] },
      linkedin: { text: `${title}\n\n${summary}\n\nWe build SeedEnv for small teams shipping their first TestFlight or Google Play build. This is mock-mode copy used to exercise the growth pipeline end to end without calling a model, so it is intentionally generic and long enough to pass validation.`, hashtags: ["#mobiledev", "#betatesting"] },
      instagram: { caption: `${title}\n\n${summary}\n\nDetails at the link in bio. (Mock-mode caption for pipeline testing.)`, hashtags: ["#appdev", "#betatesting", "#indiedev"], imageAltText: `Title card for ${title}` },
      tiktok: {
        caption: `${title}. Here's how it works in under a minute. Link in bio. (Mock caption)`,
        hashtags: ["#indiedev", "#appdev"],
        hook: "Your beta testers ghosting you? Watch this.",
        beats: [
          { visual: "Face to camera, phone in hand", voiceover: "Most beta tests die because nobody actually opens the build.", onScreenText: "Beta tests that actually run" },
          { visual: "Screen recording of the SeedEnv console", voiceover: `Here's what's new: ${summary.slice(0, 120)}`, onScreenText: "What's new" },
          { visual: "Screen recording of a tester submission", voiceover: "Testers record proof, you approve, they get paid.", onScreenText: "Pay only for approved work" },
        ],
        durationSeconds: 30,
      },
    }),
  });
}
