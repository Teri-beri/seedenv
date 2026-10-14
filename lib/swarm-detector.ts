export type SwarmEntry = {
  author: string;
  text: string;
  timestamp: string;
  sortTime: number | null;
  timeOffsetSec: number | null;
};

export type SwarmMetrics = {
  inauthenticityIndex: number;
  label: string;
  narrativeOverlap: number;
  burstDensity: number;
  authorConcentration: number;
  uniqueAuthors: number;
  eventCount: number;
  pipelineStrength: number;
  highRiskThreads: number;
  notes: string[];
};

export type CoordinationResults = {
  flaggedRatio: number;
  duplicatePhrases: string[];
  recurringTokens: string[];
  flaggedAuthors: string[];
};

export type ForensicClassification = {
  quadrant: "Manufactured Hate" | "Synthetic Praise" | "Genuine Backlash" | "Organic Discourse";
  sentimentScore: number;
  sentimentLabel: "Negative" | "Positive" | "Balanced";
  arrivalVelocity: number;
};

const BURST_WINDOW_MS = 10 * 60 * 1000;
const COORDINATION_SIMILARITY = 0.2;
const HIGH_SIMILARITY_WITHOUT_TIME = 0.55;
const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "another",
  "because",
  "been",
  "before",
  "being",
  "comments",
  "could",
  "does",
  "every",
  "from",
  "have",
  "into",
  "just",
  "maybe",
  "more",
  "same",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "thread",
  "through",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your",
]);

export function normalizeTokens(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 2),
    ),
  );
}

export function jaccardSimilarity(left: string[], right: string[]) {
  if (!left.length && !right.length) return 1;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : intersection / union;
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function parseRelativeTimeOffset(value: string) {
  const normalized = value.trim().toLowerCase();
  if (/^(?:now|just now)$/.test(normalized)) return 0;
  if (/^yesterday$/.test(normalized)) return 86_400;
  const match = normalized.match(
    /^(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|months?|mos?|mo|years?|yrs?|y)(?:\s+ago)?$/,
  );
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier = unit.startsWith("s")
    ? 1
    : unit === "m" || unit.startsWith("min")
      ? 60
      : unit === "h" || unit.startsWith("hr")
        ? 3_600
        : unit === "d" || unit.startsWith("day")
          ? 86_400
          : unit === "w" || unit.startsWith("week")
            ? 604_800
            : unit === "mo" || unit.startsWith("mo")
              ? 2_592_000
              : 31_536_000;
  return amount * multiplier;
}

function isSocialUiNoise(line: string) {
  return /^(?:reply|share|like|follow|following|more|see translation|view replies|view \d+ replies?|hide replies)$/i.test(line)
    || /^\d+(?:[.,]\d+)?[kmb]?\s*(?:likes?|reposts?|replies?|shares?|views?)?$/i.test(line);
}

function plainHandle(line: string) {
  const match = line.match(/^@?([a-z0-9._]{2,30})$/i);
  return match?.[1] ?? null;
}

export function sanitizeSocialClipboard(raw: string): SwarmEntry[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const entries: SwarmEntry[] = [];
  let current: { author: string; text: string[]; timestamp: string; timeOffsetSec: number | null } | null = null;
  let expectingAuthor = true;

  const finishCurrent = () => {
    if (!current?.author || !current.text.length) {
      current = null;
      expectingAuthor = true;
      return;
    }
    const text = current.text.join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      entries.push({
        author: current.author,
        text,
        timestamp: current.timestamp,
        timeOffsetSec: current.timeOffsetSec,
        sortTime: current.timeOffsetSec === null ? null : -current.timeOffsetSec * 1_000,
      });
    }
    current = null;
    expectingAuthor = true;
  };

  for (const line of lines) {
    if (isSocialUiNoise(line)) continue;

    const combinedHeader = line.match(/^@?([a-z0-9._]{2,30})\s*(?:[·•]\s*|\s+)(.+)$/i);
    const combinedOffset = combinedHeader ? parseRelativeTimeOffset(combinedHeader[2]) : null;
    if (combinedHeader && combinedOffset !== null) {
      finishCurrent();
      current = {
        author: combinedHeader[1],
        text: [],
        timestamp: combinedHeader[2],
        timeOffsetSec: combinedOffset,
      };
      expectingAuthor = false;
      continue;
    }

    const offset = parseRelativeTimeOffset(line);
    if (offset !== null) {
      if (current) {
        current.timestamp = line;
        current.timeOffsetSec = offset;
        if (current.text.length) finishCurrent();
      }
      continue;
    }

    const handle = plainHandle(line);
    const looksLikeBareHandle = Boolean(handle && (/[._\d]/.test(line) || line === line.toLowerCase()));
    const followsCompletedHeaderRecord = Boolean(current?.timeOffsetSec !== null && current?.text.length && looksLikeBareHandle);
    if (handle && (expectingAuthor || line.startsWith("@") || followsCompletedHeaderRecord)) {
      finishCurrent();
      current = { author: handle, text: [], timestamp: "", timeOffsetSec: null };
      expectingAuthor = false;
      continue;
    }

    if (current) {
      current.text.push(line);
      expectingAuthor = false;
    }
  }
  finishCurrent();
  return entries;
}

