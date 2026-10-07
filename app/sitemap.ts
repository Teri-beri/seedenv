import type { MetadataRoute } from "next";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isPublicHandle, publicProfilePath, SEED_ACCOUNT_EMAIL_SUFFIX } from "@/lib/public-profile";
import { SITE_URL } from "@/lib/seo";
import { listPublishedPosts } from "@/lib/growth/blog";

export const revalidate = 3600;

async function developerProfiles(): Promise<MetadataRoute.Sitemap> {
  try {
    const users = await prisma.user.findMany({
      where: { NOT: { email: { endsWith: SEED_ACCOUNT_EMAIL_SUFFIX } }, OR: [{ role: { in: [UserRole.DEVELOPER, UserRole.ADMIN] } }, { developerWorkspaceEnabled: true }] },
      select: { username: true, updatedAt: true },
      take: 5000,
    });
    const counts = new Map<string, number>();
    for (const user of users) counts.set(user.username.toLowerCase(), (counts.get(user.username.toLowerCase()) || 0) + 1);
    // Profiles with case-insensitive handle collisions resolve to 404, so leave them out.
    return users
      .filter((user) => isPublicHandle(user.username) && counts.get(user.username.toLowerCase()) === 1)
      .map((user) => ({ url: `${SITE_URL}${publicProfilePath(user.username)}`, lastModified: user.updatedAt, changeFrequency: "weekly" as const, priority: 0.4 }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/explore`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/validators/join`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/community`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/auth/signin`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/docs`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/terimus`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/status`, changeFrequency: "daily", priority: 0.3 },
    { url: `${SITE_URL}/security`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    ...(await listPublishedPosts()).map((post) => ({ url: `${SITE_URL}/blog/${post.slug}`, lastModified: post.updatedAt, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...(await developerProfiles()),
  ];
}
