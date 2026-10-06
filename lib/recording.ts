export const STORED_RECORDING_PREFIX = "proof:recordings/";

export function isStoredRecording(url: string | null | undefined) {
  return Boolean(url?.startsWith(STORED_RECORDING_PREFIX));
}

export function recordingHref(submissionId: string, url: string | null | undefined) {
  if (!url) return null;
  return isStoredRecording(url) ? `/api/submissions/${encodeURIComponent(submissionId)}/recording` : url;
}
