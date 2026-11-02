"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
import { clipMember, notifyClipAdmins, notifyClipAgreement, notifyClipMember } from "@/lib/clippers";
import { clipCampaignSchema, clipEligibility, clipProfileSchema, type ClipCampaignInput, type ClipProfileInput } from "@/lib/clipper-rules";
import { applyClip, disputeClip, inviteClipCreator, requireClipConversation, respondClipInvitation, reviewClipApplication, reviewClipDraft, reviewCreatorProfile, saveCreatorProfile, submitClipDraft, submitClipPublication, submitCreatorProfile, verifyClipManually } from "@/lib/clipper-lifecycle";
import { cancelUnpaidClipCheckout, fundClipAgreement, refundClipPayment, releaseClipPayment } from "@/lib/clipper-payments";
import { disconnectTikTok, verifyTikTokPublication } from "@/lib/clipper-tiktok";
import { beginClipUpload, checkClipStorage, finishClipUpload, type ClipUploadInput } from "@/lib/clipper-storage";
import { getStripe } from "@/lib/stripe";

function refresh(campaignId?: string) {
  revalidatePath("/clippers", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  if (campaignId) revalidatePath(`/clippers/${campaignId}`);
}

export async function saveClipProfile(input: ClipProfileInput, revision: number | null) {
  const member = await clipMember("TESTER");
  if (member.role !== "TESTER") throw new Error("Switch to your tester workspace to create a clipper profile.");
  const saved = await serializable((tx) => saveCreatorProfile(tx, member.id, clipProfileSchema.parse(input), z.number().int().positive().nullable().parse(revision)));
  refresh();
  if (saved.status !== "DRAFT") return "No profile changes were made. Your existing marketplace review state is unchanged.";
  return "Profile saved as a draft. Submit it for SeedEnv review below. Editing an approved profile removes its listing until it is approved again; funded agreements are unchanged.";
}

export async function submitClipProfile(revision: number) {
  const member = await clipMember("TESTER");
  const profile = await serializable((tx) => submitCreatorProfile(tx, member.id, z.number().int().positive().parse(revision)));
  refresh();
  return "Creator application submitted. SeedEnv will review your genres, social profiles, and portfolio. Track the decision in your tester dashboard." + await notifyClipAdmins("SeedEnv Clippers: creator application needs review", `${member.username} submitted creator profile revision ${revision}.`, `clip-review-${member.id}-${revision}-${profile.updatedAt.toISOString()}`);
}

export async function setClipAvailability(available: boolean) {
  const member = await clipMember("TESTER");
  if (member.role !== "TESTER") throw new Error("Switch to your tester workspace to manage creator availability.");
  await serializable(async (tx) => {
    const profile = await tx.clipProfile.findUnique({ where: { userId: member.id } });
    if (profile?.status !== "APPROVED") throw new Error("Only approved creators can change marketplace availability.");
    await tx.clipProfile.update({ where: { userId: member.id }, data: { available: z.boolean().parse(available) } });
  });
  refresh();
  return available ? "Your approved profile is listed and accepting new invitations." : "Marketplace listing and new invitations paused. Existing applications and funded work are unchanged.";
}

export async function moderateClipProfile(userId: string, revision: number, decision: "APPROVED" | "REJECTED" | "SUSPENDED", note: string, confirmed: boolean) {
  const member = await clipMember();
  if (member.role !== "ADMIN") throw new Error("Administrator review is required.");
  if (confirmed !== true) throw new Error("Confirm that you reviewed this creator's submitted profile, samples, and social accounts.");
  const result = await serializable((tx) => reviewCreatorProfile(tx, member.id, userId, z.number().int().positive().parse(revision), z.enum(["APPROVED", "REJECTED", "SUSPENDED"]).parse(decision), note));
  refresh();
  const suffix = await notifyClipMember(userId, "SeedEnv creator application update", `${decision === "APPROVED" ? "Your creator profile is approved for the marketplace." : "Your creator application needs attention."}\n\n${result.reviewNote}\n\nhttps://seedenv.com/dashboard?view=clippers`, `clip-profile-${userId}-${revision}-${decision}-${result.updatedAt.toISOString()}`);
  return "Creator profile review saved." + suffix;
}

export async function inviteClipper(creatorId: string, campaignId: string, note: string) {
  const member = await clipMember("DEVELOPER");
  const item = await serializable((tx) => inviteClipCreator(tx, member.id, creatorId, campaignId, note));
  refresh(campaignId);
  const suffix = await notifyClipAgreement(item.id, member.id, "You have a creator invitation. Review the brief and accept or decline within seven days. Do not start work before funding.");
  return "Invitation sent. No payment is taken until the creator accepts and you fund the agreement." + suffix;
}

export async function answerClipInvitation(id: string, accept: boolean, note: string, agree: boolean) {
  const member = await clipMember("TESTER");
  if (accept && agree !== true) throw new Error("Accept the fixed fee and full campaign terms before accepting the invitation.");
  const item = await serializable((tx) => respondClipInvitation(tx, member.id, id, z.boolean().parse(accept), note));
  refresh(item.campaignId);
  return (accept ? "Invitation accepted. Wait for funding before starting work." : "Invitation declined. No payment was taken.") + await notifyClipAgreement(id, member.id, accept ? "The creator accepted your invitation. Fund their agreement before they begin work." : "The creator declined your invitation.");
}

export async function cancelClipInvitation(id: string) {
  const member = await clipMember("DEVELOPER");
  const item = await serializable(async (tx) => {
    const current = await tx.clipEngagement.findUnique({ where: { id }, include: { campaign: true } });
    if (!current || current.campaign.developerId !== member.id || !["INVITED", "ACCEPTED"].includes(current.status) || current.fundedAt) throw new Error("Only your unanswered invitations or accepted, unfunded agreements can be withdrawn. Active checkout must finish or expire first.");
    return tx.clipEngagement.update({ where: { id }, data: { status: current.status === "ACCEPTED" ? "ACCEPTED_WITHDRAWN" : "WITHDRAWN", reviewNote: "Developer withdrew before funding." } });
  });
  refresh(item.campaignId);
  return "Unfunded agreement withdrawn; no payment was taken." + await notifyClipAgreement(id, member.id, "The developer withdrew this unfunded invitation or agreement.");
}
export async function createClipCampaign(input: ClipCampaignInput) {
  const member = await clipMember("DEVELOPER");
  if (member.role !== "DEVELOPER") throw new Error("Switch to your developer workspace before creating a creator campaign.");
  const data = clipCampaignSchema.parse(input);
  const campaign = await serializable(async (tx) => {
    if (await tx.clipCampaign.count({ where: { developerId: member.id, createdAt: { gte: new Date(Date.now() - 86400000) } } }) >= 10) throw new Error("You can create up to ten Clippers campaigns per day.");
    return tx.clipCampaign.create({ data: { ...data, developerId: member.id } });
  });
  refresh();
  return campaign.id;
}

export async function renewClipInvitation(id: string) {
  const member = await clipMember("DEVELOPER");
  const item = await serializable(async (tx) => {
    const current = await tx.clipEngagement.findUnique({ where: { id }, include: { campaign: true, creator: { include: { clipProfile: true } } } });
    if (!current || current.campaign.developerId !== member.id || current.status !== "INVITED" || !current.invitationExpiresAt || current.invitationExpiresAt > new Date()) throw new Error("Only your expired, unanswered invitations can be renewed.");
    const reason = clipEligibility(current.creator, current.creator.clipProfile, current.campaign);
    if (reason) throw new Error(reason);
    return tx.clipEngagement.update({ where: { id }, data: { invitationExpiresAt: new Date(Date.now() + 7 * 86400000) } });
  });
  refresh(item.campaignId);
  return "Invitation renewed for seven days; the original fixed fee is unchanged." + await notifyClipAgreement(id, member.id, "Your unanswered creator invitation was renewed for seven days. The original brief and fee are unchanged.");
}

export async function setClipApplications(campaignId: string, open: boolean) {
  const member = await clipMember("DEVELOPER");
  await serializable(async (tx) => {
    const campaign = await tx.clipCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.developerId !== member.id) throw new Error("Campaign not found for your workspace.");
    await tx.clipCampaign.update({ where: { id: campaignId }, data: { open: z.boolean().parse(open) } });
  });
  refresh(campaignId);
  return open ? "Applications reopened." : "Applications closed. Existing contracts are unchanged.";
}

