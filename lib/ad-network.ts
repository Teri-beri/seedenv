/**
 * Rewarded-ad plumbing for the Swarm Detector link tool.
 *
 * A link scan bills a licensed data provider per comment, so each one has to be paid for by a
 * real, completed ad view. This module owns the two halves of that contract:
 *
 *  - the browser half, which loads the network's rewarded SDK and waits for it to report that the
 *    visitor actually finished the ad (not merely that time passed), and
 *  - the configuration half, which decides whether the server should demand a server-to-server
 *    reward postback before releasing provider credit.
 *
 * The scan nonce is handed to the network as its reward id so its postback can be tied back to
 * exactly one pass. Networks name that macro differently; `ymid` is Monetag's, and the postback
 * route accepts the common aliases.
 */

export type AdProvider = "monetag" | "custom" | "none";

export type AdNetworkConfig = {
  provider: AdProvider;
  /** Zone / placement id issued by the network. */
  zoneId: string;
  /** Script the network tells you to embed. */
  sdkUrl: string;
  /** Global function the SDK installs; calling it opens the rewarded ad. */
  globalName: string;
};

export const AD_NETWORK_NONE: AdNetworkConfig = { provider: "none", zoneId: "", sdkUrl: "", globalName: "" };

/** Monetag installs `show_<zoneId>` from a per-publisher SDK host. */
const MONETAG_DEFAULT_SDK_HOST = "https://libtl.com";

type PublicEnv = {
  NEXT_PUBLIC_AD_PROVIDER?: string;
  NEXT_PUBLIC_AD_ZONE_ID?: string;
  NEXT_PUBLIC_AD_SDK_URL?: string;
  NEXT_PUBLIC_AD_GLOBAL?: string;
};

/**
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time, so these must be read as full
 * literal member expressions by the caller. The page passes them in rather than this module
 * reading `process.env` dynamically, which would come back undefined in the browser bundle.
 */
export function resolveAdNetwork(env: PublicEnv): AdNetworkConfig {
  const provider = (env.NEXT_PUBLIC_AD_PROVIDER ?? "").trim().toLowerCase();
  const zoneId = (env.NEXT_PUBLIC_AD_ZONE_ID ?? "").trim();

  if (provider === "monetag") {
    if (!zoneId) return AD_NETWORK_NONE;
    const sdkUrl = (env.NEXT_PUBLIC_AD_SDK_URL ?? "").trim() || `${MONETAG_DEFAULT_SDK_HOST}/sdk.js`;
    return { provider: "monetag", zoneId, sdkUrl, globalName: `show_${zoneId}` };
  }

  if (provider === "custom") {
    const globalName = (env.NEXT_PUBLIC_AD_GLOBAL ?? "").trim();
    const sdkUrl = (env.NEXT_PUBLIC_AD_SDK_URL ?? "").trim();
    if (!globalName || !sdkUrl) return AD_NETWORK_NONE;
    return { provider: "custom", zoneId, sdkUrl, globalName };
  }

  return AD_NETWORK_NONE;
}

export function isAdNetworkConfigured(config: AdNetworkConfig): boolean {
  return config.provider !== "none";
}

/**
 * Whether the server should refuse a pass until the network confirms the view out-of-band.
 *
 * This fails closed on purpose: the moment a postback secret exists, confirmations are mandatory.
 * Opting back out has to be deliberate (`AD_POSTBACK_REQUIRED=0`), because the alternative — a
 * gate that only proves time passed — would let a script drain provider credit without ever
 * loading an ad, which is the exact cost the gate exists to recover.
 */
export function requiresAdPostback(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.AD_POSTBACK_REQUIRED?.trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  return Boolean(env.AD_POSTBACK_SECRET?.trim());
}

type RewardedShow = (options?: Record<string, unknown>) => Promise<unknown>;

const loaded = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const existing = loaded.get(src);
  if (existing) return existing;

  const pending = new Promise<void>((resolve, reject) => {
    const previous = document.querySelector<HTMLScriptElement>(`script[data-ad-sdk="${CSS.escape(src)}"]`);
    if (previous?.dataset.loaded === "true") {
      resolve();
      return;
    }
    const script = previous ?? document.createElement("script");
    script.dataset.adSdk = src;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => {
      loaded.delete(src);
      reject(new Error("ad-sdk-unreachable"));
    });
    if (!previous) {
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  loaded.set(src, pending);
  return pending;
}

/** Test seam so the SDK handshake can be exercised without a network. */
export function resetAdSdkCache() {
  loaded.clear();
}

export type AdPlaybackFailure = "unavailable" | "blocked" | "abandoned";

export class AdPlaybackError extends Error {
  readonly reason: AdPlaybackFailure;
  constructor(reason: AdPlaybackFailure) {
    super(reason);
    this.name = "AdPlaybackError";
    this.reason = reason;
  }
}

/**
 * Opens the rewarded ad and resolves only once the network says the visitor completed it.
 * A rejection here must never unlock a scan — the caller surfaces it and the pass stays unspent.
 */
export async function playRewardedAd(config: AdNetworkConfig, nonce: string): Promise<void> {
  if (config.provider === "none") throw new AdPlaybackError("unavailable");

  try {
    await loadScript(config.sdkUrl);
  } catch {
    // Almost always an ad blocker or a DNS-level filter eating the SDK host.
    throw new AdPlaybackError("blocked");
  }

  const show = (window as unknown as Record<string, unknown>)[config.globalName];
  if (typeof show !== "function") throw new AdPlaybackError("blocked");

  try {
    // `ymid` is the reward id the network echoes back on its postback; `requestVar` is carried by
    // networks that split their macros, and extra keys are ignored by those that do not.
    await (show as RewardedShow)({ ymid: nonce, requestVar: nonce });
  } catch {
    throw new AdPlaybackError("abandoned");
  }
}
