import type { ClipProfile, Prisma } from "@prisma/client";
import { z } from "zod";
import { assertClipTransition, clipChargeCents, clipEligibility, clipProfileSchema, clipSocialLinks, clipTermsVersion, draftStatuses, fundedStatuses, publicationIdentity, roomStatuses, type ClipProfileInput } from "@/lib/clipper-rules";

export async function saveCreatorProfile(tx: Prisma.TransactionClient, userId: string, input: ClipProfileInput, expectedRevision: number | null) {
  const data = clipProfileSchema.parse(input);
  const previous = await tx.clipProfile.findUnique({ where: { userId } });
  if ((previous?.revision ?? null) !== expectedRevision) throw new Error("Your profile changed in another tab. Refresh before saving so newer edits are not overwritten.");
  if (previous?.status === "SUSPENDED") throw new Error("Contact SeedEnv about your suspended profile before making changes.");
  const fields = { ...data, tiktokUrl: data.tiktokUrl || null, instagramUrl: data.instagramUrl || null, youtubeUrl: data.youtubeUrl || null };
  if (previous && previous.bio === fields.bio && previous.portfolioUrl === fields.portfolioUrl && previous.socialUrl === fields.socialUrl && previous.specialties === fields.specialties && JSON.stringify(previous.genres) === JSON.stringify(fields.genres) && previous.tiktokUrl === fields.tiktokUrl && previous.instagramUrl === fields.instagramUrl && previous.youtubeUrl === fields.youtubeUrl) return previous;
  return tx.clipProfile.upsert({ where: { userId }, create: { userId, ...fields }, update: { ...fields, status: "DRAFT", revision: { increment: 1 }, submittedAt: null, reviewedAt: null, reviewedById: null, reviewNote: null } });
}

export async function submitCreatorProfile(tx: Prisma.TransactionClient, userId: string, expectedRevision: number) {
  const [user, profile] = await Promise.all([tx.user.findUniqueOrThrow({ where: { id: userId } }), tx.clipProfile.findUnique({ where: { userId } })]);
  if (user.role !== "TESTER" || !user.emailVerified) throw new Error("Switch to your tester workspace and verify your email before applying.");
  if (!profile || !["DRAFT", "REJECTED"].includes(profile.status)) throw new Error("Save a complete creator profile before submitting it for review.");
  if (profile.revision !== expectedRevision) throw new Error("Your profile changed. Refresh and submit the current version.");
  clipProfileSchema.parse({ ...profile, tiktokUrl: profile.tiktokUrl || "", instagramUrl: profile.instagramUrl || "", youtubeUrl: profile.youtubeUrl || "" });
  return tx.clipProfile.update({ where: { userId }, data: { status: "PENDING_REVIEW", submittedAt: new Date(), reviewedAt: null, reviewedById: null } });
}

export async function reviewCreatorProfile(tx: Prisma.TransactionClient, adminId: string, userId: string, revision: number, decision: "APPROVED" | "REJECTED" | "SUSPENDED", note: string) {
  const admin = await tx.user.findUniqueOrThrow({ where: { id: adminId } });
  if (admin.role !== "ADMIN") throw new Error("Only SeedEnv administrators can review creator profiles.");
  const profile = await tx.clipProfile.findUnique({ where: { userId }, include: { user: { select: { emailVerified: true } } } });
  if (!profile || profile.revision !== revision) throw new Error("This profile changed since you opened it. Refresh and review the current version.");
  const allowed = decision === "SUSPENDED" ? ["APPROVED"] : decision === "REJECTED" ? ["PENDING_REVIEW", "SUSPENDED"] : ["PENDING_REVIEW"];
  if (!allowed.includes(profile.status)) throw new Error("This profile is not in the expected review state. Refresh the queue.");
  if (decision === "APPROVED") {
    if (!profile.user.emailVerified) throw new Error("The creator must verify their email before marketplace approval.");
    clipProfileSchema.parse({ ...profile, tiktokUrl: profile.tiktokUrl || "", instagramUrl: profile.instagramUrl || "", youtubeUrl: profile.youtubeUrl || "" });
  }
  return tx.clipProfile.update({ where: { userId }, data: { status: decision, reviewNote: z.string().trim().min(12).max(1500).parse(note), reviewedAt: new Date(), reviewedById: adminId } });
}