export async function applyToClip(campaignId: string, note: string, agree: boolean) {
  const member = await clipMember("TESTER");
  if (agree !== true) throw new Error("Accept the campaign terms before applying.");
  const item = await serializable((tx) => applyClip(tx, member.id, campaignId, note));
  refresh(campaignId);
  return "Application sent. Do not start work until your agreement is funded." + await notifyClipAgreement(item.id, member.id, "A creator applied to your campaign. Review their accepted profile and application.");
}

export async function decideClipApplication(id: string, accept: boolean) {
  const member = await clipMember("DEVELOPER");
  await serializable((tx) => reviewClipApplication(tx, member.id, id, z.boolean().parse(accept)));
  refresh();
  return (accept ? "Creator accepted. Fund the agreement before work begins." : "Application declined.") + await notifyClipAgreement(id, member.id, accept ? "Your campaign application was accepted. Wait for funding before starting work." : "Your campaign application was declined.");
}

export async function withdrawClip(id: string) {
  const member = await clipMember("TESTER");
  await serializable(async (tx) => {
    const item = await tx.clipEngagement.findUnique({ where: { id } });
    if (!item || item.creatorId !== member.id || !["APPLIED", "ACCEPTED"].includes(item.status)) throw new Error("Only your unfunded application or invitation can be withdrawn.");
    await tx.clipEngagement.update({ where: { id }, data: { status: item.status === "ACCEPTED" ? "ACCEPTED_WITHDRAWN" : "WITHDRAWN", reviewNote: "Creator withdrew before funding." } });
  });
  refresh();
  return "Unfunded creator application withdrawn. No payment was taken." + await notifyClipAgreement(id, member.id, "The creator withdrew before funding.");
}

