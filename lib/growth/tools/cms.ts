import { createHmac } from "node:crypto";
import type { GrowthConfig } from "@/lib/growth/config";
import type { GrowthLogger } from "@/lib/growth/log";
import { fetchJson, withRetry } from "@/lib/growth/retry";
import { blogPostSchema, type BlogPost, type ResearchBrief } from "@/lib/growth/schemas";
import type { ContentDropRecord, GrowthStore } from "@/lib/growth/store";

export type CmsPostPayload = { contentDropId: string; post: BlogPost; research: ResearchBrief; siteUrl: string };

// Article + FAQPage JSON-LD built deterministically from validated fields, never from free-form model output.
export function buildStructuredData(post: BlogPost, url: string, publisher = "SeedEnv") {
  const graph: Record<string, unknown>[] = [{ "@type": "BlogPosting", headline: post.title, description: post.metaDescription, keywords: [post.targetKeyword, ...post.secondaryKeywords].join(", "), mainEntityOfPage: url, url, author: { "@type": "Organization", name: publisher }, publisher: { "@type": "Organization", name: publisher } }];
  if (post.faq.length) graph.push({ "@type": "FAQPage", mainEntity: post.faq.map((item) => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) });
  return { "@context": "https://schema.org", "@graph": graph };
}

export function createCmsTool(config: GrowthConfig["cms"], store: GrowthStore, logger: GrowthLogger) {
  // stage_cms_post(post_payload): writes the validated draft into the ContentDrop table (SeedEnv's CMS store) as DRAFTED, awaiting review.
  async function stageCmsPost(payload: CmsPostPayload): Promise<ContentDropRecord> {
    const post = blogPostSchema.parse(payload.post);
    const url = `${payload.siteUrl}/blog/${post.slug}`;
    const metadata = { metaDescription: post.metaDescription, excerpt: post.excerpt, tags: post.tags, secondaryKeywords: post.secondaryKeywords, faq: post.faq, callToAction: post.callToAction, canonicalUrl: url, openGraph: { title: post.title, description: post.metaDescription, url, type: "article" }, structuredData: buildStructuredData(post, url) };
    const drop = await store.updateContentDrop(payload.contentDropId, { title: post.title, slug: post.slug, markdownBody: post.markdownBody, metadata, research: payload.research, status: "DRAFTED" }, "RESEARCHING");
    if (!drop) throw new Error(`Content drop ${payload.contentDropId} is no longer in RESEARCHING state.`);
    logger.info("cms_post_staged", { contentDropId: drop.id, slug: drop.slug });
    return drop;
  }

  // Runs only after a human approves. Without a publish webhook, SeedEnv's own /blog renders the drop once it is marked PUBLISHED.
  async function publishApproved(drop: ContentDropRecord): Promise<{ published: boolean; externalUrl?: string }> {
    if (!config.publishWebhookUrl) return { published: false };
    const body = JSON.stringify({ id: drop.id, title: drop.title, slug: drop.slug, markdown: drop.markdownBody, metadata: drop.metadata });
    const signature = config.publishWebhookSecret ? createHmac("sha256", config.publishWebhookSecret).update(body).digest("hex") : undefined;
    const response = await withRetry(() => fetchJson<{ url?: string }>(config.publishWebhookUrl!, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `content-drop-${drop.id}`, ...(signature ? { "X-Growth-Signature": `sha256=${signature}` } : {}) }, body }), { label: "cms:publish", logger });
    return { published: true, externalUrl: typeof response.url === "string" ? response.url : undefined };
  }

  return { stageCmsPost, publishApproved };
}