function profileSnapshot(profile: ClipProfile) {
  return { bio: profile.bio, specialties: profile.specialties, genres: profile.genres, portfolioUrl: profile.portfolioUrl, socialUrl: profile.socialUrl, tiktokUrl: profile.tiktokUrl || "", instagramUrl: profile.instagramUrl || "", youtubeUrl: profile.youtubeUrl || "", revision: profile.revision };
}

export async function requireClipConversation(tx: Prisma.TransactionClient, campaignId: string, engagementId: string, userId: string, role: string) {
  const item = await tx.clipEngagement.findUnique({ where: { id: engagementId }, include: { campaign: true } });
  if (!item || item.campaignId !== campaignId || (role !== "ADMIN" && item.creatorId !== userId && item.campaign.developerId !== userId)) throw new Error("This private creator conversation is not available to you.");
  assertClipTransition(item.status, roomStatuses);
  return item;
}

export async function requireClipRoom(tx: Prisma.TransactionClient, campaignId: string, userId: string, role: string) {
  const campaign = await tx.clipCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Clipper campaign not found.");
  if (campaign.developerId === userId || role === "ADMIN") return campaign;
  const engagement = await tx.clipEngagement.findUnique({ where: { campaignId_creatorId: { campaignId, creatorId: userId } } });
  if (!engagement || !roomStatuses.includes(engagement.status)) throw new Error("Only invited creators can enter this campaign room.");
  return campaign;
}

export async function applyClip(tx: Prisma.TransactionClient, creatorId: string, campaignId: string, note: string) {
  const text = z.string().trim().min(20).max(1500).parse(note);
  const [campaign, creator, profile, previous] = await Promise.all([
    tx.clipCampaign.findUnique({ where: { id: campaignId } }),
    tx.user.findUniqueOrThrow({ where: { id: creatorId } }),
    tx.clipProfile.findUnique({ where: { userId: creatorId } }),
    tx.clipEngagement.findUnique({ where: { campaignId_creatorId: { campaignId, creatorId } } }),
  ]);
  if (!campaign?.open) throw new Error("This Clippers campaign is not accepting applications.");
  if (campaign.developerId === creatorId) throw new Error("You cannot apply to your own campaign.");
  if (creator.role !== "TESTER") throw new Error("Switch to your tester workspace before applying as a creator.");
  const reason = clipEligibility(creator, profile, campaign);
  if (reason || !profile) throw new Error(reason || "Complete your creator profile first.");
  if (previous) throw new Error("You already applied. Use the existing agreement or contact the developer.");
  if (await tx.clipEngagement.count({ where: { creatorId, createdAt: { gte: new Date(Date.now() - 86400000) } } }) >= 10) throw new Error("You can apply to up to ten Clippers campaigns per day.");
  const developer = await tx.user.findUniqueOrThrow({ where: { id: campaign.developerId }, select: { platformFeeWaived: true } });
  return tx.clipEngagement.create({ data: { campaignId, creatorId, note: text, feeCents: campaign.feeCents, chargeCents: clipChargeCents(campaign.feeCents, developer.platformFeeWaived), termsVersion: clipTermsVersion, termsAcceptedAt: new Date(), profileSnapshot: profileSnapshot(profile) } });
}

export async function inviteClipCreator(tx: Prisma.TransactionClient, developerId: string, creatorId: string, campaignId: string, note: string) {
  const text = z.string().trim().min(20).max(1500).parse(note);
  const [campaign, developer, creator, profile, previous] = await Promise.all([
    tx.clipCampaign.findUnique({ where: { id: campaignId } }),
    tx.user.findUniqueOrThrow({ where: { id: developerId } }),
    tx.user.findUniqueOrThrow({ where: { id: creatorId } }),
    tx.clipProfile.findUnique({ where: { userId: creatorId } }),
    tx.clipEngagement.findUnique({ where: { campaignId_creatorId: { campaignId, creatorId } } }),
  ]);
  if (!campaign || campaign.developerId !== developerId || developer.role !== "DEVELOPER") throw new Error("Choose a campaign from your developer workspace.");
  if (creatorId === developerId) throw new Error("You cannot invite yourself.");
  if (creator.role === "ADMIN" || (!creator.testerWorkspaceEnabled && creator.role !== "TESTER")) throw new Error("This creator does not have an active tester workspace.");
  const reason = clipEligibility(creator, profile, campaign);
  if (reason) throw new Error(reason);
  if (!profile?.available) throw new Error("This creator has paused new marketplace invitations. Existing agreements are unchanged.");
  if (previous) throw new Error("This creator already has an application or invitation for that campaign. Open the existing agreement.");
  if (await tx.clipEngagement.count({ where: { campaign: { developerId }, invitedAt: { gte: new Date(Date.now() - 86400000) } } }) >= 20) throw new Error("You can send up to twenty creator invitations per day.");
  return tx.clipEngagement.create({ data: { campaignId, creatorId, note: "", invitationNote: text, invitedAt: new Date(), invitationExpiresAt: new Date(Date.now() + 7 * 86400000), status: "INVITED", feeCents: campaign.feeCents, chargeCents: clipChargeCents(campaign.feeCents, developer.platformFeeWaived), termsVersion: clipTermsVersion } });
}