export async function sendClipMessage(campaignId: string, engagementId: string, body: string) {
  const member = await clipMember();
  const text = z.string().trim().min(1).max(2000).parse(body);
  const result = await serializable(async (tx) => {
    await requireClipConversation(tx, campaignId, engagementId, member.id, member.role);
    if (await tx.clipMessage.count({ where: { authorId: member.id, createdAt: { gte: new Date(Date.now() - 3600000) } } }) >= 60) throw new Error("Room message limit reached. Try again later.");
    const recent = await tx.clipMessage.count({ where: { engagementId, authorId: member.id, createdAt: { gte: new Date(Date.now() - 10 * 60000) } } });
    const message = await tx.clipMessage.create({ data: { campaignId, engagementId, authorId: member.id, body: text } });
    return { message, notify: recent === 0 };
  });
  refresh(campaignId);
  return "Private message sent." + (result.notify ? await notifyClipAgreement(engagementId, member.id, "There is a new private message in your creator agreement. Open the conversation to reply.", `message-${result.message.id}`) : "");
}

export async function sendClipDraft(id: string, assetId: string) {
  const member = await clipMember("TESTER");
  await serializable((tx) => submitClipDraft(tx, member.id, id, assetId));
  refresh();
  return "Draft submitted for review." + await notifyClipAgreement(id, member.id, "A creator draft needs your review within 72 hours.");
}

export async function decideClipDraft(id: string, approve: boolean, note: string) {
  const member = await clipMember("DEVELOPER");
  await serializable((tx) => reviewClipDraft(tx, member.id, id, z.boolean().parse(approve), note));
  refresh();
  return (approve ? "Draft approved. The creator can now publish with sponsorship disclosure." : "Revision requested.") + await notifyClipAgreement(id, member.id, approve ? "Your draft is approved. Publish within seven days with the required disclosure and campaign code." : "The developer requested changes. Open the agreement for revision notes and your three-day deadline.");
}

export async function sendClipPublication(id: string, url: string, proofId: string, disclosureConfirmed: boolean) {
  const member = await clipMember("TESTER");
  if (disclosureConfirmed !== true) throw new Error("Confirm sponsorship disclosure and the agreed posting requirements.");
  await serializable((tx) => submitClipPublication(tx, member.id, id, url, proofId));
  refresh();
  return "Publication evidence submitted. Payment is not released until verification and developer confirmation." + await notifyClipAgreement(id, member.id, "Publication evidence needs verification and payment release within 72 hours.");
}

export async function manuallyVerifyClip(id: string, note: string, confirmed: boolean) {
  const member = await clipMember("DEVELOPER");
  if (confirmed !== true) throw new Error("Confirm you checked the account, public post, approved video, campaign code, and disclosure.");
  await serializable((tx) => verifyClipManually(tx, member.id, id, note));
  refresh();
  return "Publication marked manually verified; this is not API verification.";
}

export async function openClipDispute(id: string, reason: string) {
  const member = await clipMember();
  await serializable((tx) => disputeClip(tx, member.id, id, reason));
  refresh();
  const counterpart = await notifyClipAgreement(id, member.id, "This agreement needs SeedEnv dispute review. Work and unreleased funds are frozen.");
  const admin = member.role === "ADMIN" ? "" : await notifyClipAdmins("SeedEnv Clippers: agreement dispute needs review", `Agreement ${id} needs administrator review.`, `clip-dispute-${id}`);
  return "Dispute opened for administrator review. Unreleased funds and further work are frozen; existing transfers are not automatically reversed." + (counterpart || admin);
}

