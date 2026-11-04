"use server";

import { revalidatePath } from "next/cache";
import { canManageCohortPromos } from "@/lib/cohort-promos";
import { requireMember } from "@/lib/member";
import { repairStuckPayout } from "@/lib/payout-repair";
import { refundDecisionSchema, refundRequestSchema } from "@/lib/refund-rules";
import { approveRefundRequest, createRefundRequest, denyRefundRequest, RefundError } from "@/lib/refunds";

const idPattern = /^[a-zA-Z0-9_-]{1,120}$/;

async function requireOperator() {
  const user = await requireMember();
  if (!canManageCohortPromos(user)) throw new RefundError("Administrator access required.");
  return user;
}

function failure(error: unknown, fallback: string) {
  if (error instanceof RefundError) return { ok: false as const, message: error.message };
  console.error("SeedEnv refund action failed:", error);
  return { ok: false as const, message: fallback };
}

export async function requestRefund(input: { receiptId: string; reason: string; details: string; amountCents: number }) {
  const parsed = refundRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Check the refund request details." };
  try {
    const user = await requireMember("DEVELOPER");
    const request = await createRefundRequest(user.id, parsed.data);
    revalidatePath("/console");
    return { ok: true as const, requestId: request.id };
  } catch (error) {
    return failure(error, "Your refund request was not submitted. Try again or contact terimus@seedenv.com.");
  }
}

export async function decideRefund(input: unknown) {
  const parsed = refundDecisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Check the decision details." };
  try {
    const admin = await requireOperator();
    const decision = parsed.data;
    const request = decision.decision === "DENY"
      ? await denyRefundRequest(decision.requestId, admin.id, decision.note)
      : await approveRefundRequest(decision.requestId, admin.id, { resolution: decision.resolution, amountCents: decision.amountCents, note: decision.note });
    revalidatePath("/admin/refunds");
    return { ok: true as const, status: request.status };
  } catch (error) {
    revalidatePath("/admin/refunds");
    return failure(error, "The refund decision could not be completed. Check Stripe and the billing operations log.");
  }
}

export async function repairPayout(operationId: string) {
  if (!idPattern.test(operationId)) return { ok: false as const, message: "Invalid payout reference." };
  try {
    const admin = await requireOperator();
    const result = await repairStuckPayout(operationId, admin.id);
    revalidatePath("/admin/refunds");
    if (result.failures.length) return { ok: false as const, message: `Payout reopened but the retry did not complete: ${result.failures[0]}` };
    return { ok: true as const, message: result.existingTransfer ? `Found existing Stripe transfer ${result.existingTransfer} and attached it.` : `Payout retried. ${result.releasedCount} released, ${result.pendingCount} still pending.` };
  } catch (error) {
    revalidatePath("/admin/refunds");
    if (error instanceof Error && !(error instanceof RefundError)) {
      console.error("SeedEnv payout repair failed:", error);
      return { ok: false as const, message: error.message.slice(0, 300) };
    }
    return failure(error, "The payout could not be repaired.");
  }
}