export async function respondClipInvitation(tx: Prisma.TransactionClient, creatorId: string, id: string, accept: boolean, note: string) {
  const item = await tx.clipEngagement.findUnique({ where: { id }, include: { campaign: true } });
  if (!item || item.creatorId !== creatorId) throw new Error("Creator invitation not found.");
  assertClipTransition(item.status, ["INVITED"]);
  if (accept) {
    if (!item.invitationExpiresAt || item.invitationExpiresAt <= new Date()) throw new Error("This invitation expired. Ask the developer to contact SeedEnv if a new agreement is needed.");
    const [creator, profile] = await Promise.all([tx.user.findUniqueOrThrow({ where: { id: creatorId } }), tx.clipProfile.findUnique({ where: { userId: creatorId } })]);
    if (creator.role !== "TESTER") throw new Error("Switch to your tester workspace to accept this invitation.");
    const reason = clipEligibility(creator, profile, item.campaign);
    if (reason || !profile) throw new Error(reason || "Complete your creator profile first.");
    return tx.clipEngagement.update({ where: { id }, data: { status: "ACCEPTED", termsAcceptedAt: new Date(), note: z.string().trim().min(20).max(1500).parse(note), profileSnapshot: profileSnapshot(profile) } });
  }
  return tx.clipEngagement.update({ where: { id }, data: { status: "INVITATION_DECLINED" } });
}

export async function reviewClipApplication(tx: Prisma.TransactionClient, developerId: string, id: string, accept: boolean) {
  const item = await tx.clipEngagement.findUnique({ where: { id }, include: { campaign: true } });
  if (!item || item.campaign.developerId !== developerId) throw new Error("Application not found for your campaign.");
  assertClipTransition(item.status, ["APPLIED"]);
  if (accept) {
    if (!item.termsAcceptedAt) throw new Error("Creator acceptance of the campaign terms is required.");
    const [creator, profile] = await Promise.all([tx.user.findUniqueOrThrow({ where: { id: item.creatorId } }), tx.clipProfile.findUnique({ where: { userId: item.creatorId } })]);
    const reason = clipEligibility(creator, profile, item.campaign);
    if (reason) throw new Error(reason);
  }
  await tx.clipEngagement.update({ where: { id }, data: { status: accept ? "ACCEPTED" : "DECLINED" } });
}

export async function submitClipDraft(tx: Prisma.TransactionClient, creatorId: string, id: string, assetId: string) {
  const item = await tx.clipEngagement.findUnique({ where: { id } });
  if (!item || item.creatorId !== creatorId) throw new Error("Creator agreement not found.");
  assertClipTransition(item.status, draftStatuses);
  const asset = await tx.clipAsset.findUnique({ where: { id: assetId } });
  if (!asset || !asset.ready || asset.engagementId !== id || asset.ownerId !== creatorId || asset.kind !== "DRAFT" || !asset.mimeType.startsWith("video/")) throw new Error("Upload a completed video draft to this agreement first.");
  if (asset.createdAt <= (item.fundedAt || item.createdAt)) throw new Error("Use a new draft uploaded after funding.");
  if (assetId === item.draftId) throw new Error("Upload a new version for this revision.");
  await tx.clipEngagement.update({ where: { id }, data: { status: "DRAFT_SUBMITTED", draftId: assetId, reviewNote: null, reviewDueAt: new Date(Date.now() + 72 * 3600000) } });
}

