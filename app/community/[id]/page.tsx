import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { MemberShell } from "@/components/member-shell";
import { CommunityFeed } from "@/components/community-feed";
import { requireMember } from "@/lib/member";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DiscussionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  if (!await getServerSession(authOptions)) redirect("/auth/signin?callbackUrl=/community");
  const user = await requireMember();
  const { id } = await params;
  const query = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(query.page || "1", 10) || 1));
  const author = { id: true, username: true, role: true, xpPoints: true } as const;
  const post = await prisma.communityPost.findFirst({ where: { id, hidden: false }, include: { author: { select: author }, comments: { where: { hidden: false }, orderBy: { createdAt: "asc" }, skip: (page - 1) * 25, take: 25, include: { author: { select: author } } }, _count: { select: { comments: { where: { hidden: false } } } } } });
  if (!post) notFound();
  return <MemberShell title="App discussion" home={user.role === "ADMIN" ? "/admin" : user.role === "DEVELOPER" ? "/console" : "/dashboard"}><CommunityFeed posts={[{ ...post, createdAt: post.createdAt.toISOString() }]} userId={user.id} developer={false} admin={user.role === "ADMIN"} /><nav aria-label="Comment pages" className="mt-6 flex gap-4">{page > 1 ? <Link href={`/community/${id}?page=${page - 1}`} className="p-3">Previous comments</Link> : null}{post._count.comments > page * 25 ? <Link href={`/community/${id}?page=${page + 1}`} className="p-3">Next comments</Link> : null}</nav></MemberShell>;
}