export function parseSwarmInput(raw: string): SwarmEntry[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
        .map((item) => {
          const rawOffset = typeof item.timeOffsetSec === "number" && Number.isFinite(item.timeOffsetSec)
            ? Math.max(0, item.timeOffsetSec)
            : null;
          const timestamp = String(item.timestamp ?? item.time ?? item.createdAt ?? (rawOffset === null ? "" : `${rawOffset}s ago`));
          return {
            author: String(item.author ?? item.user ?? item.username ?? "unknown").trim(),
            text: String(item.text ?? item.comment ?? item.message ?? "").trim(),
            timestamp,
            timeOffsetSec: rawOffset,
            sortTime: rawOffset === null ? parseTimestamp(timestamp) : -rawOffset * 1_000,
          };
        })
        .filter((item) => item.author.length > 0 && item.text.length > 0);
    } catch {
      return [];
    }
  }

  const delimitedEntries = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): SwarmEntry | null => {
      const segments = line.split(/\s*\|\s*/).map((segment) => segment.trim());
      if (segments.length < 3) return null;
      const author = segments[0];
      const timestamp = segments.at(-1) ?? "";
      const text = segments.slice(1, -1).join(" | ");
      return { author, text, timestamp, sortTime: parseTimestamp(timestamp), timeOffsetSec: null };
    })
    .filter((item): item is SwarmEntry => Boolean(item?.author && item.text));
  return delimitedEntries.length ? delimitedEntries : sanitizeSocialClipboard(trimmed);
}

