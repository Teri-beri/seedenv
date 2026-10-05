import Link from "next/link";
import { MemberShell } from "@/components/member-shell";
import { MemberAction } from "@/components/member-action";
import { CommunityFeed } from "@/components/community-feed";
import { PublicLaunchCircle } from "@/components/public-launch-circle";
import { dismissCommunityReport, hideCommunityContent } from "@/app/actions/communityActions";
import { optionalCircleMember, circleAuthorSelect } from "@/lib/public-launch-circle";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await optionalCircleMember();
  const params = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page || "1", 10) || 1));
  const [directory, reports] = await Promise.all([
    prisma.communityPost.findMany({ where: { hidden: false, ...(!user ? { publicVisible: true } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 21, include: { author: { select: circleAuthorSelect }, comments: { where: { hidden: false }, orderBy: { createdAt: "desc" }, take: 5, include: { author: { select: circleAuthorSelect } } }, _count: { select: { comments: { where: { hidden: false } } } } } }).then((posts) => ({ posts, unavailable: false })).catch((error: unknown) => { console.error("SeedEnv Launch Circle feed unavailable:", error); return { posts: [], unavailable: true }; }),
    user?.role === "ADMIN" ? prisma.communityReport.findMany({ where: { resolved: false }, include: { post: true, comment: true }, orderBy: { createdAt: "asc" }, take: 50 }) : Promise.resolve([]),
  ]);
  const posts = directory.posts;
  const feed = posts.slice(0, 20).map((post) => ({ ...post, createdAt: post.createdAt.toISOString() }));
  const dualWorkspace = Boolean(user && user.role !== "ADMIN" && (user.testerWorkspaceEnabled || user.role === "TESTER") && (user.developerWorkspaceEnabled || user.role === "DEVELOPER"));
  return <MemberShell title="Launch Circle" home={!user ? "/" : user.role === "DEVELOPER" ? "/console" : user.role === "ADMIN" ? "/admin" : "/dashboard"}>
    {user?.role === "ADMIN" ? <section className="mb-6 space-y-3 rounded-lg border border-rose-400/20 p-5"><h2 className="text-xl font-semibold">Moderation queue</h2>{reports.length ? reports.map((report) => <div key={report.id} className="rounded-lg border border-white/10 p-4"><p className="break-words text-sm text-zinc-400">Content: {report.post?.body || report.comment?.body}</p><p className="mt-2 text-sm">Report: {report.reason}</p><div className="mt-3 flex flex-wrap gap-3"><MemberAction action={() => hideCommunityContent(report.postId || report.commentId || "", report.postId ? "post" : "comment")}>Remove content</MemberAction><MemberAction action={() => dismissCommunityReport(report.id)}>Dismiss report</MemberAction></div></div>) : <p className="text-zinc-400">No open reports.</p>}</section> : null}
    {user && !directory.unavailable ? <CommunityFeed posts={feed} userId={user.id} developer={user.role === "DEVELOPER" || user.role === "ADMIN"} admin={user.role === "ADMIN"} activeRole={user.role} dualWorkspace={dualWorkspace} /> : <PublicLaunchCircle posts={feed} signedIn={Boolean(user)} unavailable={directory.unavailable} />}
    <nav aria-label="Feed pages" className="mt-6 flex gap-4">{page > 1 ? <Link href={`/community?page=${page - 1}`} className="min-h-11 rounded-lg border border-white/10 px-4 py-3">Previous</Link> : null}{posts.length > 20 ? <Link href={`/community?page=${page + 1}`} className="min-h-11 rounded-lg border border-white/10 px-4 py-3">Next</Link> : null}</nav>
  </MemberShell>;
}