export async function reviewClipDraft(tx: Prisma.TransactionClient, developerId: string, id: string, approve: boolean, note: string) {
  const item = await tx.clipEngagement.findUnique({ where: { id }, include: { campaign: true } });
  if (!item || item.campaign.developerId !== developerId) throw new Error("Agreement not found for your campaign.");
  assertClipTransition(item.status, ["DRAFT_SUBMITTED"]);
  if (!item.draftId) throw new Error("A submitted draft is required.");
  if (!approve && item.revisionCount >= item.campaign.revisionLimit) throw new Error("The agreed revision limit is reached. Approve the draft or open a dispute; extra work needs a separate agreement.");
  const reviewNote = approve ? z.string().trim().max(1500).parse(note) : z.string().trim().min(12).max(1500).parse(note);
  await tx.clipEngagement.update({ where: { id }, data: approve ? { status: "DRAFT_APPROVED", approvedDraftId: item.draftId, approvedAt: new Date(), publishDueAt: new Date(Date.now() + 7 * 86400000), reviewDueAt: null, reviewNote } : { status: "CHANGES_REQUESTED", revisionCount: { increment: 1 }, dueAt: new Date(Date.now() + 3 * 86400000), reviewDueAt: null, reviewNote } });
}

export async function submitClipPublication(tx: Prisma.TransactionClient, creatorId: string, id: string, url: string, proofId: string) {
  const item = await tx.clipEngagement.findUnique({ where: { id }, include: { campaign: true } });
  if (!item || item.creatorId !== creatorId) throw new Error("Creator agreement not found.");
  assertClipTransition(item.status, ["DRAFT_APPROVED", "PROOF_SUBMITTED"]);
  if (!item.approvedDraftId) throw new Error("Get draft approval before publishing.");
  const publication = publicationIdentity(url, item.campaign.platform);
  if (item.campaign.platform === "TIKTOK" && item.profileSnapshot) {
    const profile = clipProfileSchema.parse(item.profileSnapshot);
    const account = clipSocialLinks(profile).find((link) => link.platform === "TIKTOK");
    if (!account || new URL(account.url).pathname.toLowerCase() !== `/${new URL(publication.url).pathname.split("/")[1]}`.toLowerCase()) throw new Error("Publish from the TikTok account in your accepted creator profile. Contact SeedEnv if that account was renamed.");
  }
  const duplicate = await tx.clipEngagement.findFirst({ where: { campaign: { platform: item.campaign.platform }, publicationId: publication.id, id: { not: id } } });
  if (duplicate) throw new Error("This social post is already attached to another Clippers agreement.");
  const proof = await tx.clipAsset.findUnique({ where: { id: proofId } });
  if (!proof?.ready || proof.ownerId !== creatorId || proof.engagementId !== id || proof.kind !== "PROOF") throw new Error("Upload a publication evidence screenshot first.");
  await tx.clipEngagement.update({ where: { id }, data: { status: "PROOF_SUBMITTED", publicationUrl: publication.url, publicationId: publication.id, proofId, verifiedAt: null, verificationMethod: null, reviewDueAt: new Date(Date.now() + 72 * 3600000) } });
}

export async function verifyClipManually(tx: Prisma.TransactionClient, developerId: string, id: string, note: string) {
  const item = await tx.clipEngagement.findUnique({ where: { id }, include: { campaign: true } });
  if (!item || item.campaign.developerId !== developerId) throw new Error("Agreement not found for your campaign.");
  assertClipTransition(item.status, ["PROOF_SUBMITTED"]);
  const reviewNote = z.string().trim().min(20).max(1500).parse(note);
  if (!item.publicationUrl || !item.proofId || !item.approvedDraftId) throw new Error("Publication and approved draft evidence are required.");
  await tx.clipEngagement.update({ where: { id }, data: { status: "VERIFIED", verificationMethod: "DEVELOPER_MANUAL", verifiedAt: new Date(), reviewNote } });
}

export async function disputeClip(tx: Prisma.TransactionClient, userId: string, id: string, reason: string) {
  const item = await tx.clipEngagement.findUnique({ where: { id }, include: { campaign: true } });
  if (!item) throw new Error("Agreement not found.");
  if (item.creatorId !== userId && item.campaign.developerId !== userId && (await tx.user.findUnique({ where: { id: userId }, select: { role: true } }))?.role !== "ADMIN") throw new Error("Agreement not found.");
  assertClipTransition(item.status, [...fundedStatuses.filter((status) => status !== "DISPUTED"), "PAID"]);
  await tx.clipEngagement.update({ where: { id }, data: { status: "DISPUTED", statusBeforeDispute: item.status, disputeReason: z.string().trim().min(20).max(1500).parse(reason), disputeOpenedBy: userId } });
}
