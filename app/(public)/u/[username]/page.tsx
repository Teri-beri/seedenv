import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicDeveloperProfile, publicProfilePath, safeExternalUrl } from "@/lib/public-profile";
import { platformTag } from "@/lib/billing";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { blockedBetween, isDeveloper } from "@/lib/social-connections";
import { FollowControls } from "@/components/social-controls";
import { CohortBriefLink } from "@/components/cohort-brief-link";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getPublicDeveloperProfile((await params).username);
  if (!profile) return { title: "Profile not found", robots: { index: false } };
  const title = `@${profile.username} · ${isDeveloper(profile) ? "Developer" : "Tester"} Profile`;
  const description = profile.bio || `Follow @${profile.username}'s journey and public activity on SeedEnv.`;
  return { title, description, alternates: { canonical: publicProfilePath(profile.username) }, openGraph: { title, description } };
}

export default async function PublicDeveloperProfilePage({ params, searchParams }: Props & { searchParams: Promise<{ activityPage?: string }> }) {
  const profile = await getPublicDeveloperProfile((await params).username);
  if (!profile) notFound();
  const session = await getServerSession(authOptions);
  const viewerId = session?.user?.id;
  const follow = viewerId ? await prisma.userFollow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: profile.id } } }) : null;
  const blocked = viewerId && viewerId !== profile.id ? await blockedBetween(prisma, viewerId, profile.id) : false;
  const developer = isDeveloper(profile);
  const tester = profile.role === "TESTER" || profile.testerWorkspaceEnabled;
  const page = Math.max(1, Math.min(10000, Number.parseInt((await searchParams).activityPage || "1", 10) || 1));
  const visiblePost = { hidden: false, ...(!viewerId ? { publicVisible: true } : {}) };
  const [posts, comments] = await Promise.all([
    prisma.communityPost.findMany({ where: { authorId: profile.id, ...visiblePost }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 10, take: 11, select: { id: true, body: true, publicVisible: true, createdAt: true } }),
    prisma.communityComment.findMany({ where: { authorId: profile.id, hidden: false, post: visiblePost }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 10, take: 11, select: { id: true, body: true, postId: true, createdAt: true } }),
  ]);

  const initial = profile.username.charAt(0).toUpperCase();
  const avatarUrl = safeExternalUrl(profile.avatarUrl);
  const twitter = profile.twitterHandle?.replace(/^@/, "");
  const links = [
    { label: "Website", href: safeExternalUrl(profile.productUrl) },
    { label: "Portfolio", href: safeExternalUrl(profile.portfolioUrl) },
    { label: "GitHub", href: profile.githubUsername ? `https://github.com/${encodeURIComponent(profile.githubUsername)}` : null },
    { label: "X / Twitter", href: twitter ? `https://x.com/${encodeURIComponent(twitter)}` : null },
    { label: "Discord", href: safeExternalUrl(profile.discordUrl) },
  ].filter((link): link is { label: string; href: string } => Boolean(link.href));

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <span
          className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900 bg-cover bg-center text-xl font-semibold text-zinc-300"
          style={avatarUrl ? { backgroundImage: `url(${JSON.stringify(avatarUrl)})` } : undefined}
          role="img"
          aria-label={`@${profile.username} avatar`}
        >
          {avatarUrl ? null : initial}
        </span>
        <div className="min-w-0">
          <span className="block font-mono text-xs uppercase tracking-wider text-zinc-500">{developer ? "Developer" : "Tester"}{developer && tester ? " / Tester" : ""} Profile / Joined {profile.createdAt.toISOString().slice(0, 10)}</span>
          <h1 className="!mt-1 break-words !text-2xl !font-semibold tracking-tight text-zinc-100 sm:!text-3xl">@{profile.username}</h1>
          {profile.companyName ? <span className="mt-1 block font-mono text-sm text-zinc-400">{profile.companyName}</span> : null}
        </div>
      </section>

      {profile.bio ? <div className="max-w-2xl text-base leading-relaxed text-zinc-300">{profile.bio}</div> : null}
      <div className="flex gap-5 font-mono text-sm text-zinc-400"><span>{profile.followers} followers</span><span>{profile.following} following</span></div>
      <FollowControls targetId={profile.id} developer={developer} signedIn={Boolean(viewerId)} own={viewerId === profile.id} following={Boolean(follow)} emailUpdates={follow?.emailUpdates || false} blocked={blocked} />
      <section className="grid gap-4 sm:grid-cols-2" aria-label="Profile statistics">
        {developer ? <div className="rounded-xl border border-white/10 bg-[#12161F] p-5"><h2 className="!mt-0">Developer journey</h2><dl className="mt-4 space-y-3 text-sm"><div>Launched cohorts <strong className="float-right text-emerald-300">{profile.launched}</strong></div><div>Approved tester reports <strong className="float-right text-emerald-300">{profile.approved}</strong></div></dl></div> : null}
        {tester ? <div className="rounded-xl border border-white/10 bg-[#12161F] p-5"><h2 className="!mt-0">Tester track record</h2><dl className="mt-4 space-y-3 text-sm"><div>REP <strong className="float-right text-emerald-300">{profile.xpPoints}</strong></div><div>Rank <strong className="float-right">{profile.rankTier.replaceAll("_", " ")}</strong></div><div>Approved reports <strong className="float-right">{profile.testerApproved}</strong></div><div>Approval rate <strong className="float-right">{profile.testerReviewed ? `${Math.round(profile.testerApproved / profile.testerReviewed * 100)}%` : "Not yet rated"}</strong></div></dl><p className="!text-xs">Based on {profile.testerReviewed} reviewed reports. Pending disputes, unfinished work and expired assignments are excluded. Stats are not a guarantee of future performance.</p></div> : null}
      </section>

      {links.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Developer links">
          {links.map((link) => (
            <li key={link.label}>
              <a href={link.href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 font-mono text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100">
                {link.label} <span className="text-zinc-500">↗</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      <section className="border-t border-zinc-800 pt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="!mt-0 !text-base !font-semibold text-zinc-100">Active Cohorts</h2>
          <span className="font-mono text-xs text-zinc-500">{profile.cohorts.length} open</span>
        </div>
        {profile.cohorts.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {profile.cohorts.map((cohort) => {
              const open = Math.max(0, cohort.totalSlots - cohort.claimedSlots);
              const platform = platformTag(cohort.platform);
              return (
                <li key={cohort.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700">
                  <div className="flex items-start justify-between gap-3">
                    <CohortBriefLink campaignId={cohort.id} className="break-words text-sm font-medium text-zinc-100 hover:text-emerald-300">{cohort.title}</CohortBriefLink>
                    {platform ? <span className="shrink-0 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">{platform}</span> : null}
                  </div>
                  <span className="mt-2 line-clamp-2 block text-sm text-zinc-400">{cohort.description}</span>
                  <div className="mt-4 flex items-center justify-between font-mono text-xs">
                    <span className="text-emerald-400">${cohort.bountyPerTaskUsd.toFixed(2)} / approved task</span>
                    <span className="text-zinc-500">{open} of {cohort.totalSlots} slots open</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">No cohorts are recruiting testers right now.</div>
        )}
        <Link href="/explore" className="mt-6 inline-flex font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-100">Browse all open cohorts →</Link>
      </section>
      <section className="border-t border-white/10 pt-6"><h2 className="!mt-0">Launch Circle activity</h2><p>{viewerId ? "Visible updates and discussion replies." : "Public updates and replies only. Members-only conversations stay private."}</p><div className="mt-5 grid gap-5 sm:grid-cols-2"><div><h3 className="font-semibold">Updates</h3>{!posts.length ? <p>No visible updates.</p> : null}{posts.slice(0, 10).map(post => <article key={post.id} className="mt-3 rounded-xl border border-white/10 p-4"><time className="font-mono text-xs text-zinc-500">{post.createdAt.toISOString().slice(0, 10)} / {post.publicVisible ? "Public" : "Members only"}</time><p className="whitespace-pre-wrap break-words text-sm">{post.body}</p><Link className="mt-3 inline-flex min-h-11 items-center text-sm text-emerald-300" href={`/community/${post.id}`}>Read conversation</Link></article>)}</div><div><h3 className="font-semibold">Discussion replies</h3>{!comments.length ? <p>No visible replies.</p> : null}{comments.slice(0, 10).map(comment => <article key={comment.id} className="mt-3 rounded-xl border border-white/10 p-4"><time className="font-mono text-xs text-zinc-500">{comment.createdAt.toISOString().slice(0, 10)}</time><p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p><Link className="mt-3 inline-flex min-h-11 items-center text-sm text-emerald-300" href={`/community/${comment.postId}`}>Read conversation</Link></article>)}</div></div><nav aria-label="Activity pages" className="mt-5 flex gap-4">{page > 1 ? <Link href={`?activityPage=${page - 1}`}>Newer activity</Link> : null}{posts.length > 10 || comments.length > 10 ? <Link href={`?activityPage=${page + 1}`}>Older activity</Link> : null}</nav></section>
    </div>
  );
}
