import { z } from "zod";

export const refundReasons = ["TESTER_QUALITY", "PLATFORM_ISSUE", "BILLING_ERROR", "TESTER_FRAUD", "OTHER"] as const;
export type RefundReason = (typeof refundReasons)[number];

export const refundReasonLabels: Record<RefundReason, string> = {
  TESTER_QUALITY: "Inadequate tester work",
  PLATFORM_ISSUE: "SeedEnv platform issue",
  BILLING_ERROR: "Incorrect or duplicate charge",
  TESTER_FRAUD: "Suspected tester fraud or bots",
  OTHER: "Something else",
};

export const refundStatusLabels: Record<string, string> = {
  OPEN: "In review",
  PROCESSING: "Processing",
  APPROVED: "Refunded",
  DENIED: "Declined",
  FAILED: "Needs attention",
};

export const refundResolutions = ["CARD", "CREDIT"] as const;
export type RefundResolution = (typeof refundResolutions)[number];

const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);

export const refundRequestSchema = z.object({
  receiptId: idSchema,
  reason: z.enum(refundReasons),
  details: z.string().trim().min(30, "Describe what went wrong in at least 30 characters.").max(4000),
  amountCents: z.number().int().min(100, "Refund requests start at $1.00.").max(10_000_000),
});

export const refundDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("APPROVE"), requestId: idSchema, resolution: z.enum(refundResolutions), amountCents: z.number().int().min(1).max(10_000_000), note: z.string().trim().max(2000).default("") }),
  z.object({ decision: z.literal("DENY"), requestId: idSchema, note: z.string().trim().min(10, "Explain the decision in at least 10 characters.").max(2000) }),
]);

export const REFUND_REQUESTS_PER_DAY = 5;
