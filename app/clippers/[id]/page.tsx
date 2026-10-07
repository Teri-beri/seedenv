import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { MemberShell } from "@/components/member-shell";
import { ClipperRoom } from "@/components/clipper-room";
import { clipMember, clippersEnabled } from "@/lib/clippers";
import { clipStorageConfigured } from "@/lib/clipper-storage";
import { tikTokConfigured } from "@/lib/clipper-tiktok";
import { roomStatuses } from "@/lib/clipper-rules";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClipRoomPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ before?: string }> }) {
  if (!await getServerSession(authOptions)) redirect("/auth/signin?callbackUrl=/clippers");
  if (!clippersEnabled()) redirect("/clippers");
  const member = await clipMember();
  const { id } = await params;
  const { before } = await searchParams;
  const campaign = await prisma.clipCampaign.findUnique({ where: { id }, include: { developer: { select: { username: true } } } });
  if (!campaign) notFound();
  const developer = campaign.developerId === member.id;
  const admin = member.role === "ADMIN";
  const agreements = await prisma.clipEngagement.findMany({
    where: { campaignId: id, ...(developer || admin ? {} : { creatorId: member.id }) }, take: 100, orderBy: { createdAt: "desc" },
    include: {
      creator: { select: { username: true, xpPoints: true, clipProfile: { select: { bio: true, specialties: true, socialUrl: true, portfolioUrl: true } }, clipSocialAccounts: { where: { provider: "TIKTOK" }, select: { displayName: true } } } },
      assets: { where: { ready: true }, select: { id: true, name: true, kind: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!campaign.open && !developer && !admin && !agreements.length) notFound();
  const roomAccess = developer || admin || agreements.some((item) => roomStatuses.includes(item.status));
  if (before && roomAccess && !await prisma.clipMessage.findFirst({ where: { id: before, campaignId: id }, select: { id: true } })) notFound();
  const [messages, assets, members] = roomAccess ? await Promise.all([
    prisma.clipMessage.findMany({ where: { campaignId: id }, ...(before ? { cursor: { id: before }, skip: 1 } : {}), take: 51, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, body: true, createdAt: true, author: { select: { username: true } } } }),
    prisma.clipAsset.findMany({ where: { campaignId: id, kind: "BRIEF", ready: true }, take: 100, orderBy: { createdAt: "desc" }, select: { id: true, name: true } }),
    prisma.clipEngagement.findMany({ where: { campaignId: id, status: { in: [...roomStatuses] } }, take: 100, select: { creator: { select: { username: true } } } }),
  ]) : [[], [], []];
  const shownMessages = messages.slice(0, 50);
  return <MemberShell title="Clippers / campaign studio" back="/clippers" home={member.role === "ADMIN" ? "/admin" : member.role === "DEVELOPER" ? "/console" : "/dashboard"}><ClipperRoom campaign={campaign} viewerId={member.id} developer={developer} admin={admin} roomAccess={roomAccess} storageEnabled={clipStorageConfigured()} tikTokEnabled={tikTokConfigured()} agreements={agreements.map((item) => ({
    id: item.id, creatorId: item.creatorId, status: item.status, note: item.note, feeCents: item.feeCents, chargeCents: item.chargeCents, revisionCount: item.revisionCount, reviewNote: item.reviewNote,
    dueAt: item.dueAt?.toISOString() || null, reviewDueAt: item.reviewDueAt?.toISOString() || null, publishDueAt: item.publishDueAt?.toISOString() || null,
    fundedAt: item.fundedAt?.toISOString() || null, paidAt: item.paidAt?.toISOString() || null, licenseEndsAt: item.licenseEndsAt?.toISOString() || null,
    draftId: item.draftId, approvedDraftId: item.approvedDraftId, proofId: item.proofId, publicationUrl: item.publicationUrl, publicationCode: item.publicationCode, verificationMethod: item.verificationMethod, disputeReason: item.disputeReason, moderationNote: item.moderationNote,
    termsAcceptedAt: item.termsAcceptedAt.toISOString(), creator: item.creator, assets: item.assets.map((asset) => ({ ...asset, createdAt: asset.createdAt.toISOString() })),
  }))} messages={shownMessages.reverse().map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }))} briefAssets={assets} members={[campaign.developer.username, ...members.map((item) => item.creator.username)]} olderCursor={messages.length > 50 ? messages[49].id : null} /></MemberShell>;
}
