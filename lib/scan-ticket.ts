import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Link scans cost real money (each one bills a licensed data provider per comment), so every scan
 * has to be paid for by an ad view. The gate is enforced here rather than in the browser: the
 * server issues a signed, URL-bound, single-use challenge and refuses to spend provider credit
 * until that same challenge comes back having satisfied the watch time.
 */

/** How long a visitor must sit with the ad open before a challenge becomes redeemable. */
export const AD_WATCH_MS = 15_000;
/** A challenge goes stale well before it can be stockpiled. */
const TICKET_TTL_MS = 10 * 60 * 1000;
/** Browser timers drift slightly ahead of the server clock; forgive a small amount. */
const CLOCK_SKEW_MS = 1_500;

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "igshid", "si", "is_from_webapp", "sender_device", "web_id", "_r", "_t",
]);

export type ScanChallenge = { challenge: string; watchMs: number; nonce: string };

export type TicketFailure =
  | "malformed"
  | "signature"
  | "target"
  | "too-soon"
  | "expired"
  | "consumed"
  | "unverified";

export type TicketVerification =
  | { ok: true; nonce: string }
  | { ok: false; reason: TicketFailure; message: string };

type TicketPayload = { n: string; t: string; i: number; w: number };

/**
 * Two links that point at the same post should not each demand their own ad, but two genuinely
 * different posts must. Dropping share/tracking noise keeps that promise in both directions.
 */
export function canonicalizeTarget(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return createHash("sha256").update(url.trim().toLowerCase()).digest("hex").slice(0, 32);
  }
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  parsed.protocol = "https:";
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) parsed.searchParams.delete(key);
  }
  parsed.searchParams.sort();
  const normalized = parsed.toString().replace(/\/+$/, "").toLowerCase();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

let fallbackSecret: string | null = null;

function ticketSecret(env: NodeJS.ProcessEnv): string {
  const configured = env.SCAN_TICKET_SECRET?.trim() || env.NEXTAUTH_SECRET?.trim();
  if (configured) return configured;
  // Keeps local development working without extra setup. Tickets die with the process, which is
  // the safe direction to fail: visitors re-watch rather than scans becoming free.
  fallbackSecret ??= randomBytes(32).toString("hex");
  return fallbackSecret;
}

const encode = (value: Buffer | string) => Buffer.from(value).toString("base64url");

function sign(body: string, env: NodeJS.ProcessEnv) {
  return createHmac("sha256", ticketSecret(env)).update(body).digest("base64url");
}

export function issueScanChallenge(
  url: string,
  options: { env?: NodeJS.ProcessEnv; now?: number; watchMs?: number } = {},
): ScanChallenge {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();
  const watchMs = options.watchMs ?? adWatchMs(env);
  const payload: TicketPayload = {
    n: randomBytes(12).toString("base64url"),
    t: canonicalizeTarget(url),
    i: now,
    w: watchMs,
  };
  const body = encode(JSON.stringify(payload));
  return { challenge: `${body}.${sign(body, env)}`, watchMs, nonce: payload.n };
}

export function adWatchMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseInt(env.AD_WATCH_SECONDS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 5 && raw <= 60) return raw * 1_000;
  return AD_WATCH_MS;
}

export function verifyScanTicket(
  challenge: string,
  url: string,
  options: { env?: NodeJS.ProcessEnv; now?: number } = {},
): TicketVerification {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now();

  const [body, signature] = challenge.split(".");
  if (!body || !signature) {
    return { ok: false, reason: "malformed", message: "That scan pass isn't valid. Start the scan again." };
  }

  const expected = sign(body, env);
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return { ok: false, reason: "signature", message: "That scan pass isn't valid. Start the scan again." };
  }

  let payload: TicketPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TicketPayload;
  } catch {
    return { ok: false, reason: "malformed", message: "That scan pass isn't valid. Start the scan again." };
  }
  if (!payload?.n || !payload.t || typeof payload.i !== "number") {
    return { ok: false, reason: "malformed", message: "That scan pass isn't valid. Start the scan again." };
  }

  if (payload.t !== canonicalizeTarget(url)) {
    return {
      ok: false,
      reason: "target",
      message: "That pass was issued for a different post. Each post needs its own scan.",
    };
  }

  const elapsed = now - payload.i;
  if (elapsed + CLOCK_SKEW_MS < payload.w) {
    return { ok: false, reason: "too-soon", message: "Finish the ad to unlock this scan." };
  }
  if (elapsed > TICKET_TTL_MS) {
    return { ok: false, reason: "expired", message: "That scan pass expired. Start the scan again." };
  }
  if (consumed.has(payload.n)) {
    return {
      ok: false,
      reason: "consumed",
      message: "That scan pass was already used. Watch a new ad to scan another post.",
    };
  }
  if (env.AD_POSTBACK_REQUIRED === "1" && !adVerified.has(payload.n)) {
    return { ok: false, reason: "unverified", message: "The ad view wasn't confirmed yet. Try the scan again." };
  }

  return { ok: true, nonce: payload.n };
}

const consumed = new Map<string, number>();
const adVerified = new Map<string, number>();

function sweep(store: Map<string, number>, now: number) {
  if (store.size <= 5_000) return;
  for (const [key, expiry] of store) if (expiry <= now) store.delete(key);
}

/** Single-use: burning the nonce is what forces a fresh ad for the next post. */
export function consumeScanTicket(nonce: string, now = Date.now()) {
  consumed.set(nonce, now + TICKET_TTL_MS);
  adVerified.delete(nonce);
  sweep(consumed, now);
}

/** Called by an ad network's server-to-server reward postback once one is wired up. */
export function markAdVerified(nonce: string, now = Date.now()) {
  adVerified.set(nonce, now + TICKET_TTL_MS);
  sweep(adVerified, now);
}

export function resetScanTickets() {
  consumed.clear();
  adVerified.clear();
}
