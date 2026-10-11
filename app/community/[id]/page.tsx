import { notFound } from "next/navigation";
import Link from "next/link";
import { MemberShell } from "@/components/member-shell";
import { CommunityFeed } from "@/components/community-feed";
import { PublicLaunchCircle } from "@/components/public-launch-circle";
import { optionalCircleMember, circlePostInclude, toCirclePost } from "@/lib/public-launch-circle";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DiscussionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const user = await optionalCircleMember();
  const { id } = await params;
  const query = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(query.page || "1", 10) || 1));
  const post = await prisma.communityPost.findFirst({ where: { id, hidden: false, ...(!user ? { publicVisible: true } : {}) }, include: circlePostInclude(user?.id, { comments: 25, skip: (page - 1) * 25, order: "asc" }) });
  if (!post) notFound();
  const feed = [toCirclePost(post)];
  return <MemberShell title="Launch Circle Discussion" subtitle="Live developer changelogs & validator feedback" home="/community" back="/community">
    {user ? <CommunityFeed posts={feed} userId={user.id} username={user.username} developer={false} admin={user.role === "ADMIN"} allowNewPosts={false} showSamples={false} showDiscussionLink={false} /> : <PublicLaunchCircle posts={feed} signedIn={false} showSamples={false} showDiscussionLink={false} />}
    <nav aria-label="Comment pages" className="mt-6 flex gap-4">{page > 1 ? <Link href={`/community/${encodeURIComponent(id)}?page=${page - 1}`} className="min-h-11 p-3">Previous comments</Link> : null}{post._count.comments > page * 25 ? <Link href={`/community/${encodeURIComponent(id)}?page=${page + 1}`} className="min-h-11 p-3">Next comments</Link> : null}</nav>
  </MemberShell>;
}
