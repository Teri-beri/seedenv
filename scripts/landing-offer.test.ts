import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingPlatformFeeOfferCard } from "../components/landing-platform-fee-offer";
import { PricingCalculator } from "../components/PricingCalculator";

test("landing fee offer explains its actual scope, code, capacity and expiry", () => {
  const html = renderToStaticMarkup(createElement(LandingPlatformFeeOfferCard, {
    offer: { code: "FIRSTDROP", remaining: 17, expiresAt: "2026-10-24T00:00:00.000Z" },
  }));
  for (const text of ["0% SeedEnv platform fees", "FIRSTDROP", "17 redemption", "2026-10-24", "UTC"]) assert.ok(html.includes(text), text);
  assert.ok(html.includes('aria-label="Copy promo code FIRSTDROP"'));
  assert.ok(!html.includes("Launch with zero fees"));
  assert.ok(!html.includes("Budget step"));
  assert.ok(!html.includes("free testers"));
});

test("pricing calculator applies the active landing promo to its default estimate", () => {
  const html = renderToStaticMarkup(createElement(PricingCalculator, {
    href: "/auth/signin?role=DEVELOPER&callbackUrl=%2Fconsole%3Fview%3Dnew-drop",
    promoCode: "FIRSTDROP",
  }));
  for (const text of ["Apply FIRSTDROP", "0% platform fee", "$0.00", "Unused escrow refundable anytime", "No card transaction surcharges", "$15 minimum fee before discounts"]) assert.ok(html.includes(text), text);
  assert.ok(html.includes('aria-pressed="true"'));
  assert.ok(html.includes("line-through"));
});
