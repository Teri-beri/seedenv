import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  canonicalizeTarget,
  consumeScanTicket,
  isAdVerified,
  issueScanChallenge,
  markAdVerified,
  refundScanTicket,
  resetScanTickets,
  verifyScanTicket,
} from "../lib/scan-ticket";
import { isAdNetworkConfigured, requiresAdPostback, resolveAdNetwork } from "../lib/ad-network";

const env = { SCAN_TICKET_SECRET: "test-secret-value" } as unknown as NodeJS.ProcessEnv;
const URL_A = "https://www.tiktok.com/@creator/video/12345";
const URL_B = "https://www.tiktok.com/@creator/video/99999";

beforeEach(() => resetScanTickets());

test("a pass is rejected until the watch time has elapsed", () => {
  const now = 1_000_000;
  const { challenge } = issueScanChallenge(URL_A, { env, now, watchMs: 15_000 });

  const early = verifyScanTicket(challenge, URL_A, { env, now: now + 5_000 });
  assert.equal(early.ok, false);
  assert.equal(early.ok === false && early.reason, "too-soon");

  const late = verifyScanTicket(challenge, URL_A, { env, now: now + 15_000 });
  assert.equal(late.ok, true);
});

test("a pass only works for the post it was issued for", () => {
  const now = 1_000_000;
  const { challenge } = issueScanChallenge(URL_A, { env, now, watchMs: 1_000 });

  const wrong = verifyScanTicket(challenge, URL_B, { env, now: now + 5_000 });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.ok === false && wrong.reason, "target");
});

test("a pass is single use, so a second post needs a new ad", () => {
  const now = 1_000_000;
  const { challenge } = issueScanChallenge(URL_A, { env, now, watchMs: 1_000 });

  const first = verifyScanTicket(challenge, URL_A, { env, now: now + 5_000 });
  assert.equal(first.ok, true);
  if (first.ok) consumeScanTicket(first.nonce, now + 5_000);

  const replay = verifyScanTicket(challenge, URL_A, { env, now: now + 6_000 });
  assert.equal(replay.ok, false);
  assert.equal(replay.ok === false && replay.reason, "consumed");
});

test("a pass expires so passes cannot be stockpiled", () => {
  const now = 1_000_000;
  const { challenge } = issueScanChallenge(URL_A, { env, now, watchMs: 1_000 });

  const stale = verifyScanTicket(challenge, URL_A, { env, now: now + 11 * 60 * 1000 });
  assert.equal(stale.ok, false);
  assert.equal(stale.ok === false && stale.reason, "expired");
});

test("a tampered pass is rejected", () => {
  const now = 1_000_000;
  const { challenge } = issueScanChallenge(URL_A, { env, now, watchMs: 1_000 });
  const [body] = challenge.split(".");

  assert.equal(verifyScanTicket(`${body}.forged`, URL_A, { env, now: now + 5_000 }).ok, false);
  assert.equal(verifyScanTicket("garbage", URL_A, { env, now: now + 5_000 }).ok, false);
  assert.equal(verifyScanTicket("", URL_A, { env, now: now + 5_000 }).ok, false);
});

test("a pass signed with a different secret is rejected", () => {
  const now = 1_000_000;
  const { challenge } = issueScanChallenge(URL_A, { env, now, watchMs: 1_000 });
  const other = { SCAN_TICKET_SECRET: "a-completely-different-secret" } as unknown as NodeJS.ProcessEnv;

  assert.equal(verifyScanTicket(challenge, URL_A, { env: other, now: now + 5_000 }).ok, false);
});

test("share and tracking noise does not count as a different post", () => {
  assert.equal(
    canonicalizeTarget("https://www.tiktok.com/@creator/video/12345?utm_source=x&is_from_webapp=1"),
    canonicalizeTarget("https://tiktok.com/@creator/video/12345"),
  );
  assert.notEqual(canonicalizeTarget(URL_A), canonicalizeTarget(URL_B));
});

test("postback mode refuses a pass whose ad view was never confirmed", () => {
  const strict = { ...env, AD_POSTBACK_REQUIRED: "1" } as unknown as NodeJS.ProcessEnv;
  const now = 1_000_000;

  const unconfirmed = issueScanChallenge(URL_A, { env: strict, now, watchMs: 1_000 });
  const blocked = verifyScanTicket(unconfirmed.challenge, URL_A, { env: strict, now: now + 5_000 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.ok === false && blocked.reason, "unverified");

  const confirmed = issueScanChallenge(URL_B, { env: strict, now, watchMs: 1_000 });
  markAdVerified(confirmed.nonce, now + 2_000);
  assert.equal(verifyScanTicket(confirmed.challenge, URL_B, { env: strict, now: now + 5_000 }).ok, true);
});

test("configuring a postback secret makes confirmed ad views mandatory on its own", () => {
  // Fails closed: the secret exists only because a network is sending confirmations, so a pass
  // that never got one must not be able to spend provider credit.
  const live = { ...env, AD_POSTBACK_SECRET: "network-shared-secret" } as unknown as NodeJS.ProcessEnv;
  const now = 1_000_000;

  const pass = issueScanChallenge(URL_A, { env: live, now, watchMs: 1_000 });
  const blocked = verifyScanTicket(pass.challenge, URL_A, { env: live, now: now + 5_000 });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.ok === false && blocked.reason, "unverified");
  assert.equal(isAdVerified(pass.nonce), false);

  markAdVerified(pass.nonce, now + 2_000);
  assert.equal(isAdVerified(pass.nonce), true);
  assert.equal(verifyScanTicket(pass.challenge, URL_A, { env: live, now: now + 5_000 }).ok, true);
});

