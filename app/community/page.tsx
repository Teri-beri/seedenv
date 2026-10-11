import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { TesterBottomNav } from "@/components/navigation";
import { MemberAction } from "@/components/member-action";
import { CommunityFeed } from "@/components/community-feed";
import { PublicLaunchCircle } from "@/components/public-launch-circle";
import { FeedHeader, feedHref, type FeedSort, type FeedTab } from "@/components/launch-circle/FeedHeader";
import { dismissCommunityReport, hideCommunityContent } from "@/app/actions/communityActions";
import { optionalCircleMember, circlePostInclude, toCirclePost } from "@/lib/public-launch-circle";
import { prisma } from "@/lib/prisma";
import { publicPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = publicPageMetadata("Launch Circle", "Live developer changelogs and validator feedback from the SeedEnv community.", "/community");

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ page?: string; sort?: string; show?: string; q?: string }> }) {
  const user = await optionalCircleMember();
  const params = await searchParams;
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page || "1", 10) || 1));
  const sort: FeedSort = params.sort === "discussed" ? "discussed" : "latest";
  const requestedTab = params.show === "drops" ? "drops" : params.show === "following" ? "following" : "all";
  const tab: FeedTab = requestedTab === "following" && !user ? "all" : requestedTab;
  const query = (params.q || "").trim().slice(0, 120);

  const scope: Prisma.CommunityPostWhereInput = tab === "following" && user
    ? { author: { followers: { some: { followerId: user.id } } } }
    : tab === "drops"
      ? { campaign: { is: { status: "ACTIVE" } } }
      : {};
  const search: Prisma.CommunityPostWhereInput = query
    ? { OR: [{ body: { contains: query, mode: "insensitive" } }, { campaign: { is: { title: { contains: query, mode: "insensitive" } } } }] }
    : {};
  const where: Prisma.CommunityPostWhereInput = { hidden: false, ...(user ? {} : { publicVisible: true }), ...scope, ...search };

  const [directory, reports, apps] = await Promise.all([
    prisma.communityPost.findMany({
      where,
      orderBy: sort === "discussed" ? [{ comments: { _count: "desc" } }, { createdAt: "desc" }, { id: "desc" }] : [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 20,
      take: 21,
      include: circlePostInclude(user?.id),
    }).then((posts) => ({ posts, unavailable: false })).catch((error: unknown) => { console.error("SeedEnv Launch Circle feed unavailable:", error); return { posts: [], unavailable: true }; }),
    user?.role === "ADMIN" ? prisma.communityReport.findMany({ where: { resolved: false }, include: { post: true, comment: true }, orderBy: { createdAt: "asc" }, take: 50 }) : Promise.resolve([]),
    user && (user.role === "DEVELOPER" || user.role === "ADMIN")
      ? prisma.appCampaign.findMany({ where: { developerId: user.id, status: { in: ["DRAFT", "ESCROW_PENDING", "ACTIVE", "PAUSED"] } }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, title: true, platform: true, status: true } }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const posts = directory.posts;
  const feed = posts.slice(0, 20).map(toCirclePost);
  const home = !user ? "/" : user.role === "DEVELOPER" ? "/console" : user.role === "ADMIN" ? "/admin" : "/dashboard";
  const canSwitchToDeveloper = Boolean(user && user.role === "TESTER" && user.developerWorkspaceEnabled);
  const emptyMessage = query ? `No updates match "${query}".` : tab === "following" ? "Follow developers to see their releases here." : tab === "drops" ? "No updates are attached to an active cohort drop right now." : undefined;

  return <main id="main-content" className="mobile-app-shell min-h-screen bg-background px-4 py-6 text-white sm:px-6">
    <div className="mx-auto max-w-5xl">
      <FeedHeader tab={tab} sort={sort} query={query} home={home} member={Boolean(user)} />
      {user?.role === "ADMIN" ? <section className="mb-6 space-y-3 rounded-xl border border-rose-400/20 p-5"><h2 className="text-xl font-semibold">Moderation queue</h2>{reports.length ? reports.map((report) => <div key={report.id} className="rounded-lg border border-zinc-800 p-4"><p className="break-words text-sm text-zinc-400">Content: {report.post?.body || report.comment?.body}</p><p className="mt-2 text-sm">Report: {report.reason}</p><div className="mt-3 flex flex-wrap gap-3"><MemberAction tone="emerald" action={() => hideCommunityContent(report.postId || report.commentId || "", report.postId ? "post" : "comment")}>Remove content</MemberAction><MemberAction tone="emerald" action={() => dismissCommunityReport(report.id)}>Dismiss report</MemberAction></div></div>) : <p className="text-zinc-400">No open reports.</p>}</section> : null}
      {directory.unavailable
        ? <p role="status" className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-400">Launch Circle is temporarily unavailable. Please check back shortly.</p>
        : user
          ? <CommunityFeed posts={feed} userId={user.id} username={user.username} developer={user.role === "DEVELOPER"} admin={user.role === "ADMIN"} apps={apps} canSwitchToDeveloper={canSwitchToDeveloper} emptyMessage={emptyMessage} showSamples={!query} />
          : <PublicLaunchCircle posts={feed} signedIn={false} showSamples={!query} emptyMessage={emptyMessage} />}
      {user?.role === "TESTER" ? <TesterBottomNav /> : null}
      <nav aria-label="Feed pages" className="mt-6 flex gap-4">{page > 1 ? <Link href={feedHref({ tab, sort, query, page: page - 1 })} className="min-h-11 rounded-lg border border-zinc-800 px-4 py-3 font-mono text-xs text-zinc-300">Previous</Link> : null}{posts.length > 20 ? <Link href={feedHref({ tab, sort, query, page: page + 1 })} className="min-h-11 rounded-lg border border-zinc-800 px-4 py-3 font-mono text-xs text-zinc-300">Next</Link> : null}</nav>
    </div>
  </main>;
}
