import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { MemberShell } from "@/components/member-shell";
import { MemberAction } from "@/components/member-action";
import { CommunityFeed } from "@/components/community-feed";
import { dismissCommunityReport, hideCommunityContent } from "@/app/actions/communityActions";
import { requireMember } from "@/lib/member";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const authorSelect = { id: true, username: true, role: true, xpPoints: true } as const;

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!await getServerSession(authOptions)) redirect("/auth/signin?callbackUrl=/community");
  const user = await requireMember();
  const params = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page || "1", 10) || 1));
  const [posts, reports] = await Promise.all([
    prisma.communityPost.findMany({ where: { hidden: false }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 21, include: { author: { select: authorSelect }, comments: { where: { hidden: false }, orderBy: { createdAt: "desc" }, take: 5, include: { author: { select: authorSelect } } }, _count: { select: { comments: { where: { hidden: false } } } } } }),
    user.role === "ADMIN" ? prisma.communityReport.findMany({ where: { resolved: false }, include: { post: true, comment: true }, orderBy: { createdAt: "asc" }, take: 50 }) : Promise.resolve([]),
  ]);
  return <MemberShell title="Launch Circle" home={user.role === "DEVELOPER" ? "/console" : user.role === "ADMIN" ? "/admin" : "/dashboard"}>{user.role === "ADMIN" ? <section className="mb-6 space-y-3 rounded-xl border border-rose-400/20 p-5"><h2 className="text-xl font-bold">Moderation queue</h2>{reports.length ? reports.map((report) => <div key={report.id} className="rounded-xl border border-stroke p-4"><p className="break-words text-sm text-neutral-400">Content: {report.post?.body || report.comment?.body}</p><p className="mt-2 text-sm">Report: {report.reason}</p><div className="mt-3 flex flex-wrap gap-3"><MemberAction action={() => hideCommunityContent(report.postId || report.commentId || "", report.postId ? "post" : "comment")}>Remove content</MemberAction><MemberAction action={() => dismissCommunityReport(report.id)}>Dismiss report</MemberAction></div></div>) : <p className="text-neutral-400">No open reports.</p>}</section> : null}<CommunityFeed posts={posts.slice(0, 20).map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))} userId={user.id} developer={user.role === "DEVELOPER" || user.role === "ADMIN"} admin={user.role === "ADMIN"} /><nav aria-label="Feed pages" className="mt-6 flex gap-4">{page > 1 ? <Link href={`/community?page=${page - 1}`} className="rounded-xl border border-stroke px-4 py-3">Previous</Link> : null}{posts.length > 20 ? <Link href={`/community?page=${page + 1}`} className="rounded-xl border border-stroke px-4 py-3">Next</Link> : null}</nav></MemberShell>;
}
