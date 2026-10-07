import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { requireMember } from "@/lib/member";
import { prisma } from "@/lib/prisma";
import type { FeedPost } from "@/components/community-feed";

export const circleAuthorSelect = { id: true, username: true, role: true, xpPoints: true } as const;

export async function optionalCircleMember() {
  try {
    const session = await getServerSession(authOptions);
    return session?.user?.id ? await requireMember() : null;
  } catch { return null; }
}

export async function publicLaunchCircle() {
  try {
    const posts = await prisma.communityPost.findMany({
      where: { hidden: false, publicVisible: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: {
        id: true, body: true, createdAt: true, publicVisible: true,
        author: { select: circleAuthorSelect },
        comments: { where: { hidden: false }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, body: true, author: { select: circleAuthorSelect } } },
        _count: { select: { comments: { where: { hidden: false } } } },
      },
    });
    return { posts: posts.map((post) => ({ ...post, createdAt: post.createdAt.toISOString() })) as FeedPost[], unavailable: false };
  } catch (error) {
    console.error("SeedEnv public Launch Circle unavailable:", error);
    return { posts: [] as FeedPost[], unavailable: true };
  }
}