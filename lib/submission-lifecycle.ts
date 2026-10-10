import type { Prisma } from "@prisma/client";
import { z } from "zod";

export const rejectionReasonSchema = z.enum(["Blurry Image", "Irrelevant Content", "Incomplete Steps", "Low Effort", "Generic Feedback", "Did not follow test script", "Incomplete video proof", "Required participation period not completed"]);
export const revisionWindowMs = 30 * 60 * 1000;
export class ProofReviewError extends Error {}

export function needsRevision(item: { revisionRequestedAt?: Date | string | null }) {
  return Boolean(item.revisionRequestedAt);
}

export async function requestProofRevision(tx: Prisma.TransactionClient, reviewerId: string, admin: boolean, id: string, note: string) {
  const text = z.string().trim().min(8).max(300).parse(note);
  const item = await tx.submission.findUnique({ where: { id }, include: { campaign: true } });
  if (!item || item.status !== "PENDING") throw new Error("Pending submission not found.");
  if (item.denialReviewPending) throw new Error("This proof is held for manual denial review.");
  if (item.campaign.developerId !== reviewerId && !admin) throw new Error("You cannot request revisions for this submission.");
  if (!item.feedbackText && !item.proofImageUrl) throw new Error("Wait for tester proof before requesting revisions.");
  if (needsRevision(item)) throw new Error("This tester already has an outstanding revision request.");
  return tx.submission.update({ where: { id }, data: { rejectionReason: `Revision requested: ${text}`, revisionRequestedAt: new Date(), revisionStartedAt: null }, select: { id: true, rejectionReason: true } });
}

// Used only by the AI intake auditor, at most once per submission; a human review always follows.
export async function requestAutomatedRevision(tx: Prisma.TransactionClient, id: string, note: string) {
  const text = z.string().trim().min(8).max(300).parse(note);
  const changed = await tx.submission.updateMany({
    where: { id, status: "PENDING", denialReviewPending: false, revisionRequestedAt: null, OR: [{ feedbackText: { not: null } }, { proofImageUrl: { not: null } }] },
    data: { rejectionReason: `Revision requested: ${text}`, revisionRequestedAt: new Date(), revisionStartedAt: null },
  });
  return changed.count === 1;
}

export async function startProofRevision(tx: Prisma.TransactionClient, testerId: string, id: string) {
  const item = await tx.submission.findUnique({ where: { id } });
  if (!item || item.testerId !== testerId || item.status !== "PENDING" || !needsRevision(item)) throw new Error("A pending revision request for your submission is required.");
  if (item.denialReviewPending) throw new Error("This proof is held for manual denial review.");
  if (item.revisionStartedAt && item.expiresAt > new Date()) return item;
  return tx.submission.update({ where: { id }, data: { revisionStartedAt: new Date(), expiresAt: new Date(Date.now() + revisionWindowMs) } });
}

export async function rejectProof(tx: Prisma.TransactionClient, reviewerId: string, admin: boolean, id: string, reason: string) {
  const safeReason = rejectionReasonSchema.parse(reason);
  const item = await tx.submission.findUnique({ where: { id }, include: { campaign: true } });
  if (!item || item.status !== "PENDING") throw new Error("Pending submission not found.");
  if (item.campaign.developerId !== reviewerId && !admin) throw new Error("You cannot review this submission.");
  if (item.denialReviewPending) throw new Error("This proof is already held for manual denial review.");
  if (!item.feedbackText && !item.proofImageUrl) throw new Error("Wait for tester proof before denying work.");
  const changed = await tx.submission.updateMany({
    where: { id, status: "PENDING", denialReviewPending: false },
    data: { denialReviewPending: true, denialRequestedAt: new Date(), rejectionReason: safeReason, revisionRequestedAt: null, revisionStartedAt: null },
  });
  if (changed.count !== 1) throw new Error("This submission has already been reviewed.");
  return { rejected: false, heldForReview: true, reason: safeReason };
}

export async function confirmProofDenial(tx: Prisma.TransactionClient, reviewerId: string, id: string, note: string) {
  const text = z.string().trim().min(12).max(1000).parse(note);
  const item = await tx.submission.findUnique({ where: { id } });
  if (!item || item.status !== "PENDING" || !item.denialReviewPending) throw new ProofReviewError("A held denial review is required.");
  const changed = await tx.submission.updateMany({ where: { id, status: "PENDING", denialReviewPending: true }, data: { status: "REJECTED", denialReviewPending: false, denialResolvedAt: new Date(), denialResolution: text, denialReviewerId: reviewerId, reviewedAt: new Date() } });
  if (changed.count !== 1) throw new ProofReviewError("This submission has already been reviewed.");
  const released = await tx.appCampaign.updateMany({ where: { id: item.campaignId, claimedSlots: { gt: 0 } }, data: { claimedSlots: { decrement: 1 } } });
  if (!released.count) throw new ProofReviewError("The mission slot count needs administrator reconciliation. No review was saved.");
  return { rejected: true };
}

export function assertProofEditable(item: { expiresAt: Date; revisionRequestedAt: Date | null; revisionStartedAt: Date | null; feedbackText: string | null; proofImageUrl: string | null; denialReviewPending?: boolean }) {
  if (item.denialReviewPending) throw new Error("This proof and its unpaid reward are held for manual review.");
  if (needsRevision(item) && !item.revisionStartedAt) throw new Error("Start your requested revision before editing proof.");
  if (item.expiresAt <= new Date()) throw new Error(needsRevision(item) ? "The revision editing window expired. Start the revision again." : "The 30-minute lock expired. Request a fresh slot.");
  if (!needsRevision(item) && (item.feedbackText || item.proofImageUrl)) throw new Error("Proof is already awaiting review. Wait for a developer revision request before changing it.");
}