export function analyzeCoordination(entries: SwarmEntry[]): CoordinationResults {
  const tokenMatrix = entries.map((entry) => normalizeTokens(entry.text));
  const flaggedIndexes = new Set<number>();
  const coordinationCounts = new Map<number, number>();

  for (let index = 0; index < entries.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < entries.length; compareIndex += 1) {
      const similarity = jaccardSimilarity(tokenMatrix[index], tokenMatrix[compareIndex]);
      const leftTime = entries[index].sortTime;
      const rightTime = entries[compareIndex].sortTime;
      const withinBurstWindow = leftTime !== null
        && rightTime !== null
        && Math.abs(leftTime - rightTime) <= BURST_WINDOW_MS;
      const coordinated = similarity >= HIGH_SIMILARITY_WITHOUT_TIME
        || (similarity >= COORDINATION_SIMILARITY && withinBurstWindow);

      if (!coordinated) continue;
      flaggedIndexes.add(index);
      flaggedIndexes.add(compareIndex);
      coordinationCounts.set(index, (coordinationCounts.get(index) ?? 0) + 1);
      coordinationCounts.set(compareIndex, (coordinationCounts.get(compareIndex) ?? 0) + 1);
    }
  }

  const flaggedAuthors = new Set<string>();
  flaggedIndexes.forEach((index) => flaggedAuthors.add(entries[index].author.trim().toLowerCase()));
  const uniqueAuthors = new Set(entries.map((entry) => entry.author.trim().toLowerCase()));

  const phraseIndexes = [...flaggedIndexes]
    .sort((left, right) => (coordinationCounts.get(right) ?? 0) - (coordinationCounts.get(left) ?? 0) || left - right)
    .slice(0, 6);
  const duplicatePhrases = [...new Set(phraseIndexes.map((index) => entries[index].text.trim()))];

  const tokenCounts = new Map<string, number>();
  flaggedIndexes.forEach((index) => {
    tokenMatrix[index].forEach((token) => {
      if (token.length < 4 || STOP_WORDS.has(token)) return;
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
    });
  });
  const recurringTokens = [...tokenCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([token]) => token);

  return {
    flaggedRatio: uniqueAuthors.size ? Math.round((flaggedAuthors.size / uniqueAuthors.size) * 100) : 0,
    duplicatePhrases,
    recurringTokens,
    flaggedAuthors: [...flaggedAuthors].sort(),
  };
}

export function computeSwarmMetrics(entries: SwarmEntry[]): SwarmMetrics {
  if (!entries.length) {
    return {
      inauthenticityIndex: 0,
      label: "No signal",
      narrativeOverlap: 0,
      burstDensity: 0,
      authorConcentration: 0,
      uniqueAuthors: 0,
      eventCount: 0,
      pipelineStrength: 0,
      highRiskThreads: 0,
      notes: ["Add raw comment data to start the audit."],
    };
  }

  const total = entries.length;
  const authorCounts = new Map<string, number>();
  entries.forEach((entry) => {
    const normalizedAuthor = entry.author.toLowerCase();
    authorCounts.set(normalizedAuthor, (authorCounts.get(normalizedAuthor) ?? 0) + 1);
  });

  const uniqueAuthors = authorCounts.size;
  const authorConcentration = Math.max(...authorCounts.values()) / total;
  const tokenMatrix = entries.map((entry) => normalizeTokens(entry.text));
  const pairScores: number[] = [];

  for (let index = 0; index < tokenMatrix.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < tokenMatrix.length; compareIndex += 1) {
      const similarity = jaccardSimilarity(tokenMatrix[index], tokenMatrix[compareIndex]);
      if (similarity > 0.12) pairScores.push(similarity);
    }
  }

  const narrativeOverlap = pairScores.length
    ? pairScores.reduce((sum, value) => sum + value, 0) / pairScores.length
    : 0;

  const timestampedEntries = entries
    .filter((entry): entry is SwarmEntry & { sortTime: number } => entry.sortTime !== null)
    .sort((left, right) => left.sortTime - right.sortTime);
  let maxBurst = 0;
  for (let start = 0; start < timestampedEntries.length; start += 1) {
    let end = start;
    while (
      end < timestampedEntries.length
      && timestampedEntries[end].sortTime - timestampedEntries[start].sortTime <= BURST_WINDOW_MS
    ) {
      end += 1;
    }
    maxBurst = Math.max(maxBurst, end - start);
  }
  const burstDensity = timestampedEntries.length > 1
    ? Math.min(1, maxBurst / Math.max(2, Math.ceil(timestampedEntries.length * 0.4)))
    : 0;

  const normalizedTextCounts = new Map<string, number>();
  tokenMatrix.forEach((tokens) => {
    const key = tokens.join(" ");
    normalizedTextCounts.set(key, (normalizedTextCounts.get(key) ?? 0) + 1);
  });
  const repeatedTextCount = [...normalizedTextCounts.values()]
    .filter((count) => count > 1)
    .reduce((sum, count) => sum + count, 0);
  const repeatedTextRate = repeatedTextCount / total;
  const distributedSignal = Math.min(1, uniqueAuthors / Math.max(2, total * 0.5));

  const inauthenticityIndex = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        (
          narrativeOverlap * 0.46
          + burstDensity * 0.27
          + authorConcentration * 0.16
          + repeatedTextRate * 0.07
          + (1 - distributedSignal) * 0.04
        ) * 100,
      ),
    ),
  );
  const pipelineStrength = Math.min(
    100,
    Math.round((narrativeOverlap * 0.4 + burstDensity * 0.35 + authorConcentration * 0.25) * 100),
  );
  const highRiskThreads = Math.max(0, Math.round((inauthenticityIndex / 100) * 6));

  let label = "Stable";
  if (inauthenticityIndex >= 80) label = "Critical swarm";
  else if (inauthenticityIndex >= 60) label = "Elevated risk";
  else if (inauthenticityIndex >= 35) label = "Watchlist";

  const notes = [
    narrativeOverlap > 0.2
      ? "Narrative overlap is elevated across the comment set."
      : "Narrative overlap is low and more organic.",
    timestampedEntries.length < 2
      ? "At least two valid timestamps are required to measure temporal bursts."
      : burstDensity > 0.5
        ? "Temporal bursts cluster in a short window, which is a common coordination fingerprint."
        : "Activity is spread through time without a tight burst pattern.",
    authorConcentration > 0.35
      ? "A few accounts dominate the event volume."
      : "Comment volume is more evenly distributed across participants.",
  ];

  return {
    inauthenticityIndex,
    label,
    narrativeOverlap,
    burstDensity,
    authorConcentration,
    uniqueAuthors,
    eventCount: total,
    pipelineStrength,
    highRiskThreads,
    notes,
  };
}

