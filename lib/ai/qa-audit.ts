import type { Prisma, SubmissionAuditStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { versionDirections } from "@/lib/instruction-versions";
import { serializable } from "@/lib/quest-ledger";
import { downloadProofObject } from "@/lib/storage";
import { isStoredRecording } from "@/lib/recording";
import { requestAutomatedRevision } from "@/lib/submission-lifecycle";
import { sendNotificationEmail } from "@/lib/notifications";
import { createLogger } from "@/lib/growth/log";
import { createNotifier } from "@/lib/growth/notify";
import { AiUnavailableError, getGeminiClient, type GeminiClient, type InlineMedia } from "@/lib/ai/gemini-client";
import { runQaIntakeAgent, type QaIntakeResult } from "@/lib/ai/agents/qa-intake.agent";
import { runFraudWatchdogAgent, type FraudWatchdogResult } from "@/lib/ai/agents/fraud-watchdog.agent";

export const FRAUD_HOLD_THRESHOLD = 70;
export const AUTO_CLARIFY_MAX_SCORE = 4;
export const MAX_AUDIT_ATTEMPTS = 5;
export const NEAR_COPY_SIMILARITY = 0.85;
const MAX_SCREENSHOT_BYTES = 6 * 1024 * 1024;
// Gemini inline requests are capped near 20MB, so larger recordings are left to the human reviewer.
export const MAX_RECORDING_BYTES = 18 * 1024 * 1024;
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const logger = createLogger({ scope: "qa-ai" });

function shingles(text: string) {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const set = new Set<string>();
  for (let index = 0; index + 2 < words.length; index += 1) set.add(words.slice(index, index + 3).join(" "));
  return set;
}

// Jaccard similarity over word 3-grams; catches copy-pasted reports that differ only in punctuation or casing.
export function textSimilarity(a: string, b: string) {
  const left = shingles(a);
  const right = shingles(b);
  if (left.size < 5 || right.size < 5) return 0;
  let shared = 0;
  for (const item of left) if (right.has(item)) shared += 1;
  return shared / (left.size + right.size - shared);
}

export type DeterministicSignals = { nearCopyOfId: string | null; emulatorFlagged: boolean };

export type AuditDecision = {
  status: SubmissionAuditStatus;
  fraudRiskScore: number;
  fraudFlags: string[];
  autoClarify: boolean;
};

export type EvidenceTrustPreview = {
  score: number;
  label: string;
  strengths: string[];
  gaps: string[];
  guidance: string;
};

export function previewTesterEvidenceQuality(input: {
  feedbackText: string;
  hasRecording: boolean;
  hasScreenshot: boolean;
  deviceModel?: string | null;
  osBuild?: string | null;
  appBuildVersion?: string | null;
  networkType?: string | null;
  crashLogs?: string | null;
  networkLogs?: string | null;
}): EvidenceTrustPreview {
  let score = 38;
  const strengths: string[] = [];
  const gaps: string[] = [];

  if (input.hasRecording) {
    score += 30;
    strengths.push("Screen recording is attached");
  } else if (input.hasScreenshot) {
    score += 16;
    strengths.push("Screenshot is attached");
  } else {
    score -= 8;
    gaps.push("Add a screen recording or screenshot to anchor the report.");
  }

  const feedback = input.feedbackText.trim();
  if (feedback.length >= 120) {
    score += 18;
    strengths.push("Report has enough detail to be understandable");
  } else if (feedback.length < 40) {
    score -= 12;
    gaps.push("Add more context about what you expected vs. what actually happened.");
  }

  if (/expected|actual|instead|before|after|when|while|but/i.test(feedback)) {
    score += 10;
    strengths.push("Expected vs actual behavior is described");
  } else {
    gaps.push("State the expected result and the actual result in plain language.");
  }

  if (/\b(step|steps|1\.|2\.|repro|reproduce|open|tap|select|click)/i.test(feedback)) {
    score += 8;
    strengths.push("Reproduction steps are present");
  } else {
    gaps.push("List the exact steps from start to finish so it can be reproduced.");
  }

  if (input.deviceModel || input.osBuild || input.appBuildVersion) {
    score += 10;
    strengths.push("Device and build context is included");
  } else {
    gaps.push("Add your device model, iOS/Android build, or app version.");
  }

  if (input.networkType || input.crashLogs || input.networkLogs) {
    score += 8;
    strengths.push("Network or crash context is included");
  } else {
    gaps.push("Add a quick note on network conditions or paste crash logs if relevant.");
  }

  if (!input.hasRecording) {
    gaps.push("Prefer a screen recording when possible — it gives reviewers the strongest evidence.");
  }

  const normalized = Math.min(100, Math.max(0, Math.round(score)));
  const label = normalized >= 85 ? "Strong evidence" : normalized >= 70 ? "Good evidence" : normalized >= 55 ? "Needs a bit more detail" : "Low-effort report";
  const guidance = normalized >= 85
    ? "This is enough to review quickly. Keep the recording in view and submit as-is."
    : normalized >= 70
      ? "Strong start. Add one more missing detail like exact steps or network conditions to improve trust."
      : normalized >= 55
        ? "The review is salvageable. Add expected vs actual results and a clearer reproduction path."
        : "This needs more evidence before developers can act on it. Record the path to the issue and explain the exact failure.";

  const uniqueStrengths = [...new Set(strengths)].slice(0, 3);
  const uniqueGaps = [...new Set(gaps)].slice(0, 3);

  return { score: normalized, label, strengths: uniqueStrengths, gaps: uniqueGaps, guidance };
}

export function decideAuditOutcome(intake: QaIntakeResult, fraud: FraudWatchdogResult | null, signals: DeterministicSignals): AuditDecision {
  let risk = fraud?.riskScore ?? 0;
  const flags: string[] = [...(fraud?.flags ?? [])];
  if (signals.nearCopyOfId) {
    risk = Math.max(risk, 75);
    flags.push("NEAR_COPY_OF_ANOTHER_REPORT");
  }
  if (signals.emulatorFlagged) {
    risk = Math.min(100, risk + 25);
    flags.push("EMULATOR_SIGNALS");
  }
  const fraudRiskScore = Math.max(0, Math.min(100, Math.round(risk)));
  const flagged = fraudRiskScore >= FRAUD_HOLD_THRESHOLD;
  const status: SubmissionAuditStatus = flagged ? "FLAGGED_FRAUD" : intake.action === "APPROVE" ? "APPROVED" : intake.action === "REJECT" ? "REJECTED" : "NEEDS_CLARIFICATION";
  return { status, fraudRiskScore, fraudFlags: [...new Set(flags)], autoClarify: !flagged && intake.action === "REQUEST_CLARIFICATION" && intake.qualityScore <= AUTO_CLARIFY_MAX_SCORE };
}

export function buildClarificationNote(intake: QaIntakeResult) {
  const missing = intake.missingFields.slice(0, 4).join("; ");
  const note = `SeedEnv QA assistant: ${intake.feedbackToTester}${missing ? ` Missing: ${missing}.` : ""}`;
  return note.length > 300 ? `${note.slice(0, 299)}…` : note;
}

const auditInclude = {
  instructionVersion: true,
  campaign: { select: { id: true, title: true, appUrl: true, platform: true, developerId: true } },
  tester: { select: { email: true, username: true } },
  audit: true,
} satisfies Prisma.SubmissionInclude;

async function loadMedia(submission: { proofImageUrl: string | null; recordingUrl: string | null }) {
  const media: InlineMedia[] = [];
  let recordingSkipped = false;
  const image = await downloadProofObject(submission.proofImageUrl, MAX_SCREENSHOT_BYTES);
  if (image && IMAGE_TYPES.has(image.mimeType)) media.push({ data: image.buffer, mimeType: image.mimeType });
  if (isStoredRecording(submission.recordingUrl)) {
    const video = await downloadProofObject(submission.recordingUrl, MAX_RECORDING_BYTES);
    if (video && VIDEO_TYPES.has(video.mimeType)) media.push({ data: video.buffer, mimeType: video.mimeType });
    else recordingSkipped = true;
  }
  return { media, recordingSkipped };
}

async function alertAdmins(title: string, markdown: string) {
  const notifier = createNotifier({ slackWebhookUrl: process.env.SLACK_WEBHOOK_URL, discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL, telegramBotToken: process.env.TELEGRAM_BOT_TOKEN, telegramChatId: process.env.TELEGRAM_CHAT_ID }, logger);
  await notifier.alert(title, markdown).catch(() => undefined);
}

export type AuditOutcome = { ok: true; status: SubmissionAuditStatus; autoClarified: boolean } | { ok: false; skipped?: string; error?: string };

// Never throws: failures are recorded as a PENDING audit for retry and manual review, so tester and developer flows are unaffected.
export async function auditSubmission(submissionId: string, options: { client?: GeminiClient; force?: boolean } = {}): Promise<AuditOutcome> {
  const client = options.client ?? getGeminiClient();
  const submission = await prisma.submission.findUnique({ where: { id: submissionId }, include: auditInclude }).catch((error: unknown) => {
    logger.error("qa_audit_load_failed", { submissionId, error });
    return null;
  });
  if (!submission) return { ok: false, skipped: "Submission not found." };
  if (submission.status !== "PENDING" || !submission.submittedAt || !submission.feedbackText) return { ok: false, skipped: "Only submitted, pending proof is audited." };
  if (!options.force && submission.audit && submission.audit.status !== "PENDING" && submission.audit.updatedAt >= submission.submittedAt) return { ok: false, skipped: "Already audited." };

  const submittedAt = submission.submittedAt;
  try {
    const others = await prisma.submission.findMany({
      where: { campaignId: submission.campaignId, id: { not: submission.id }, testerId: { not: submission.testerId }, feedbackText: { not: null }, status: { in: ["PENDING", "APPROVED"] } },
      orderBy: { submittedAt: "desc" },
      take: 200,
      select: { id: true, feedbackText: true, submittedAt: true },
    });
    if (!submission.instructionVersion) throw new Error("Accepted directions are missing; manual review is required.");
    const missionSteps = versionDirections(submission.instructionVersion).map((step) => `${step.instructionTitle}: ${step.instructionDetail}`);
    const intake = await runQaIntakeAgent(client, {
      missionTitle: submission.campaign.title,
      missionSteps,
      feedbackText: submission.feedbackText,
      deviceInfo: { deviceModel: submission.deviceModel, osBuild: submission.osBuild, appBuildVersion: submission.appBuildVersion, networkType: submission.networkType, screenResolution: submission.screenResolution },
      hasScreenshot: Boolean(submission.proofImageUrl),
      hasRecording: Boolean(submission.recordingUrl),
      crashLogExcerpt: submission.crashLogs?.slice(0, 2000) ?? null,
      existingSubmissions: others.filter((item) => item.submittedAt && item.submittedAt < submittedAt).slice(0, 40).map((item) => ({ id: item.id, excerpt: (item.feedbackText ?? "").slice(0, 600) })),
    });

    const { media, recordingSkipped } = await loadMedia(submission);
    const fraud = media.length
      ? await runFraudWatchdogAgent(client, media, { missionTitle: submission.campaign.title, missionSteps, appName: submission.campaign.title, platform: submission.campaign.platform, reportedDescription: submission.feedbackText })
      : null;
    const nearCopy = others.find((item) => textSimilarity(item.feedbackText ?? "", submission.feedbackText ?? "") >= NEAR_COPY_SIMILARITY);
    const decision = decideAuditOutcome(intake, fraud, { nearCopyOfId: nearCopy?.id ?? null, emulatorFlagged: submission.hardwareStatus === "EMULATOR_FLAGGED" });
    const explanation = [fraud?.explanation, nearCopy ? `Feedback text is nearly identical to submission ${nearCopy.id} from another tester.` : null, recordingSkipped ? "Recording was not inspected (over the AI size limit); review it manually." : null].filter(Boolean).join(" ");
    const fields = {
      qualityScore: intake.qualityScore,
      status: decision.status,
      reproductionValid: intake.reproductionValid,
      isDuplicate: intake.isDuplicate,
      duplicateRefId: intake.duplicateOfId,
      missingFields: intake.missingFields,
      feedbackToTester: intake.feedbackToTester,
      fraudRiskScore: decision.fraudRiskScore,
      fraudFlags: decision.fraudFlags,
      fraudExplanation: explanation ? explanation.slice(0, 1000) : null,
      mediaChecked: media.length > 0,
      model: client.modelFor(media.length ? "vision" : "text"),
      lastError: null,
      humanClearedAt: null,
      humanClearedById: null,
    };

    const autoClarified = await serializable(async (tx) => {
      const current = await tx.submission.findUnique({ where: { id: submissionId }, select: { status: true, submittedAt: true }, });
      // Proof changed while the audit ran; the newer submission gets its own audit.
      if (!current || current.status !== "PENDING" || current.submittedAt?.getTime() !== submittedAt.getTime()) return null;
      const saved = await tx.submissionAudit.upsert({ where: { submissionId }, create: { submissionId, ...fields, attempts: 1 }, update: { ...fields, attempts: { increment: 1 } } });
      if (!decision.autoClarify || saved.autoClarifiedAt) return false;
      const claimed = await tx.submissionAudit.updateMany({ where: { submissionId, autoClarifiedAt: null }, data: { autoClarifiedAt: new Date() } });
      if (claimed.count !== 1) return false;
      const requested = await requestAutomatedRevision(tx, submissionId, buildClarificationNote(intake));
      if (!requested) await tx.submissionAudit.update({ where: { submissionId }, data: { autoClarifiedAt: null } });
      return requested;
    });
    if (autoClarified === null) return { ok: false, skipped: "Submission changed during the audit." };

    if (autoClarified && submission.tester.email) {
      const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://seedenv.com";
      await sendNotificationEmail(
        submission.tester.email,
        `More detail needed: ${submission.campaign.title}`,
        `Hi ${submission.tester.username},\n\nThanks for testing ${submission.campaign.title}. Before the developer can review it, your report needs a little more detail:\n\n${intake.feedbackToTester}\n\n${intake.missingFields.length ? `Please add:\n${intake.missingFields.map((field) => `- ${field}`).join("\n")}\n\n` : ""}Open your dashboard and choose "Start revision" to update your proof: ${origin}/dashboard\n\nThis was an automated check. The developer still makes the final approval decision.`,
      );
    }
    if (decision.status === "FLAGGED_FRAUD") {
      await alertAdmins("SeedEnv QA: submission held for review", `Submission \`${submissionId}\` in **${submission.campaign.title}** scored ${decision.fraudRiskScore}/100 fraud risk (${decision.fraudFlags.join(", ") || "no flags"}). Auto-approval is paused until a human clears it.`);
    }
    logger.info("qa_audit_complete", { submissionId, status: decision.status, score: intake.qualityScore, risk: decision.fraudRiskScore, autoClarified });
    return { ok: true, status: decision.status, autoClarified };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("qa_ai_admin_alert", { submissionId, error: message });
    const saved = await prisma.submissionAudit.upsert({
      where: { submissionId },
      create: { submissionId, status: "PENDING", attempts: 1, lastError: message.slice(0, 1000) },
      update: { status: "PENDING", attempts: { increment: 1 }, lastError: message.slice(0, 1000) },
      select: { attempts: true },
    }).catch(() => null);
    if (saved && (saved.attempts === 1 || saved.attempts === MAX_AUDIT_ATTEMPTS) && !(error instanceof AiUnavailableError)) {
      await alertAdmins("SeedEnv QA: AI audit failed", `Submission \`${submissionId}\` could not be audited (attempt ${saved.attempts}/${MAX_AUDIT_ATTEMPTS}): ${message.slice(0, 300)}${saved.attempts >= MAX_AUDIT_ATTEMPTS ? "\nNo more automatic retries. Review it manually in /admin/qa." : ""}`);
    }
    return { ok: false, error: message };
  }
}

let retryInFlight: Promise<{ retried: number }> | null = null;

// Picks up submissions whose audit failed or never ran (e.g. the server restarted mid-request).
export function retryPendingAudits(limit = 10) {
  retryInFlight ??= runRetry(limit).finally(() => { retryInFlight = null; });
  return retryInFlight;
}

async function runRetry(limit: number) {
  if (!getGeminiClient().configured) return { retried: 0 };
  const cutoff = new Date(Date.now() - 5 * 60_000);
  // Only proof still inside the 48h review window; older submissions predate the auditor and are left to humans.
  const windowStart = new Date(Date.now() - 48 * 3_600_000);
  const rows = await prisma.submission.findMany({
    where: {
      status: "PENDING",
      submittedAt: { not: null, lt: cutoff, gt: windowStart },
      feedbackText: { not: null },
      OR: [{ audit: { is: null } }, { audit: { is: { status: "PENDING", attempts: { lt: MAX_AUDIT_ATTEMPTS }, updatedAt: { lt: cutoff } } } }],
    },
    orderBy: { submittedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let retried = 0;
  for (const row of rows) {
    await auditSubmission(row.id);
    retried += 1;
  }
  return { retried };
}
