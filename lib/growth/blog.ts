import { cache } from "react";
import { prisma } from "@/lib/prisma";

export type BlogMetadata = { metaDescription?: string; excerpt?: string; tags?: string[]; faq?: Array<{ question: string; answer: string }>; structuredData?: unknown; canonicalUrl?: string };

export function blogMeta(value: unknown): BlogMetadata {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as BlogMetadata) : {};
}

// Only human-approved, published drops are ever readable on the public site.
export const listPublishedPosts = cache(async () => {
  try {
    return await prisma.contentDrop.findMany({ where: { status: "PUBLISHED", externalUrl: null }, orderBy: { publishedAt: "desc" }, select: { slug: true, title: true, metadata: true, publishedAt: true, updatedAt: true }, take: 500 });
  } catch {
    return [];
  }
});

export const getPublishedPost = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;
  return prisma.contentDrop.findFirst({ where: { slug, status: "PUBLISHED", externalUrl: null }, select: { slug: true, title: true, markdownBody: true, metadata: true, publishedAt: true, updatedAt: true } });
});

export function readingMinutes(markdown: string) {
  return Math.max(1, Math.round(markdown.split(/\s+/).length / 230));
}