const POSITIVE_SENTIMENT = new Set([
  "amazing", "best", "better", "clean", "easy", "excellent", "fast", "good", "great", "helpful", "improved", "love", "perfect", "recommend", "smooth", "useful", "works",
]);
const NEGATIVE_SENTIMENT = new Set([
  "awful", "bad", "broken", "cancel", "corrupt", "crash", "dishonest", "fail", "fake", "fraud", "freezing", "hate", "hidden", "horrible", "lie", "scam", "slow", "terrible", "unacceptable", "worst",
]);

export function classifyForensics(
  entries: SwarmEntry[],
  metrics: SwarmMetrics,
  coordination: CoordinationResults,
): ForensicClassification {
  let positive = 0;
  let negative = 0;
  entries.forEach((entry) => {
    normalizeTokens(entry.text).forEach((token) => {
      if (POSITIVE_SENTIMENT.has(token)) positive += 1;
      if (NEGATIVE_SENTIMENT.has(token)) negative += 1;
    });
  });
  const sentimentTotal = positive + negative;
  const sentimentScore = sentimentTotal ? (positive - negative) / sentimentTotal : 0;
  const sentimentLabel = sentimentScore <= -0.15 ? "Negative" : sentimentScore >= 0.15 ? "Positive" : "Balanced";
  const highSwarm = metrics.inauthenticityIndex >= 35 || coordination.flaggedRatio >= 35;
  const quadrant = highSwarm
    ? sentimentScore < 0
      ? "Manufactured Hate"
      : "Synthetic Praise"
    : sentimentLabel === "Negative"
      ? "Genuine Backlash"
      : "Organic Discourse";

  const times = entries
    .map((entry) => entry.sortTime)
    .filter((time): time is number => time !== null)
    .sort((left, right) => left - right);
  const durationSeconds = times.length > 1 ? Math.max(1, (times.at(-1)! - times[0]) / 1_000) : 0;
  const arrivalVelocity = durationSeconds ? entries.length / durationSeconds : 0;

  return {
    quadrant,
    sentimentScore: Math.round(sentimentScore * 100) / 100,
    sentimentLabel,
    arrivalVelocity: Math.round(arrivalVelocity * 1_000) / 1_000,
  };
}
