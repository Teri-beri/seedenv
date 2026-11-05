const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

// In-process per-key sliding window; SeedEnv runs as a single web instance.
export function allowApiRequest(keyId: string, perMinute: number, now = Date.now()) {
  const recent = (hits.get(keyId) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= perMinute) {
    hits.set(keyId, recent);
    return { allowed: false as const, retryAfterSec: Math.max(1, Math.ceil((WINDOW_MS - (now - recent[0])) / 1000)) };
  }
  recent.push(now);
  hits.set(keyId, recent);
  if (hits.size > 10_000) for (const [entry, times] of hits) if (!times.some((time) => now - time < WINDOW_MS)) hits.delete(entry);
  return { allowed: true as const, remaining: perMinute - recent.length };
}

export function resetApiRateLimits() {
  hits.clear();
}
