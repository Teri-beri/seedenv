import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingPlatformFeeOfferCard } from "../components/landing-platform-fee-offer";

test("landing fee offer explains its actual scope, code, capacity and expiry", () => {
  const html = renderToStaticMarkup(createElement(LandingPlatformFeeOfferCard, {
    offer: { code: "FIRSTDROP", remaining: 17, expiresAt: "2026-10-24T00:00:00.000Z" },
    href: "/auth/signin?role=DEVELOPER&callbackUrl=%2Fconsole%3Fview%3Dnew-drop",
  }));
  for (const text of ["100% off SeedEnv platform fees", "FIRSTDROP", "17 redemption", "2026-10-24", "UTC", "Budget step", "Tester rewards must still be funded in full", "Not valid for Clippers", "One paid cohort per developer"]) assert.ok(html.includes(text), text);
  assert.ok(html.includes('aria-label="Copy promo code FIRSTDROP"'));
  assert.ok(html.includes('href="/auth/signin?role=DEVELOPER'));
  assert.ok(!html.includes("free testers"));
});
