import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { assertClipTransition, clipChargeCents, clipTermsVersion, draftStatuses, fundedStatuses, publicationIdentity, roomStatuses } from "@/lib/clipper-rules";

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
  if (!creator.emailVerified) throw new Error("Verify your email before applying as a creator.");
  if (!profile) throw new Error("Complete your creator profile first.");
  if (creator.xpPoints < campaign.minimumRep) throw new Error(`This campaign requires ${campaign.minimumRep} REP. Discovery Passes do not apply to creator contracts.`);
  if (previous) throw new Error("You already applied. Use the existing agreement or contact the developer.");
  if (await tx.clipEngagement.count({ where: { creatorId, createdAt: { gte: new Date(Date.now() - 86400000) } } }) >= 10) throw new Error("You can apply to up to ten Clippers campaigns per day.");
  const developer = await tx.user.findUniqueOrThrow({ where: { id: campaign.developerId }, select: { platformFeeWaived: true } });
  return tx.clipEngagement.create({ data: { campaignId, creatorId, note: text, feeCents: campaign.feeCents, chargeCents: clipChargeCents(campaign.feeCents, developer.platformFeeWaived), termsVersion: clipTermsVersion, termsAcceptedAt: new Date() } });
}

export async function reviewClipApplication(tx: Prisma.TransactionClient, developerId: string, id: string, accept: boolean) {
  const item = await tx.clipEngagement.findUnique({ where: { id }, include: { campaign: true } });
  if (!item || item.campaign.developerId !== developerId) throw new Error("Application not found for your campaign.");
  assertClipTransition(item.status, ["APPLIED"]);
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
  if (!item || (item.creatorId !== userId && item.campaign.developerId !== userId)) throw new Error("Agreement not found.");
  assertClipTransition(item.status, [...fundedStatuses.filter((status) => status !== "DISPUTED"), "PAID"]);
  await tx.clipEngagement.update({ where: { id }, data: { status: "DISPUTED", statusBeforeDispute: item.status, disputeReason: z.string().trim().min(20).max(1500).parse(reason), disputeOpenedBy: userId } });
}
