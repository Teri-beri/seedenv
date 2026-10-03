"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
import { clipMember, requireClipRoom } from "@/lib/clippers";
import { clipCampaignSchema, clipProfileSchema, type ClipCampaignInput, type ClipProfileInput } from "@/lib/clipper-rules";
import { applyClip, disputeClip, reviewClipApplication, reviewClipDraft, submitClipDraft, submitClipPublication, verifyClipManually } from "@/lib/clipper-lifecycle";
import { fundClipAgreement, refundClipPayment, releaseClipPayment } from "@/lib/clipper-payments";
import { disconnectTikTok, verifyTikTokPublication } from "@/lib/clipper-tiktok";
import { beginClipUpload, checkClipStorage, finishClipUpload, type ClipUploadInput } from "@/lib/clipper-storage";
import { getStripe } from "@/lib/stripe";

function refresh(campaignId?: string) {
  revalidatePath("/clippers");
  if (campaignId) revalidatePath(`/clippers/${campaignId}`);
}

export async function saveClipProfile(input: ClipProfileInput) {
  const member = await clipMember("TESTER");
  const data = clipProfileSchema.parse(input);
  await prisma.clipProfile.upsert({ where: { userId: member.id }, create: { userId: member.id, ...data }, update: data });
  refresh();
  return "Creator profile saved. Linked URLs are self-reported; TikTok ownership is verified separately.";
}

export async function createClipCampaign(input: ClipCampaignInput) {
  const member = await clipMember("DEVELOPER");
  const data = clipCampaignSchema.parse(input);
  const campaign = await serializable(async (tx) => {
    if (await tx.clipCampaign.count({ where: { developerId: member.id, createdAt: { gte: new Date(Date.now() - 86400000) } } }) >= 10) throw new Error("You can create up to ten Clippers campaigns per day.");
    return tx.clipCampaign.create({ data: { ...data, developerId: member.id } });
  });
  refresh();
  return campaign.id;
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
  await serializable((tx) => applyClip(tx, member.id, campaignId, note));
  refresh(campaignId);
  return "Application sent. Do not start work until your agreement is funded.";
}

export async function decideClipApplication(id: string, accept: boolean) {
  const member = await clipMember("DEVELOPER");
  await serializable((tx) => reviewClipApplication(tx, member.id, id, z.boolean().parse(accept)));
  refresh();
  revalidatePath("/clippers", "layout");
  return accept ? "Creator invited to the private room. Fund the agreement before work begins." : "Application declined.";
}

export async function withdrawClip(id: string) {
  const member = await clipMember("TESTER");
  await serializable(async (tx) => {
    const item = await tx.clipEngagement.findUnique({ where: { id } });
    if (!item || item.creatorId !== member.id || !["APPLIED", "ACCEPTED"].includes(item.status)) throw new Error("Only your unfunded application or invitation can be withdrawn.");
    await tx.clipEngagement.update({ where: { id }, data: { status: "DECLINED", reviewNote: "Creator withdrew before funding." } });
  });
  revalidatePath("/clippers", "layout");
  return "Unfunded creator application withdrawn. No payment was taken.";
}

export async function sendClipMessage(campaignId: string, body: string) {
  const member = await clipMember();
  const text = z.string().trim().min(1).max(2000).parse(body);
  await serializable(async (tx) => {
    await requireClipRoom(tx, campaignId, member.id, member.role);
    if (await tx.clipMessage.count({ where: { authorId: member.id, createdAt: { gte: new Date(Date.now() - 3600000) } } }) >= 60) throw new Error("Room message limit reached. Try again later.");
    await tx.clipMessage.create({ data: { campaignId, authorId: member.id, body: text } });
  });
  refresh(campaignId);
  return "Message sent.";
}

export async function sendClipDraft(id: string, assetId: string) {
  const member = await clipMember("TESTER");
  await serializable((tx) => submitClipDraft(tx, member.id, id, assetId));
  revalidatePath("/clippers", "layout");
  return "Draft submitted for review.";
}

export async function decideClipDraft(id: string, approve: boolean, note: string) {
  const member = await clipMember("DEVELOPER");
  await serializable((tx) => reviewClipDraft(tx, member.id, id, z.boolean().parse(approve), note));
  revalidatePath("/clippers", "layout");
  return approve ? "Draft approved. The creator can now publish with sponsorship disclosure." : "Revision requested.";
}

export async function sendClipPublication(id: string, url: string, proofId: string, disclosureConfirmed: boolean) {
  const member = await clipMember("TESTER");
  if (disclosureConfirmed !== true) throw new Error("Confirm sponsorship disclosure and the agreed posting requirements.");
  await serializable((tx) => submitClipPublication(tx, member.id, id, url, proofId));
  revalidatePath("/clippers", "layout");
  return "Publication evidence submitted. Payment is not released until verification and developer confirmation.";
}

export async function manuallyVerifyClip(id: string, note: string, confirmed: boolean) {
  const member = await clipMember("DEVELOPER");
  if (confirmed !== true) throw new Error("Confirm you checked the account, public post, approved video, campaign code, and disclosure.");
  await serializable((tx) => verifyClipManually(tx, member.id, id, note));
  revalidatePath("/clippers", "layout");
  return "Publication marked manually verified; this is not API verification.";
}

export async function openClipDispute(id: string, reason: string) {
  const member = await clipMember();
  await serializable((tx) => disputeClip(tx, member.id, id, reason));
  revalidatePath("/clippers", "layout");
  return "Dispute opened for administrator review. Unreleased funds and further work are frozen; existing transfers are not automatically reversed.";
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
  revalidatePath("/clippers", "layout");
  return "Agreement resumed with a recorded administrator decision.";
}

export async function fundClip(id: string, agree: boolean) {
  const member = await clipMember("DEVELOPER");
  if (agree !== true) throw new Error("Accept the immutable creator fee and license terms before funding.");
  if (!process.env.CLIPPERS_STRIPE_WEBHOOK_SECRET) throw new Error("The signed Clippers payment webhook must be configured before funding is allowed.");
  await checkClipStorage();
  const url = await fundClipAgreement(id, member.id);
  revalidatePath("/clippers", "layout");
  return url;
}

export async function releaseClip(id: string, confirmed: boolean) {
  const member = await clipMember("DEVELOPER");
  if (confirmed !== true) throw new Error("Confirm the published video matches the approved draft before releasing funds.");
  const message = await releaseClipPayment(id, member.id);
  revalidatePath("/clippers", "layout");
  return message;
}

export async function refundClip(id: string, note: string) {
  const member = await clipMember();
  const message = await refundClipPayment(id, member.id, member.role, z.string().trim().min(20).max(1500).parse(note));
  revalidatePath("/clippers", "layout");
  return message;
}

export async function checkClipTikTok(id: string) {
  const member = await clipMember("TESTER");
  const message = await verifyTikTokPublication(id, member.id);
  revalidatePath("/clippers", "layout");
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
  revalidatePath("/clippers", "layout");
  return id;
}
