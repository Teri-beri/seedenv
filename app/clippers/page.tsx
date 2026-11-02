import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth-options";
import { MemberShell } from "@/components/member-shell";
import { ClipperWorkspace } from "@/components/clipper-workspace";
import { ClipperMarketplace } from "@/components/clipper-marketplace";
import { ClipperAdminReview } from "@/components/clipper-admin-review";
import { clipGenres, clipPlatforms, clipProfileSchema, type ClipProfileView } from "@/lib/clipper-rules";
import { clipMember, clippersEnabled } from "@/lib/clippers";
import { tikTokConfigured } from "@/lib/clipper-tiktok";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const filtersSchema = z.object({
  q: z.string().trim().max(100).default(""),
  genre: z.union([z.literal(""), z.enum(clipGenres)]).default(""),
  platform: z.union([z.literal(""), z.enum(clipPlatforms)]).default(""),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  campaignPage: z.coerce.number().int().min(1).max(10000).default(1),
  workPage: z.coerce.number().int().min(1).max(10000).default(1),
});

function profileView(profile: { bio: string; portfolioUrl: string; socialUrl: string; specialties: string; genres: string[]; tiktokUrl: string | null; instagramUrl: string | null; youtubeUrl: string | null; status: string; revision: number; reviewNote: string | null; available: boolean }): ClipProfileView {
  return { bio: profile.bio, portfolioUrl: profile.portfolioUrl, socialUrl: profile.socialUrl, specialties: profile.specialties, genres: z.array(z.enum(clipGenres)).parse(profile.genres), tiktokUrl: profile.tiktokUrl || "", instagramUrl: profile.instagramUrl || "", youtubeUrl: profile.youtubeUrl || "", status: profile.status, revision: profile.revision, reviewNote: profile.reviewNote, available: profile.available };
}

