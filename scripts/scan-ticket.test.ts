import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import {
  canonicalizeTarget,
  consumeScanTicket,
  issueScanChallenge,
  markAdVerified,
  resetScanTickets,
  verifyScanTicket,
} from "../lib/scan-ticket";

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
