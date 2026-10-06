export const AUTO_APPROVE_AFTER_MS = 48 * 60 * 60 * 1000;

export function autoApproveDeadlineFrom(submittedAt: Date | string | null | undefined) {
  if (!submittedAt) return null;
  return new Date(new Date(submittedAt).getTime() + AUTO_APPROVE_AFTER_MS);
}

export function isAutoApprovalDue(item: { status: string; submittedAt: Date | null; revisionRequestedAt: Date | null; feedbackText: string | null; proofImageUrl: string | null }, now: Date) {
  const deadline = autoApproveDeadlineFrom(item.submittedAt);
  return item.status === "PENDING" && !item.revisionRequestedAt && Boolean(item.feedbackText || item.proofImageUrl) && deadline !== null && deadline <= now;
}
