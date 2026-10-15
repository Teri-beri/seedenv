export type LinkPlatform = "reddit" | "tiktok" | "x" | "instagram" | "youtube";

export type FetchedComment = {
  author: string;
  text: string;
  timeOffsetSec: number | null;
};

export type LinkFetchResult =
  | { status: "ok"; platform: LinkPlatform; source: string; comments: FetchedComment[] }
  | { status: "guidance"; platform: LinkPlatform; message: string };

const PLATFORM_HOSTS: Array<{ platform: LinkPlatform; hosts: string[] }> = [
  { platform: "reddit", hosts: ["reddit.com", "old.reddit.com", "np.reddit.com"] },
  { platform: "tiktok", hosts: ["tiktok.com"] },
  { platform: "x", hosts: ["x.com", "twitter.com"] },
  { platform: "instagram", hosts: ["instagram.com"] },
  { platform: "youtube", hosts: ["youtube.com", "youtu.be"] },
];

export const SUPPORTED_LINK_DOMAINS = PLATFORM_HOSTS.flatMap((entry) => entry.hosts);

/**
 * Resolves a user-supplied link to a supported platform. Rejects anything that is not a plain
 * https URL on an allow-listed host so the route can never be used as an SSRF relay.
 */
export function detectLinkPlatform(value: string): { platform: LinkPlatform; url: URL } | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const entry of PLATFORM_HOSTS) {
    if (entry.hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
      return { platform: entry.platform, url };
    }
  }
  return null;
}

/** Reddit serves any permalink as JSON by appending `.json`, so no scraping is needed. */
export function buildRedditJsonUrl(url: URL, options: { limit?: number; oauth?: boolean } = {}) {
  const { limit = 200, oauth = false } = options;
  const path = url.pathname.replace(/\/+$/, "").replace(/\.json$/i, "");
  const jsonUrl = new URL(oauth ? `https://oauth.reddit.com${path}` : `https://www.reddit.com${path}.json`);
  jsonUrl.searchParams.set("limit", String(limit));
  jsonUrl.searchParams.set("raw_json", "1");
  return jsonUrl.toString();
}

type RedditNode = {
  kind?: unknown;
  data?: {
    author?: unknown;
    body?: unknown;
    created_utc?: unknown;
    children?: unknown;
    replies?: unknown;
  };
};

/** Walks a Reddit listing (comments plus nested replies) into flat forensic records. */
export function parseRedditListing(payload: unknown, max = 400): FetchedComment[] {
  const collected: Array<{ author: string; text: string; createdUtc: number | null }> = [];

  const visit = (node: unknown) => {
    if (collected.length >= max || !node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;
    const typed = node as RedditNode;
    const data = typed.data;
    if (data) {
      if (typed.kind === "t1") {
        const author = typeof data.author === "string" ? data.author.trim() : "";
        const text = typeof data.body === "string" ? data.body.trim() : "";
        const createdUtc = typeof data.created_utc === "number" && Number.isFinite(data.created_utc) ? data.created_utc : null;
        if (author && text && author !== "[deleted]" && text !== "[deleted]" && text !== "[removed]") {
          collected.push({ author, text, createdUtc });
        }
      }
      if (data.children) visit(data.children);
      if (data.replies) visit(data.replies);
    }
  };

  visit(payload);

  const newest = collected.reduce<number | null>(
    (max2, item) => (item.createdUtc === null ? max2 : max2 === null ? item.createdUtc : Math.max(max2, item.createdUtc)),
    null,
  );
  return collected.map((item) => ({
    author: item.author,
    text: item.text,
    timeOffsetSec: item.createdUtc === null || newest === null ? null : Math.max(0, Math.round(newest - item.createdUtc)),
  }));
}

type ProviderItem = Record<string, unknown>;

function firstString(item: ProviderItem, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const nested = (value as ProviderItem).name ?? (value as ProviderItem).username ?? (value as ProviderItem).uniqueId;
      if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
  }
  return "";
}

function toEpochSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value > 1e11 ? Math.round(value / 1000) : Math.round(value);
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.round(parsed / 1000);
  }
  return null;
}

/** Normalizes third-party dataset rows (Apify actors and similar) into forensic records. */
export function normalizeProviderItems(items: unknown, max = 400): FetchedComment[] {
  if (!Array.isArray(items)) return [];
  const rows = items
    .filter((item): item is ProviderItem => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .slice(0, max)
    .map((item) => ({
      author: firstString(item, ["author", "username", "uniqueId", "ownerUsername", "user", "userName", "handle"]),
      text: firstString(item, ["text", "comment", "message", "body", "content"]),
      createdSec: toEpochSeconds(item.timestamp ?? item.createdAt ?? item.created_at ?? item.createTimeISO ?? item.createTime ?? item.publishedAt),
    }))
    .filter((item) => item.author && item.text);

  const newest = rows.reduce<number | null>(
    (max2, item) => (item.createdSec === null ? max2 : max2 === null ? item.createdSec : Math.max(max2, item.createdSec)),
    null,
  );
  return rows.map((item) => ({
    author: item.author,
    text: item.text,
    timeOffsetSec: item.createdSec === null || newest === null ? null : Math.max(0, newest - item.createdSec),
  }));
}

const PROVIDER_ACTOR_ENV: Record<Exclude<LinkPlatform, "reddit">, string> = {
  tiktok: "APIFY_TIKTOK_COMMENTS_ACTOR",
  x: "APIFY_X_COMMENTS_ACTOR",
  instagram: "APIFY_INSTAGRAM_COMMENTS_ACTOR",
  youtube: "APIFY_YOUTUBE_COMMENTS_ACTOR",
};

export function providerActorFor(platform: LinkPlatform, env: NodeJS.ProcessEnv = process.env) {
  if (platform === "reddit") return null;
  if (!env.APIFY_TOKEN) return null;
  const actor = env[PROVIDER_ACTOR_ENV[platform]];
  return actor && actor.trim() ? { actor: actor.trim(), token: env.APIFY_TOKEN } : null;
}

export const PLATFORM_GUIDANCE: Record<LinkPlatform, string> = {
  reddit: "Reddit didn’t return readable comments for that link — it blocks anonymous requests from most servers. Copy the comments from the thread and paste them in the “Paste Comments” tab for instant offline processing.",
  tiktok: "TikTok blocks direct server requests without an authenticated session. Open the post in your browser, copy the comments, and paste them in the “Paste Comments” tab for instant offline processing.",
  x: "X blocks direct server requests without an authenticated session. Open the post in your browser, copy the replies, and paste them in the “Paste Comments” tab for instant offline processing.",
  instagram: "Instagram requires a logged-in session to read comments. Open the post in your browser, copy the comments, and paste them in the “Paste Comments” tab for instant offline processing.",
  youtube: "YouTube comments load behind a dynamic player request. Open the video in your browser, copy the comments, and paste them in the “Paste Comments” tab for instant offline processing.",
};

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, redirect: "follow", cache: "no-store" });
    if (!response.ok) throw new Error(`Upstream responded with ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const REDDIT_USER_AGENT = "web:com.seedenv.swarmforensics:1.0 (+https://seedenv.com/tools/swarm-detector)";

let redditToken: { value: string; expiresAt: number } | null = null;

/**
 * Reddit blocks anonymous JSON from most datacenter IPs, so prefer the documented app-only
 * OAuth flow when credentials exist and keep the public endpoint as a fallback.
 */
async function redditAccessToken(env: NodeJS.ProcessEnv, timeoutMs: number): Promise<string | null> {
  const id = env.REDDIT_CLIENT_ID?.trim();
  const secret = env.REDDIT_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;
  if (redditToken && redditToken.expiresAt > Date.now() + 30_000) return redditToken.value;

  try {
    const payload = (await fetchJson(
      "https://www.reddit.com/api/v1/access_token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": REDDIT_USER_AGENT,
        },
        body: "grant_type=client_credentials",
      },
      timeoutMs,
    )) as { access_token?: unknown; expires_in?: unknown };

    if (typeof payload.access_token !== "string" || !payload.access_token) return null;
    const ttl = typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in) ? payload.expires_in : 3600;
    redditToken = { value: payload.access_token, expiresAt: Date.now() + ttl * 1000 };
    return redditToken.value;
  } catch {
    return null;
  }
}

export function resetRedditToken() {
  redditToken = null;
}

async function fetchRedditComments(url: URL, timeoutMs: number, env: NodeJS.ProcessEnv): Promise<{ comments: FetchedComment[]; source: string }> {
  const token = await redditAccessToken(env, timeoutMs);
  if (token) {
    const payload = await fetchJson(
      buildRedditJsonUrl(url, { oauth: true }),
      { headers: { Authorization: `Bearer ${token}`, "User-Agent": REDDIT_USER_AGENT, Accept: "application/json" } },
      timeoutMs,
    );
    return { comments: parseRedditListing(payload), source: "Reddit API (app-only OAuth)" };
  }
  const payload = await fetchJson(
    buildRedditJsonUrl(url),
    { headers: { "User-Agent": REDDIT_USER_AGENT, Accept: "application/json" } },
    timeoutMs,
  );
  return { comments: parseRedditListing(payload), source: "Reddit public JSON" };
}

/**
 * Hard ceiling on comments pulled per scan. The detector's statistics converge long before this,
 * and the provider bills per comment, so the cap is what keeps one viral post from costing more
 * than the ad view that paid for it.
 */
const COMMENT_CAP = Math.min(
  Math.max(Number.parseInt(process.env.LINK_COMMENT_CAP ?? "", 10) || 150, 25),
  500,
);

export async function fetchCommentsForLink(  platform: LinkPlatform,
  url: URL,
  options: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<LinkFetchResult> {
  const timeoutMs = options.timeoutMs ?? 9_000;
  const env = options.env ?? process.env;

  if (platform === "reddit") {
    try {
      const { comments, source } = await fetchRedditComments(url, timeoutMs, env);
      if (comments.length < 2) return { status: "guidance", platform, message: PLATFORM_GUIDANCE.reddit };
      return { status: "ok", platform, source, comments };
    } catch {
      return { status: "guidance", platform, message: PLATFORM_GUIDANCE.reddit };
    }
  }

  const provider = providerActorFor(platform, env);
  if (!provider) return { status: "guidance", platform, message: PLATFORM_GUIDANCE[platform] };

  try {
    const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(provider.actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(provider.token)}&maxItems=${COMMENT_CAP}`;
    const payload = await fetchJson(
      endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Providers bill per comment returned and each actor names its cap differently, so send
        // every known spelling. An uncapped scan of a viral post can cost many dollars.
        body: JSON.stringify({
          postURLs: [url.toString()],
          startUrls: [{ url: url.toString() }],
          maxItems: COMMENT_CAP,
          maxComments: COMMENT_CAP,
          commentsPerPost: COMMENT_CAP,
          resultsLimit: COMMENT_CAP,
          limit: COMMENT_CAP,
          maxRepliesPerComment: 0,
        }),
      },
      timeoutMs * 4,
    );
    const comments = normalizeProviderItems(payload);
    if (comments.length < 2) return { status: "guidance", platform, message: PLATFORM_GUIDANCE[platform] };
    return { status: "ok", platform, source: "Licensed data provider", comments };
  } catch {
    return { status: "guidance", platform, message: PLATFORM_GUIDANCE[platform] };
  }
}

const WINDOW_MS = 10 * 60 * 1000;
const WINDOW_LIMIT = 10;
const hits = new Map<string, number[]>();

/** In-process burst control: link fetches hit third-party hosts, so visitors get a small budget. */
export function allowLinkFetch(key: string, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= WINDOW_LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [entry, times] of hits) if (!times.some((time) => now - time < WINDOW_MS)) hits.delete(entry);
  return true;
}

export function resetLinkFetchLimits() {
  hits.clear();
}