test("opting out of confirmations has to be explicit", () => {
  const relaxed = {
    ...env,
    AD_POSTBACK_SECRET: "network-shared-secret",
    AD_POSTBACK_REQUIRED: "0",
  } as unknown as NodeJS.ProcessEnv;
  const now = 1_000_000;

  const pass = issueScanChallenge(URL_A, { env: relaxed, now, watchMs: 1_000 });
  assert.equal(verifyScanTicket(pass.challenge, URL_A, { env: relaxed, now: now + 5_000 }).ok, true);
});

test("spending a pass clears its confirmation so the next post needs a new ad", () => {
  const live = { ...env, AD_POSTBACK_SECRET: "network-shared-secret" } as unknown as NodeJS.ProcessEnv;
  const now = 1_000_000;

  const pass = issueScanChallenge(URL_A, { env: live, now, watchMs: 1_000 });
  markAdVerified(pass.nonce, now);
  assert.equal(verifyScanTicket(pass.challenge, URL_A, { env: live, now: now + 5_000 }).ok, true);

  consumeScanTicket(pass.nonce, now + 5_000);
  assert.equal(isAdVerified(pass.nonce), false);
  const replay = verifyScanTicket(pass.challenge, URL_A, { env: live, now: now + 6_000 });
  assert.equal(replay.ok, false);
  assert.equal(replay.ok === false && replay.reason, "consumed");
});

test("ad network config only resolves when a network is actually set up", () => {
  assert.equal(isAdNetworkConfigured(resolveAdNetwork({})), false);
  // A provider without its placement id is a half-finished setup, not a working ad.
  assert.equal(isAdNetworkConfigured(resolveAdNetwork({ NEXT_PUBLIC_AD_PROVIDER: "monetag" })), false);
  assert.equal(
    isAdNetworkConfigured(resolveAdNetwork({ NEXT_PUBLIC_AD_PROVIDER: "custom", NEXT_PUBLIC_AD_ZONE_ID: "9" })),
    false,
  );

  const monetag = resolveAdNetwork({ NEXT_PUBLIC_AD_PROVIDER: "monetag", NEXT_PUBLIC_AD_ZONE_ID: "123456" });
  assert.equal(isAdNetworkConfigured(monetag), true);
  assert.equal(monetag.globalName, "show_123456");
  assert.match(monetag.sdkUrl, /^https:\/\//);

  const custom = resolveAdNetwork({
    NEXT_PUBLIC_AD_PROVIDER: "custom",
    NEXT_PUBLIC_AD_SDK_URL: "https://ads.example/sdk.js",
    NEXT_PUBLIC_AD_GLOBAL: "showReward",
  });
  assert.equal(custom.globalName, "showReward");
});

test("postback requirement tracks the secret", () => {
  assert.equal(requiresAdPostback({} as unknown as NodeJS.ProcessEnv), false);
  assert.equal(requiresAdPostback({ AD_POSTBACK_SECRET: "s" } as unknown as NodeJS.ProcessEnv), true);
  assert.equal(
    requiresAdPostback({ AD_POSTBACK_SECRET: "s", AD_POSTBACK_REQUIRED: "0" } as unknown as NodeJS.ProcessEnv),
    false,
  );
  assert.equal(requiresAdPostback({ AD_POSTBACK_REQUIRED: "1" } as unknown as NodeJS.ProcessEnv), true);
});

test("a pass is handed back when the scan never reached a paid provider", () => {
  const live = { ...env, AD_POSTBACK_SECRET: "network-shared-secret" } as unknown as NodeJS.ProcessEnv;
  const now = 1_000_000;

  const pass = issueScanChallenge(URL_A, { env: live, now, watchMs: 1_000 });
  markAdVerified(pass.nonce, now);
  consumeScanTicket(pass.nonce, now + 5_000);
  refundScanTicket(pass.nonce);

  // The ad still counts, so the visitor retries the same post without watching another.
  assert.equal(isAdVerified(pass.nonce), true);
  assert.equal(verifyScanTicket(pass.challenge, URL_A, { env: live, now: now + 6_000 }).ok, true);
});

test("a refund never resurrects a confirmation the pass never had", () => {
  const now = 1_000_000;
  const pass = issueScanChallenge(URL_A, { env, now, watchMs: 1_000 });
  consumeScanTicket(pass.nonce, now + 5_000);
  refundScanTicket(pass.nonce);
  assert.equal(isAdVerified(pass.nonce), false);
});
