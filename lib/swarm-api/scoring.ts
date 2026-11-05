import { createHmac } from "node:crypto";
import { jaccardSimilarity, normalizeTokens } from "@/lib/swarm-detector";

export const RETENTION_MS = 24 * 60 * 60 * 1000;
export const BURST_WINDOW_MS = 10 * 60 * 1000;
const MAX_TOKENS = 200;
const MIN_TOKENS_FOR_MATCH = 4;
const NEAR_DUPLICATE = 0.55;
const BURST_SIMILARITY = 0.3;

export const DEFAULT_THRESHOLDS = { review: 40, hold: 70 } as const;
export type Thresholds = { review: number; hold: number };
export type ModerationAction = "allow" | "review" | "hold";

export type SignalCode =
  | "copy_paste_cluster"
  | "coordinated_phrasing"
  | "burst_window"
  | "same_thread_brigade"
  | "author_flood"
  | "self_repeat"
  | "link_heavy"
  | "new_account";

export type Signal = { code: SignalCode; weight: number; detail: string };

export type Fingerprint = {
  authorHash: string;
  threadHash: string | null;
  textHash: string;
  tokenHashes: string[];
  linkCount: number;
  postedAt: Date;
};

export type HistoryFingerprint = Omit<Fingerprint, "linkCount">;

export type ScoreResult = {
  score: number;
  action: ModerationAction;
  signals: Signal[];
  cluster: { size: number; sameThread: number; inBurstWindow: number };
};

function digest(salt: string, value: string, length = 32) {
  return createHmac("sha256", salt).update(value).digest("hex").slice(0, length);
}

export function countLinks(text: string) {
  return (text.match(/\bhttps?:\/\/|\bwww\.[a-z0-9-]+\.[a-z]/gi) ?? []).length;
}

export function fingerprintComment(salt: string, input: { text: string; authorId: string; threadId?: string | null; postedAt: Date }): Fingerprint {
  const canonical = input.text.toLowerCase().replace(/\s+/g, " ").trim();
  return {
    authorHash: digest(salt, `author:${input.authorId}`),
    threadHash: input.threadId ? digest(salt, `thread:${input.threadId}`) : null,
    textHash: digest(salt, `text:${canonical}`),
    tokenHashes: normalizeTokens(input.text).slice(0, MAX_TOKENS).map((token) => digest(salt, `tok:${token}`, 12)),
    linkCount: countLinks(input.text),
    postedAt: input.postedAt,
  };
}

export function actionForScore(score: number, thresholds: Thresholds = DEFAULT_THRESHOLDS): ModerationAction {
  if (score >= thresholds.hold) return "hold";
  if (score >= thresholds.review) return "review";
  return "allow";
}

// Scores one comment against the account's recent, text-free fingerprints. Opinions are never scored; only coordination patterns.
export function scoreComment(
  current: Fingerprint,
  history: HistoryFingerprint[],
  options: { authorAccountAgeDays?: number | null; thresholds?: Thresholds } = {},
): ScoreResult {
  const signals: Signal[] = [];
  const now = current.postedAt.getTime();
  const matchable = current.tokenHashes.length >= MIN_TOKENS_FOR_MATCH;
  const clusterAuthors = new Set<string>();
  const exactAuthors = new Set<string>();
  const sameThreadAuthors = new Set<string>();
  const burstAuthors = new Set<string>();
  let authorRecent = 0;
  const repeatThreads = new Set<string>();

  for (const item of history) {
    const delta = Math.abs(now - item.postedAt.getTime());
    if (item.authorHash === current.authorHash) {
      if (delta <= BURST_WINDOW_MS) authorRecent += 1;
      if (item.textHash === current.textHash && matchable && item.threadHash !== current.threadHash) repeatThreads.add(item.threadHash ?? "none");
      continue;
    }
    if (!matchable || item.tokenHashes.length < MIN_TOKENS_FOR_MATCH) continue;
    const exact = item.textHash === current.textHash;
    const similarity = exact ? 1 : jaccardSimilarity(current.tokenHashes, item.tokenHashes);
    const coordinated = similarity >= NEAR_DUPLICATE || (similarity >= BURST_SIMILARITY && delta <= BURST_WINDOW_MS);
    if (!coordinated) continue;
    clusterAuthors.add(item.authorHash);
    if (exact) exactAuthors.add(item.authorHash);
    if (current.threadHash && item.threadHash === current.threadHash) sameThreadAuthors.add(item.authorHash);
    if (delta <= BURST_WINDOW_MS) burstAuthors.add(item.authorHash);
  }

  const clusterSize = clusterAuthors.size;
  if (exactAuthors.size) {
    signals.push({ code: "copy_paste_cluster", weight: exactAuthors.size >= 3 ? 30 : 20, detail: `Identical text posted by ${exactAuthors.size} other account${exactAuthors.size === 1 ? "" : "s"} in the last 24h.` });
  }
  if (clusterSize) {
    const weight = clusterSize >= 5 ? 40 : clusterSize >= 3 ? 30 : clusterSize === 2 ? 20 : 12;
    signals.push({ code: "coordinated_phrasing", weight, detail: `Near-identical phrasing shared with ${clusterSize} other account${clusterSize === 1 ? "" : "s"}.` });
  }
  if (burstAuthors.size >= 2) {
    signals.push({ code: "burst_window", weight: burstAuthors.size >= 4 ? 20 : 12, detail: `${burstAuthors.size} matching accounts posted within 10 minutes.` });
  }
  if (sameThreadAuthors.size >= 2) {
    signals.push({ code: "same_thread_brigade", weight: 10, detail: `${sameThreadAuthors.size} matching accounts converged on the same thread.` });
  }
  if (authorRecent >= 5) {
    signals.push({ code: "author_flood", weight: authorRecent >= 10 ? 35 : 20, detail: `This author posted ${authorRecent} other comments in the last 10 minutes.` });
  }
  if (repeatThreads.size >= 2) {
    signals.push({ code: "self_repeat", weight: 25, detail: `This author posted the same text in ${repeatThreads.size} other threads.` });
  }
  const newAccount = typeof options.authorAccountAgeDays === "number" && options.authorAccountAgeDays >= 0 && options.authorAccountAgeDays < 2;
  if (current.linkCount >= 3 || (current.linkCount >= 1 && newAccount)) {
    signals.push({ code: "link_heavy", weight: current.linkCount >= 3 ? 15 : 10, detail: `${current.linkCount} link${current.linkCount === 1 ? "" : "s"} in the comment.` });
  }
  if (newAccount && signals.length) {
    signals.push({ code: "new_account", weight: 10, detail: "Author account is less than 2 days old." });
  }

  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0));
  return {
    score,
    action: actionForScore(score, options.thresholds),
    signals,
    cluster: { size: clusterSize, sameThread: sameThreadAuthors.size, inBurstWindow: burstAuthors.size },
  };
}
