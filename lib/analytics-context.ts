import { createHash } from "node:crypto";

export const ANALYTICS_OPT_OUT_COOKIE = "seedenv_analytics_optout";

const botPattern = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|whatsapp|discordbot|telegrambot|vercel|lighthouse|headless|phantom|puppeteer|playwright|selenium|curl|wget|python-requests|axios|node-fetch|go-http-client|uptime|monitor|pingdom|statuscake/i;

export function isBotUserAgent(userAgent: string | null | undefined) {
  if (!userAgent) return true;
  return botPattern.test(userAgent);
}

export function isLocalHost(host: string | null | undefined) {
  if (!host) return true;
  const hostname = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  return hostname === "localhost"
    || hostname === "0.0.0.0"
    || hostname === "::1"
    || hostname.startsWith("127.")
    || hostname.startsWith("192.168.")
    || hostname.startsWith("10.")
    || hostname.endsWith(".local")
    || hostname.endsWith(".localhost");
}

export function clientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return headers.get("cf-connecting-ip")?.trim() || forwarded || headers.get("x-real-ip")?.trim() || null;
}

export function excludedIps() {
  return new Set((process.env.SEEDENV_ANALYTICS_EXCLUDED_IPS || "").split(",").map((ip) => ip.trim()).filter(Boolean));
}

export function analyticsOwnerEmail() {
  return process.env.SEEDENV_ANALYTICS_OWNER_EMAIL?.trim().toLowerCase() || null;
}

// Daily-rotating visitor hash (Cloudflare/Plausible style): the raw IP is never stored.
export function visitorIdFor(ip: string | null, userAgent: string, secret: string, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return createHash("sha256").update(`${day}|${ip || "unknown"}|${userAgent}|${secret}`).digest("hex").slice(0, 24);
}

export function countryFrom(headers: Headers) {
  const country = headers.get("cf-ipcountry")?.trim().toUpperCase();
  if (!country || country === "XX" || country === "T1" || !/^[A-Z]{2}$/.test(country)) return null;
  return country;
}

export function parseUserAgent(userAgent: string) {
  const ua = userAgent;
  const device = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)
    ? "Tablet"
    : /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)
      ? "Mobile"
      : "Desktop";

  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
      : /SamsungBrowser/.test(ua) ? "Samsung Internet"
        : /FBAN|FBAV|Instagram|Line\/|Twitter|TikTok/i.test(ua) ? "In-app browser"
          : /Firefox\/|FxiOS/.test(ua) ? "Firefox"
            : /Chrome\/|CriOS/.test(ua) ? "Chrome"
              : /Safari\//.test(ua) ? "Safari"
                : "Other";

  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
      : /Windows/.test(ua) ? "Windows"
        : /Mac OS X|Macintosh/.test(ua) ? "macOS"
          : /CrOS/.test(ua) ? "ChromeOS"
            : /Linux/.test(ua) ? "Linux"
              : "Other";

  return { device, browser, os };
}

export function sourceFrom(referrer: unknown, utmSource: unknown, ownHost: string | null) {
  if (typeof utmSource === "string" && utmSource.trim()) return utmSource.trim().toLowerCase().slice(0, 80);
  if (typeof referrer !== "string" || !referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    const own = ownHost?.replace(/:\d+$/, "").replace(/^www\./i, "").toLowerCase();
    if (own && host === own) return null;
    if (isLocalHost(host)) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}
