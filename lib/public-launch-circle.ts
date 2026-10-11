import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth-options";
import { requireMember } from "@/lib/member";
import { prisma } from "@/lib/prisma";
import type { CirclePost } from "@/components/launch-circle/types";

export const circleAuthorSelect = { id: true, username: true, role: true, xpPoints: true } as const;

/** Shared post shape for every Launch Circle surface; `viewerId` adds the viewer's own helpful mark. */
export function circlePostInclude(viewerId?: string, options: { comments?: number; skip?: number; order?: "asc" | "desc" } = {}) {
  const { comments = 5, skip = 0, order = "desc" } = options;
  return {
    author: { select: circleAuthorSelect },
    campaign: { select: { id: true, title: true, platform: true, status: true } },
    comments: { where: { hidden: false }, orderBy: { createdAt: order }, skip, take: comments, include: { author: { select: circleAuthorSelect } } },
    helpfulVotes: { where: { userId: viewerId ?? "" }, select: { userId: true }, take: 1 },
    _count: { select: { comments: { where: { hidden: false } }, helpfulVotes: true } },
  } satisfies Prisma.CommunityPostInclude;
}

type CirclePostRow = {
  id: string;
  body: string;
  createdAt: Date;
  publicVisible: boolean;
  tag: string;
  buildLabel: string | null;
  author: { id: string; username: string; role: string; xpPoints: number };
  campaign: { id: string; title: string; platform: string; status: string } | null;
  comments: Array<{ id: string; body: string; tag: string; deviceLabel: string | null; createdAt?: Date; author: { id: string; username: string; role: string; xpPoints: number } }>;
  helpfulVotes: Array<{ userId: string }>;
  _count: { comments: number; helpfulVotes: number };
};

export function toCirclePost(post: CirclePostRow): CirclePost {
  return {
    id: post.id,
    body: post.body,
    createdAt: post.createdAt.toISOString(),
    publicVisible: post.publicVisible,
    tag: post.tag as CirclePost["tag"],
    buildLabel: post.buildLabel,
    campaign: post.campaign,
    author: post.author,
    helpfulCount: post._count.helpfulVotes,
    viewerFoundHelpful: post.helpfulVotes.length > 0,
    _count: { comments: post._count.comments },
    comments: post.comments.map((comment) => ({ id: comment.id, body: comment.body, author: comment.author, tag: comment.tag as CirclePost["comments"][number]["tag"], deviceLabel: comment.deviceLabel, createdAt: comment.createdAt?.toISOString() })),
  };
}

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
      include: circlePostInclude(),
    });
    return { posts: posts.map(toCirclePost), unavailable: false };
  } catch (error) {
    console.error("SeedEnv public Launch Circle unavailable:", error);
    return { posts: [] as CirclePost[], unavailable: true };
  }
}
