const WINDOW_MS = 10 * 60 * 1000;
const MEMBER_LIMIT = 30;
const VISITOR_LIMIT = 12;
const hits = new Map<string, number[]>();
let day = "";
let dayCount = 0;

// In-process limits: per member/IP burst control plus a daily ceiling that caps model spend.
export function allowSupportChat(key: string, signedIn: boolean, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (dayCount >= Number(process.env.SUPPORT_AI_DAILY_LIMIT || 1500)) return false;
  const recent = (hits.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= (signedIn ? MEMBER_LIMIT : VISITOR_LIMIT)) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  dayCount += 1;
  if (hits.size > 5000) for (const [entry, times] of hits) if (!times.some((time) => now - time < WINDOW_MS)) hits.delete(entry);
  return true;
}

export function resetSupportChatLimits() {
  hits.clear();
  day = "";
  dayCount = 0;
}