export default async function ClippersPage({ searchParams }: { searchParams: Promise<{ social?: string; q?: string; genre?: string; platform?: string; page?: string; review?: string; campaignPage?: string; workPage?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin?callbackUrl=/clippers");
  const home = session.user.role === "DEVELOPER" ? "/console" : session.user.role === "ADMIN" ? "/admin" : "/dashboard";
  if (!clippersEnabled()) return <MemberShell title="Clippers" home={home}><section className="rounded-3xl border border-violet-400/25 p-6"><h2 className="text-2xl font-bold">Clippers is coming soon.</h2><p className="mt-4 text-sm leading-7 text-neutral-400">App teams will be able to hire creators for short videos about their apps, and creators get paid once the video is live. We&apos;re finishing setup now.</p></section></MemberShell>;
  const member = await clipMember();
  const developer = member.role === "DEVELOPER";
  const params = await searchParams;
  const { social } = params;
  if (member.role === "ADMIN") {
    const review = params.review === "APPROVED" || params.review === "SUSPENDED" ? params.review : "PENDING_REVIEW";
    const reviewPage = z.coerce.number().int().min(1).max(10000).safeParse(params.page || "1");
    if (!reviewPage.success) return <MemberShell title="Clippers review" home={home}><p role="alert">Invalid review page. <Link href="/clippers">Return to the review queue.</Link></p></MemberShell>;
    const [profiles, count] = await Promise.all([
      prisma.clipProfile.findMany({ where: { status: review }, take: 25, skip: (reviewPage.data - 1) * 25, orderBy: [{ submittedAt: "asc" }, { userId: "asc" }], include: { user: { select: { username: true, emailVerified: true, clipEngagements: { where: { status: { in: ["ACCEPTED", "FUNDING", "FUNDED", "DRAFT_SUBMITTED", "CHANGES_REQUESTED", "DRAFT_APPROVED", "PROOF_SUBMITTED", "VERIFIED", "PAYMENT_PENDING", "DISPUTED"] } }, take: 10, orderBy: { updatedAt: "desc" }, select: { id: true, status: true, campaignId: true, campaign: { select: { title: true } } } } } } } }),
      prisma.clipProfile.count({ where: { status: review } }),
    ]);
    const disputes = await prisma.clipEngagement.findMany({ where: { OR: [{ status: { in: ["DISPUTED", "PAYMENT_PENDING", "CANCEL_PENDING"] } }, { disputeOpenedBy: "STRIPE" }, { status: { in: ["DRAFT_SUBMITTED", "PROOF_SUBMITTED", "VERIFIED"] }, reviewDueAt: { lt: new Date() } }, { status: { in: ["FUNDED", "CHANGES_REQUESTED"] }, dueAt: { lt: new Date() } }, { status: "DRAFT_APPROVED", publishDueAt: { lt: new Date() } }] }, take: 100, orderBy: { updatedAt: "desc" }, include: { campaign: { select: { id: true, title: true } }, creator: { select: { username: true } } } });
    return <MemberShell title="Clippers / administrator review" home={home} wide>
      <nav aria-label="Creator review filters" className="mb-5 flex flex-wrap gap-3">{(["PENDING_REVIEW", "APPROVED", "SUSPENDED"] as const).map((item) => <Link key={item} href={`/clippers?review=${item}`} aria-current={review === item ? "page" : undefined} className="min-h-11 rounded-xl border border-stroke px-4 py-3 text-sm">{item === "PENDING_REVIEW" ? "Creator applications" : item === "APPROVED" ? "Approved marketplace" : "Suspended profiles"}</Link>)}</nav>
      <ClipperAdminReview profiles={profiles.map((profile) => ({ ...profileView(profile), userId: profile.userId, username: profile.user.username, emailVerified: Boolean(profile.user.emailVerified), submittedAt: profile.submittedAt?.toISOString() || null, agreements: profile.user.clipEngagements }))} />
      <nav aria-label="Profile review pages" className="my-5 flex justify-between gap-3">{reviewPage.data > 1 ? <Link href={`/clippers?review=${review}&page=${reviewPage.data - 1}`} className="min-h-11 p-3 text-sm">Previous reviews</Link> : <span />}{reviewPage.data * 25 < count ? <Link href={`/clippers?review=${review}&page=${reviewPage.data + 1}`} className="min-h-11 p-3 text-sm">Next reviews</Link> : null}</nav>
      <section className="mt-10"><h2 className="mb-4 text-xl font-bold">Disputes & payment reconciliation</h2><p className="mb-5 text-sm leading-6 text-neutral-400">Review each party&apos;s evidence before resuming or refunding. Resolve Stripe charge disputes in Stripe before resuming contracts. Never release a duplicate transfer. Showing the latest 100 cases.</p>{disputes.map((item) => <Link key={item.id} href={`/clippers/${item.campaign.id}?agreement=${item.id}`} className="mb-3 block rounded-xl border border-stroke p-4 text-sm">{item.campaign.title} / {item.creator.username} / {item.status}</Link>)}{!disputes.length ? <p className="text-sm text-neutral-400">No agreements require review.</p> : null}</section>
    </MemberShell>;
  }
  const filters = filtersSchema.safeParse(params);
  if (!filters.success) return <MemberShell title="Clippers" home={home}><p role="alert">Invalid marketplace filters. <Link href="/clippers" className="underline">Reset filters.</Link></p></MemberShell>;
  const { q, genre, platform } = filters.data;
  const profileWhere: Prisma.ClipProfileWhereInput = {
    status: "APPROVED", available: true, ...(developer ? { userId: { not: member.id } } : {}),
    user: { role: { not: "ADMIN" }, OR: [{ role: "TESTER" }, { testerWorkspaceEnabled: true }], emailVerified: { not: null } },
    AND: [
      ...(genre ? [{ genres: { has: genre } }] : []),
      ...(q ? [{ OR: [{ bio: { contains: q, mode: "insensitive" as const } }, { specialties: { contains: q, mode: "insensitive" as const } }, { user: { username: { contains: q, mode: "insensitive" as const } } }] }] : []),
      ...(platform ? [{ OR: [{ [platform === "TIKTOK" ? "tiktokUrl" : platform === "INSTAGRAM" ? "instagramUrl" : "youtubeUrl"]: { not: null } }, { socialUrl: { contains: platform === "TIKTOK" ? "tiktok.com/" : platform === "INSTAGRAM" ? "instagram.com/" : "youtube.com/" } }] }] : []),
    ],
  };
  const campaignWhere: Prisma.ClipCampaignWhereInput = developer ? { developerId: member.id } : { open: true };
  const agreementWhere: Prisma.ClipEngagementWhereInput = developer ? { campaign: { developerId: member.id } } : { creatorId: member.id };
  const [total, campaignTotal, workTotal] = await Promise.all([
    prisma.clipProfile.count({ where: profileWhere }),
    prisma.clipCampaign.count({ where: campaignWhere }),
    prisma.clipEngagement.count({ where: agreementWhere }),
  ]);
  const page = Math.min(filters.data.page, Math.max(1, Math.ceil(total / 12)));
  const campaignPage = Math.min(filters.data.campaignPage, Math.max(1, Math.ceil(campaignTotal / 50)));
  const workPage = Math.min(filters.data.workPage, Math.max(1, Math.ceil(workTotal / 50)));
  const [profile, campaigns, agreements, socialAccount] = await Promise.all([
    prisma.clipProfile.findUnique({ where: { userId: member.id } }),
    prisma.clipCampaign.findMany({ where: campaignWhere, take: 50, skip: (campaignPage - 1) * 50, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { developer: { select: { username: true } } } }),
    prisma.clipEngagement.findMany({ where: agreementWhere, take: 50, skip: (workPage - 1) * 50, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], select: { id: true, status: true, feeCents: true, creator: { select: { username: true } }, campaign: { select: { id: true, title: true } } } }),
    prisma.clipSocialAccount.findUnique({ where: { userId_provider: { userId: member.id, provider: "TIKTOK" } }, select: { displayName: true } }),
  ]);
  const creators = await prisma.clipProfile.findMany({ where: profileWhere, skip: (page - 1) * 12, take: 12, orderBy: [{ reviewedAt: "desc" }, { userId: "asc" }], include: { user: { select: { username: true, xpPoints: true, clipSocialAccounts: { where: { provider: "TIKTOK", refreshExpiresAt: { gt: new Date() } }, select: { displayName: true } }, clipEngagements: { where: { campaign: { developerId: member.id }, campaignId: { in: developer ? campaigns.map((campaign) => campaign.id) : [] } }, select: { campaignId: true } }, _count: { select: { clipEngagements: { where: { status: "PAID" } } } } } } } });
  const marketplace = <ClipperMarketplace developer={developer} campaigns={developer ? campaigns : []} creators={creators.map((creator) => ({ ...clipProfileSchema.parse({ ...creator, tiktokUrl: creator.tiktokUrl || "", instagramUrl: creator.instagramUrl || "", youtubeUrl: creator.youtubeUrl || "" }), userId: creator.userId, username: creator.user.username, reputation: creator.user.xpPoints, completedCollaborations: creator.user._count.clipEngagements, socialName: creator.user.clipSocialAccounts[0]?.displayName || null, existingCampaignIds: creator.user.clipEngagements.map((item) => item.campaignId) }))} query={q} genre={genre} platform={platform} page={page} total={total} />;
  return <MemberShell title="Clippers" home={home} wide><ClipperWorkspace developer={developer} profile={profile ? profileView(profile) : null} emailVerified={Boolean(member.emailVerified)} marketplace={marketplace} campaigns={campaigns} agreements={agreements} campaignPage={campaignPage} campaignTotal={campaignTotal} workPage={workPage} workTotal={workTotal} pageQuery={new URLSearchParams({ q, genre, platform, page: String(page) }).toString()} socialName={socialAccount?.displayName || null} tikTokEnabled={tikTokConfigured()} socialStatus={social} platformFeeWaived={member.platformFeeWaived} /><p className="mt-6 text-xs text-neutral-500">Creator fees are separate from tester mission payouts and grant no automatic REP or Quest XP.</p></MemberShell>;
}
