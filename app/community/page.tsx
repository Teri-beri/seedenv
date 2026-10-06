import Link from "next/link";
import { MemberShell } from "@/components/member-shell";
import { MemberAction } from "@/components/member-action";
import { CommunityFeed } from "@/components/community-feed";
import { PublicLaunchCircle } from "@/components/public-launch-circle";
import { dismissCommunityReport, hideCommunityContent } from "@/app/actions/communityActions";
import { optionalCircleMember, circleAuthorSelect } from "@/lib/public-launch-circle";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type FeedSort = "latest" | "discussed";
type FeedScope = "all" | "public" | "members";

function feedHref(sort: FeedSort, scope: FeedScope, page = 1) {
  const query = new URLSearchParams();
  if (sort !== "latest") query.set("sort", sort);
  if (scope !== "all") query.set("show", scope);
  if (page > 1) query.set("page", String(page));
  const value = query.toString();
  return value ? `/community?${value}` : "/community";
}

function FeedFilters({ sort, scope, member }: { sort: FeedSort; scope: FeedScope; member: boolean }) {
  const tab = (active: boolean) => `inline-flex min-h-9 items-center rounded-md px-3 transition-colors ${active ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"}`;
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4 font-mono text-xs">
    <nav aria-label="Sort feed" className="inline-flex rounded-lg border border-white/10 p-0.5">{([["latest", "Latest"], ["discussed", "Most discussed"]] as const).map(([value, label]) => <Link key={value} href={feedHref(value, scope)} aria-current={sort === value ? "page" : undefined} className={tab(sort === value)}>{label}</Link>)}</nav>
    {member ? <nav aria-label="Filter feed" className="inline-flex rounded-lg border border-white/10 p-0.5">{([["all", "All"], ["public", "Public"], ["members", "Members only"]] as const).map(([value, label]) => <Link key={value} href={feedHref(sort, value)} aria-current={scope === value ? "page" : undefined} className={tab(scope === value)}>{label}</Link>)}</nav> : null}
  </div>;
}

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ page?: string; sort?: string; show?: string }> }) {
  const user = await optionalCircleMember();
  const params = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page || "1", 10) || 1));
  const sort: FeedSort = params.sort === "discussed" ? "discussed" : "latest";
  const scope: FeedScope = user && (params.show === "public" || params.show === "members") ? params.show : "all";
  const visibility = !user || scope === "public" ? { publicVisible: true } : scope === "members" ? { publicVisible: false } : {};
  const [directory, reports] = await Promise.all([
    prisma.communityPost.findMany({ where: { hidden: false, ...visibility }, orderBy: sort === "discussed" ? [{ comments: { _count: "desc" } }, { createdAt: "desc" }, { id: "desc" }] : [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 21, include: { author: { select: circleAuthorSelect }, comments: { where: { hidden: false }, orderBy: { createdAt: "desc" }, take: 5, include: { author: { select: circleAuthorSelect } } }, _count: { select: { comments: { where: { hidden: false } } } } } }).then((posts) => ({ posts, unavailable: false })).catch((error: unknown) => { console.error("SeedEnv Launch Circle feed unavailable:", error); return { posts: [], unavailable: true }; }),
    user?.role === "ADMIN" ? prisma.communityReport.findMany({ where: { resolved: false }, include: { post: true, comment: true }, orderBy: { createdAt: "asc" }, take: 50 }) : Promise.resolve([]),
  ]);
  const posts = directory.posts;
  const feed = posts.slice(0, 20).map((post) => ({ ...post, createdAt: post.createdAt.toISOString() }));
  const dualWorkspace = Boolean(user && user.role !== "ADMIN" && (user.testerWorkspaceEnabled || user.role === "TESTER") && (user.developerWorkspaceEnabled || user.role === "DEVELOPER"));
  return <MemberShell title="Launch Circle" home={!user ? "/" : user.role === "DEVELOPER" ? "/console" : user.role === "ADMIN" ? "/admin" : "/dashboard"}>
    {user?.role === "ADMIN" ? <section className="mb-6 space-y-3 rounded-lg border border-rose-400/20 p-5"><h2 className="text-xl font-semibold">Moderation queue</h2>{reports.length ? reports.map((report) => <div key={report.id} className="rounded-lg border border-white/10 p-4"><p className="break-words text-sm text-zinc-400">Content: {report.post?.body || report.comment?.body}</p><p className="mt-2 text-sm">Report: {report.reason}</p><div className="mt-3 flex flex-wrap gap-3"><MemberAction action={() => hideCommunityContent(report.postId || report.commentId || "", report.postId ? "post" : "comment")}>Remove content</MemberAction><MemberAction action={() => dismissCommunityReport(report.id)}>Dismiss report</MemberAction></div></div>) : <p className="text-zinc-400">No open reports.</p>}</section> : null}
    {!directory.unavailable ? <FeedFilters sort={sort} scope={scope} member={Boolean(user)} /> : null}
    {user && !directory.unavailable ? <CommunityFeed posts={feed} userId={user.id} developer={user.role === "DEVELOPER" || user.role === "ADMIN"} admin={user.role === "ADMIN"} activeRole={user.role} dualWorkspace={dualWorkspace} /> : <PublicLaunchCircle posts={feed} signedIn={Boolean(user)} unavailable={directory.unavailable} />}
    <nav aria-label="Feed pages" className="mt-6 flex gap-4">{page > 1 ? <Link href={feedHref(sort, scope, page - 1)} className="min-h-11 rounded-lg border border-white/10 px-4 py-3">Previous</Link> : null}{posts.length > 20 ? <Link href={feedHref(sort, scope, page + 1)} className="min-h-11 rounded-lg border border-white/10 px-4 py-3">Next</Link> : null}</nav>
  </MemberShell>;
}