export async function resumeClipDispute(id: string, note: string) {
  const member = await clipMember();
  if (member.role !== "ADMIN") throw new Error("Administrator review is required.");
  const agreement = await prisma.clipEngagement.findUniqueOrThrow({ where: { id } });
  if (agreement.disputeOpenedBy === "STRIPE") {
    if (!agreement.paymentIntentId) throw new Error("Stripe payment reference missing; manual reconciliation is required.");
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(agreement.paymentIntentId);
    const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    if (!chargeId || intent.status !== "succeeded") throw new Error("Reconcile the funding payment in Stripe before resuming.");
    const charge = await stripe.charges.retrieve(chargeId);
    if (charge.disputed || charge.amount_refunded > 0 || charge.refunded) throw new Error("This funding charge is still disputed or refunded. Resolve it in Stripe; do not resume or pay from it.");
    if (agreement.transferId && (await stripe.transfers.retrieve(agreement.transferId)).reversed) throw new Error("A reversed transfer needs administrator ledger reconciliation in Stripe; this contract cannot be marked paid automatically.");
  }
  await serializable(async (tx) => {
    const item = await tx.clipEngagement.findUniqueOrThrow({ where: { id } });
    if ((item.status !== "DISPUTED" || !item.statusBeforeDispute) && !(item.status === "PAYMENT_PENDING" && item.disputeOpenedBy === "STRIPE")) throw new Error("An open dispute or flagged payment is required.");
    if (item.updatedAt.getTime() !== agreement.updatedAt.getTime()) throw new Error("The agreement changed during review. Reload and review the latest evidence.");
    const restoredStatus = item.status === "PAYMENT_PENDING" ? "PAYMENT_PENDING" : item.statusBeforeDispute;
    if (!restoredStatus) throw new Error("The prior agreement status is missing; manual reconciliation is required.");
    await tx.clipEngagement.update({ where: { id }, data: { status: restoredStatus, statusBeforeDispute: null, moderationNote: `Issue: ${item.disputeReason || "Payment review"}\nResolution: ${z.string().trim().min(20).max(1500).parse(note)}`, disputeReason: null, disputeOpenedBy: null } });
  });
  refresh();
  return "Agreement resumed with a recorded administrator decision." + await notifyClipAgreement(id, member.id, "SeedEnv recorded a decision and resumed your agreement. Open it for the resolution.");
}

export async function fundClip(id: string, agree: boolean) {
  const member = await clipMember("DEVELOPER");
  if (agree !== true) throw new Error("Accept the immutable creator fee and license terms before funding.");
  if (!process.env.CLIPPERS_STRIPE_WEBHOOK_SECRET) throw new Error("The signed Clippers payment webhook must be configured before funding is allowed.");
  await checkClipStorage();
  const url = await fundClipAgreement(id, member.id);
  refresh();
  return url;
}

export async function cancelClipCheckout(id: string) {
  const member = await clipMember("DEVELOPER");
  const message = await cancelUnpaidClipCheckout(id, member.id);
  refresh();
  return message;
}

export async function releaseClip(id: string, confirmed: boolean) {
  const member = await clipMember("DEVELOPER");
  if (confirmed !== true) throw new Error("Confirm the published video matches the approved draft before releasing funds.");
  const message = await releaseClipPayment(id, member.id);
  refresh();
  return message + await notifyClipAgreement(id, member.id, "Your creator fee has been transferred to your Stripe account. Bank payout timing is controlled by Stripe; keep the post public for the agreed term.");
}

export async function refundClip(id: string, note: string) {
  const member = await clipMember();
  const message = await refundClipPayment(id, member.id, member.role, z.string().trim().min(20).max(1500).parse(note));
  refresh();
  return message + await notifyClipAgreement(id, member.id, "This creator agreement was cancelled and its funding refunded. No repost license was granted.");
}

export async function checkClipTikTok(id: string) {
  const member = await clipMember("TESTER");
  const message = await verifyTikTokPublication(id, member.id);
  refresh();
  return message;
}

export async function removeClipTikTok() {
  const member = await clipMember("TESTER");
  await disconnectTikTok(member.id);
  refresh();
  return "TikTok account disconnected and local encrypted tokens removed.";
}

export async function createClipUpload(input: ClipUploadInput) {
  const member = await clipMember();
  return beginClipUpload(member, input);
}

export async function completeClipUpload(assetId: string) {
  const member = await clipMember();
  const id = await finishClipUpload(member, assetId);
  refresh();
  return id;
}
