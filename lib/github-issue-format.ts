import { isStoredRecording } from "@/lib/recording";

export const GITHUB_REPO_PATTERN = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

export type IssueSubmission = {
  id: string;
  feedbackText: string | null;
  recordingUrl: string | null;
  proofImageUrl: string | null;
  osBuild: string | null;
  deviceModel: string | null;
  screenResolution: string | null;
  appBuildVersion: string | null;
  networkType: string | null;
  crashLogs: string | null;
  networkLogs: string | null;
  hardwareStatus: string;
  hardwareFlags: string[];
  gpuRenderer: string | null;
  batteryLevel: number | null;
  createdAt: Date;
  tester: { username: string };
  campaign: { id: string; title: string; platform: string };
};

const LOG_LIMIT = 6000;
const hardwareLabels: Record<string, string> = {
  VERIFIED_PHYSICAL_NODE: "No emulator signals detected",
  EMULATOR_FLAGGED: "Emulator signals detected",
  UNVERIFIED: "Not checked",
};

// Tester text must not ping arbitrary GitHub users or teams from the developer's repo.
export function neutralizeMentions(value: string) {
  return value.replace(/@(?=[A-Za-z0-9])/g, "@\u200b");
}

export function markdownCell(value: string | null | undefined) {
  return value ? neutralizeMentions(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ").slice(0, 200) : "—";
}

function fenced(value: string) {
  const text = value.length > LOG_LIMIT ? `${value.slice(0, LOG_LIMIT)}\n… truncated (${value.length - LOG_LIMIT} more characters in SeedEnv)` : value;
  const longestRun = Math.max(2, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length));
  const fence = "`".repeat(longestRun + 1);
  return `${fence}text\n${text}\n${fence}`;
}

function safeHttpUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function buildGitHubIssue(submission: IssueSubmission, origin: string) {
  const firstLine = (submission.feedbackText || "Tester report").split(/\r?\n/)[0].trim().slice(0, 80);
  const title = `[SeedEnv] ${submission.campaign.title}: ${firstLine}`.slice(0, 240);
  const recording = isStoredRecording(submission.recordingUrl)
    ? `${origin.replace(/\/$/, "")}/api/submissions/${encodeURIComponent(submission.id)}/recording (SeedEnv sign-in required)`
    : safeHttpUrl(submission.recordingUrl);
  const lines = [
    `Exported from SeedEnv cohort **${markdownCell(submission.campaign.title)}** · tester \`${submission.tester.username}\` · ${submission.createdAt.toISOString().slice(0, 10)}`,
    "",
    "### Tester report",
    "",
    neutralizeMentions(submission.feedbackText || "_No written feedback._").split(/\r?\n/).map((line) => `> ${line}`).join("\n"),
    "",
    "### Device context",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Device | ${markdownCell(submission.deviceModel)} |`,
    `| OS / build | ${markdownCell(submission.osBuild)} |`,
    `| App build | ${markdownCell(submission.appBuildVersion)} |`,
    `| Screen | ${markdownCell(submission.screenResolution)} |`,
    `| Network | ${markdownCell(submission.networkType)} |`,
    `| Platform | ${markdownCell(submission.campaign.platform)} |`,
    `| Hardware signals | ${hardwareLabels[submission.hardwareStatus] || submission.hardwareStatus}${submission.hardwareFlags.length ? ` (${markdownCell(submission.hardwareFlags.join(", "))})` : ""} |`,
    `| GPU renderer | ${markdownCell(submission.gpuRenderer)} |`,
    `| Battery | ${submission.batteryLevel === null ? "—" : `${Math.round(submission.batteryLevel * 100)}%`} |`,
    "",
    "### Evidence",
    "",
    recording ? `- Screen recording: ${recording}` : "- Screen recording: not provided",
    submission.proofImageUrl ? `- Proof screenshot (SeedEnv sign-in required): ${origin}/api/submissions/${submission.id}/proof` : "- Proof screenshot: not provided",
    `- Review in SeedEnv: ${origin}/console?view=review-deck`,
  ];
  if (submission.crashLogs) lines.push("", "### Crash log", "", fenced(submission.crashLogs));
  if (submission.networkLogs) lines.push("", "### Network log", "", fenced(submission.networkLogs));
  lines.push("", "<sub>Device signals are browser heuristics and can be spoofed; they are not proof of a physical device.</sub>");
  return { title, body: lines.join("\n") };
}
