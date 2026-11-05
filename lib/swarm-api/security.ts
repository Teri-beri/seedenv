import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const KEY_PREFIX = "sfk_live_";

export function generateApiKey() {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, KEY_PREFIX.length + 6), keyHash: hashApiKey(key) };
}

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function looksLikeApiKey(value: string) {
  return value.startsWith(KEY_PREFIX) && value.length >= KEY_PREFIX.length + 30 && value.length <= 80 && /^[A-Za-z0-9_-]+$/.test(value);
}

export function readBearerKey(header: string | null) {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match && looksLikeApiKey(match[1]) ? match[1] : null;
}

export function generateWebhookSecret() {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export function generateFingerprintSalt() {
  return randomBytes(32).toString("hex");
}

// Stripe-style signature: `t=<unix>,v1=<hex hmac of "t.body">` so receivers can reject replays.
export function signWebhookPayload(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

export function verifyWebhookSignature(secret: string, body: string, header: string, toleranceSec = 300, now = Math.floor(Date.now() / 1000)) {
  const parts = Object.fromEntries(header.split(",").map((part) => part.split("=", 2) as [string, string]));
  const timestamp = Number(parts.t);
  if (!Number.isInteger(timestamp) || !parts.v1 || Math.abs(now - timestamp) > toleranceSec) return false;
  const expected = Buffer.from(signWebhookPayload(secret, body, timestamp).split("v1=")[1], "hex");
  const received = Buffer.from(parts.v1, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function isPrivateIPv4(address: string) {
  const [a, b] = address.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

export function isPrivateAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family !== 6) return true;
  const value = address.toLowerCase();
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return value === "::" || value === "::1" || /^f[cd]/.test(value) || /^fe[89ab]/.test(value) || value.startsWith("ff") || value.startsWith("64:ff9b:") || value.startsWith("2001:db8");
}

// Static checks for customer webhook URLs; resolution-time checks happen again before each delivery.
export function validateWebhookUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Enter a full https:// URL." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Webhook URLs must use https://." };
  if (url.username || url.password) return { ok: false, error: "Webhook URLs cannot include credentials." };
  if (url.port && url.port !== "443") return { ok: false, error: "Webhook URLs must use the default HTTPS port." };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(host)) return { ok: false, error: "Use a public hostname, not an IP address." };
  if (host === "localhost" || !host.includes(".") || /\.(localhost|local|internal|lan|home|corp)$/.test(host)) return { ok: false, error: "Webhook URLs must point to a public hostname." };
  if (url.toString().length > 500) return { ok: false, error: "Webhook URL is too long." };
  return { ok: true, url: url.toString() };
}

export async function resolvesToPublicAddress(hostname: string) {
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
  } catch {
    return false;
  }
}
