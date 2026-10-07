export const AUTO_APPROVE_AFTER_MS = 48 * 60 * 60 * 1000;

export function autoApproveDeadlineFrom(submittedAt: Date | string | null | undefined) {
  if (!submittedAt) return null;
  return new Date(new Date(submittedAt).getTime() + AUTO_APPROVE_AFTER_MS);
}

export type AuditHoldState = { status: string; humanClearedAt: Date | string | null } | null | undefined;

// An AI fraud flag pauses auto-approval until a person clears it; it never rejects on its own.
export function isFraudHeld(audit: AuditHoldState) {
  return audit?.status === "FLAGGED_FRAUD" && !audit.humanClearedAt;
}

export function isAutoApprovalDue(item: { status: string; submittedAt: Date | null; revisionRequestedAt: Date | null; feedbackText: string | null; proofImageUrl: string | null; audit?: AuditHoldState }, now: Date) {
  const deadline = autoApproveDeadlineFrom(item.submittedAt);
  return item.status === "PENDING" && !item.revisionRequestedAt && !isFraudHeld(item.audit) && Boolean(item.feedbackText || item.proofImageUrl) && deadline !== null && deadline <= now;
}
