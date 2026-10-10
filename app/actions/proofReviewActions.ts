"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePromoOperator } from "@/lib/cohort-promos";
import { billingTransaction } from "@/lib/billing-transaction";
import { confirmProofDenial, ProofReviewError } from "@/lib/submission-lifecycle";
import { approvePendingSubmission, settleApprovedPayout } from "@/lib/submission-approval";

export async function resolveProofDenial(id: string, decision: "approve" | "deny", note: string) {
  const operator = await requirePromoOperator();
  let result;
  try {
    const request = z.object({ id: z.string().min(1).max(200), decision: z.enum(["approve", "deny"]), note: z.string().trim().min(12).max(1000) }).parse({ id, decision, note });
    result = await billingTransaction(async (tx) => {
      if (request.decision === "deny") {
        await confirmProofDenial(tx, operator.id, request.id, request.note);
        return null;
      }
      const cleared = await tx.submission.updateMany({
        where: { id: request.id, status: "PENDING", denialReviewPending: true },
        data: { denialReviewPending: false, denialResolvedAt: new Date(), denialResolution: request.note, denialReviewerId: operator.id, revisionRequestedAt: null },
      });
      if (cleared.count !== 1) throw new ProofReviewError("This denial case has already been resolved.");
      return approvePendingSubmission(tx, request.id, { kind: "reviewer", id: operator.id, admin: true });
    });
  } catch (error) {
    if (error instanceof ProofReviewError) return { ok: false as const, error: error.message };
    if (error instanceof z.ZodError) return { ok: false as const, error: error.issues[0].message };
    console.error("SeedEnv denied-proof resolution failed:", error);
    return { ok: false as const, error: "The review could not be saved. Refresh the queue and retry, or contact support." };
  }
  revalidatePath("/admin/proof-reviews");
  revalidatePath("/dashboard");
  revalidatePath("/console");
  if (result) {
    try {
      const sent = await settleApprovedPayout(result, false);
      return { ok: true as const, message: sent ? "Work approved and reward transferred." : "Work approved. The reward is pending Stripe payout readiness." };
    } catch (error) {
      console.error("SeedEnv manual-review payout settlement failed:", error);
      return { ok: true as const, message: "Work was approved, but the reward transfer is pending. Check the payout ledger before retrying settlement." };
    }
  }
  return { ok: true as const, message: "Denial confirmed. The unused place has been released." };
}
