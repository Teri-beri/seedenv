import { getServerSession } from "next-auth";
import type { ClipProfile, Prisma } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { MemberShell } from "@/components/member-shell";
import { ClipperRoom } from "@/components/clipper-room";
import { clipMember, clippersEnabled } from "@/lib/clippers";
import { clipStorageConfigured } from "@/lib/clipper-storage";
import { tikTokConfigured } from "@/lib/clipper-tiktok";
import { clipEligibility, clipProfileSchema, roomStatuses } from "@/lib/clipper-rules";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function creatorBackground(profile: ClipProfile | null) {
  return profile ? { bio: profile.bio, specialties: profile.specialties, genres: profile.genres, portfolioUrl: profile.portfolioUrl, socialUrl: profile.socialUrl, tiktokUrl: profile.tiktokUrl, instagramUrl: profile.instagramUrl, youtubeUrl: profile.youtubeUrl } : null;
}

export default async function ClipRoomPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ before?: string; agreement?: string }> }) {
  if (!await getServerSession(authOptions)) redirect("/auth/signin?callbackUrl=/clippers");
  if (!clippersEnabled()) redirect("/clippers");
  const member = await clipMember();
  const { id } = await params;
  const { before, agreement: agreementId } = await searchParams;
  const campaign = await prisma.clipCampaign.findUnique({ where: { id }, include: { developer: { select: { username: true } } } });
  if (!campaign) notFound();
  const developer = campaign.developerId === member.id;
  const admin = member.role === "ADMIN";
  const agreementInclude = {
    creator: { select: { username: true, xpPoints: true, emailVerified: true, stripeConnectAccountId: true, clipProfile: true, clipSocialAccounts: { where: { provider: "TIKTOK", refreshExpiresAt: { gt: new Date() } }, select: { displayName: true } } } },
    assets: { where: { ready: true }, select: { id: true, name: true, kind: true, createdAt: true }, orderBy: { createdAt: "desc" as const }, take: 100 },
  } satisfies Prisma.ClipEngagementInclude;
  const agreements = await prisma.clipEngagement.findMany({
    where: { campaignId: id, ...(developer || admin ? {} : { creatorId: member.id }) }, take: 100, orderBy: { createdAt: "desc" },
    include: agreementInclude,
  });
  if (agreementId && !agreements.some((item) => item.id === agreementId)) {
    const requested = await prisma.clipEngagement.findFirst({ where: { id: agreementId, campaignId: id, ...(developer || admin ? {} : { creatorId: member.id }) }, include: agreementInclude });
    if (!requested) notFound();
    agreements.unshift(requested);
  }
  if (!campaign.open && !developer && !admin && !agreements.length) notFound();
  const selected = agreements.find((item) => item.id === agreementId) || agreements.find((item) => roomStatuses.includes(item.status)) || agreements[0];
  const roomAccess = developer || admin || agreements.some((item) => roomStatuses.includes(item.status));
  const conversationId = selected && roomStatuses.includes(selected.status) ? selected.id : null;
  if (before && (!conversationId || !await prisma.clipMessage.findFirst({ where: { id: before, campaignId: id, engagementId: conversationId }, select: { id: true } }))) notFound();
  const [messages, assets, legacyMessages, ownProfile] = await Promise.all([
    conversationId ? prisma.clipMessage.findMany({ where: { campaignId: id, engagementId: conversationId }, ...(before ? { cursor: { id: before }, skip: 1 } : {}), take: 51, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, body: true, createdAt: true, author: { select: { username: true } } } }) : [],
    roomAccess ?
    prisma.clipAsset.findMany({ where: { campaignId: id, kind: "BRIEF", ready: true }, take: 100, orderBy: { createdAt: "desc" }, select: { id: true, name: true } }) : [],
    developer || admin ? prisma.clipMessage.findMany({ where: { campaignId: id, engagementId: null }, take: 100, orderBy: { createdAt: "asc" }, select: { id: true, body: true, author: { select: { username: true } } } }) : [],
    !developer && !admin ? prisma.clipProfile.findUnique({ where: { userId: member.id } }) : null,
  ]);
  const applicationReason = developer || admin ? null : member.role !== "TESTER" ? "Switch to your tester workspace to apply as a creator." : clipEligibility(member, ownProfile, campaign);
  const shownMessages = messages.slice(0, 50);
  return <MemberShell title="Clippers / campaign studio" back="/clippers" home={member.role === "ADMIN" ? "/admin" : member.role === "DEVELOPER" ? "/console" : "/dashboard"} wide><ClipperRoom campaign={campaign} viewerId={member.id} developer={developer} admin={admin} workspaceReady={admin || (developer ? member.role === "DEVELOPER" : member.role === "TESTER")} roomAccess={roomAccess} conversationId={conversationId} applicationReason={applicationReason} storageEnabled={clipStorageConfigured()} tikTokEnabled={tikTokConfigured()} agreements={agreements.map((item) => ({
    id: item.id, creatorId: item.creatorId, status: item.status, note: item.note, feeCents: item.feeCents, chargeCents: item.chargeCents, revisionCount: item.revisionCount, reviewNote: item.reviewNote,
    dueAt: item.dueAt?.toISOString() || null, reviewDueAt: item.reviewDueAt?.toISOString() || null, publishDueAt: item.publishDueAt?.toISOString() || null,
    fundedAt: item.fundedAt?.toISOString() || null, paidAt: item.paidAt?.toISOString() || null, licenseEndsAt: item.licenseEndsAt?.toISOString() || null,
    draftId: item.draftId, approvedDraftId: item.approvedDraftId, proofId: item.proofId, publicationUrl: item.publicationUrl, publicationCode: item.publicationCode, verificationMethod: item.verificationMethod, disputeReason: item.disputeReason, moderationNote: item.moderationNote,
    termsAcceptedAt: item.termsAcceptedAt?.toISOString() || null, invitationNote: item.invitationNote, invitationExpiresAt: item.invitationExpiresAt?.toISOString() || null,
    eligibilityReason: clipEligibility(item.creator, item.creator.clipProfile, campaign),
    fundingBlockReason: clipEligibility(item.creator, item.creator.clipProfile, campaign) || (!item.creator.stripeConnectAccountId ? "The creator must link their Stripe payout account in Account before you can fund this agreement." : null), profileFromApplication: Boolean(item.profileSnapshot),
    creator: { username: item.creator.username, xpPoints: item.creator.xpPoints, clipSocialAccounts: item.creator.clipSocialAccounts, clipProfile: item.profileSnapshot ? clipProfileSchema.parse(item.profileSnapshot) : creatorBackground(item.creator.clipProfile) },
    assets: item.assets.map((asset) => ({ ...asset, createdAt: asset.createdAt.toISOString() })),
  }))} messages={shownMessages.reverse().map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))} briefAssets={assets} members={selected ? [campaign.developer.username, selected.creator.username] : [campaign.developer.username]} olderCursor={messages.length > 50 ? messages[49].id : null} />
    {legacyMessages.length ? <details className="mt-6 rounded-xl border border-stroke p-5"><summary className="cursor-pointer text-sm">Archived campaign group messages (owner/admin only)</summary><p className="mt-3 text-xs text-neutral-500">These predate private creator conversations and are retained as read-only records. Showing up to 100 archived messages.</p>{legacyMessages.map((message) => <p key={message.id} className="mt-3 whitespace-pre-wrap break-words text-sm text-neutral-400">{message.author.username}: {message.body}</p>)}</details> : null}
  </MemberShell>;
}
