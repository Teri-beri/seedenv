import type { Prisma } from "@prisma/client";
import { z } from "zod";

export const rejectionReasonSchema = z.enum(["Blurry Image", "Irrelevant Content", "Incomplete Steps", "Low Effort", "Generic Feedback", "Did not follow test script", "Incomplete video proof"]);
export const revisionWindowMs = 30 * 60 * 1000;

export function needsRevision(item: { revisionRequestedAt?: Date | string | null }) {
  return Boolean(item.revisionRequestedAt);
}

export async function requestProofRevision(tx: Prisma.TransactionClient, reviewerId: string, admin: boolean, id: string, note: string) {
  const text = z.string().trim().min(8).max(300).parse(note);
  const item = await tx.submission.findUnique({ where: { id }, include: { campaign: true } });
  if (!item || item.status !== "PENDING") throw new Error("Pending submission not found.");
  if (item.campaign.developerId !== reviewerId && !admin) throw new Error("You cannot request revisions for this submission.");
  if (!item.feedbackText && !item.proofImageUrl) throw new Error("Wait for tester proof before requesting revisions.");
  if (needsRevision(item)) throw new Error("This tester already has an outstanding revision request.");
  return tx.submission.update({ where: { id }, data: { rejectionReason: `Revision requested: ${text}`, revisionRequestedAt: new Date(), revisionStartedAt: null }, select: { id: true, rejectionReason: true } });
}

// Used only by the AI intake auditor, at most once per submission; a human review always follows.
export async function requestAutomatedRevision(tx: Prisma.TransactionClient, id: string, note: string) {
  const text = z.string().trim().min(8).max(300).parse(note);
  const changed = await tx.submission.updateMany({
    where: { id, status: "PENDING", revisionRequestedAt: null, OR: [{ feedbackText: { not: null } }, { proofImageUrl: { not: null } }] },
    data: { rejectionReason: `Revision requested: ${text}`, revisionRequestedAt: new Date(), revisionStartedAt: null },
  });
  return changed.count === 1;
}

export async function startProofRevision(tx: Prisma.TransactionClient, testerId: string, id: string) {
  const item = await tx.submission.findUnique({ where: { id } });
  if (!item || item.testerId !== testerId || item.status !== "PENDING" || !needsRevision(item)) throw new Error("A pending revision request for your submission is required.");
  if (item.revisionStartedAt && item.expiresAt > new Date()) return item;
  return tx.submission.update({ where: { id }, data: { revisionStartedAt: new Date(), expiresAt: new Date(Date.now() + revisionWindowMs) } });
}

export async function rejectProof(tx: Prisma.TransactionClient, reviewerId: string, admin: boolean, id: string, reason: string) {
  const safeReason = rejectionReasonSchema.parse(reason);
  const item = await tx.submission.findUnique({ where: { id }, include: { campaign: true } });
  if (!item || item.status !== "PENDING") throw new Error("Pending submission not found.");
  if (item.campaign.developerId !== reviewerId && !admin) throw new Error("You cannot review this submission.");
  const changed = await tx.submission.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", rejectionReason: safeReason, reviewedAt: new Date(), revisionRequestedAt: null, revisionStartedAt: null } });
  if (changed.count !== 1) throw new Error("This submission has already been reviewed.");
  const released = await tx.appCampaign.updateMany({ where: { id: item.campaignId, claimedSlots: { gt: 0 } }, data: { claimedSlots: { decrement: 1 } } });
  if (!released.count) throw new Error("The mission slot count needs administrator reconciliation. No review was saved.");
  return { rejected: true, reason: safeReason };
}

export function assertProofEditable(item: { expiresAt: Date; revisionRequestedAt: Date | null; revisionStartedAt: Date | null; feedbackText: string | null; proofImageUrl: string | null }) {
  if (needsRevision(item) && !item.revisionStartedAt) throw new Error("Start your requested revision before editing proof.");
  if (item.expiresAt <= new Date()) throw new Error(needsRevision(item) ? "The revision editing window expired. Start the revision again." : "The 30-minute lock expired. Request a fresh slot.");
  if (!needsRevision(item) && (item.feedbackText || item.proofImageUrl)) throw new Error("Proof is already awaiting review. Wait for a developer revision request before changing it.");
}
