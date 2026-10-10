import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckoutSummaryModal } from "../components/campaign/CheckoutSummaryModal";

test("checkout discloses first-waiver and referral-only fee savings without reducing tester escrow", () => {
  const first = renderToStaticMarkup(createElement(CheckoutSummaryModal, { testerBountyEscrowCents: 8000, basePlatformFeeCents: 1600, platformTakeRateCents: 0, firstCohort: true, referralDiscountPercent: 0 }));
  assert.match(first, /100% to testers/);
  assert.match(first, /\$80\.00/);
  assert.match(first, /<del[^>]*>\$16\.00<\/del>/);
  assert.match(first, /First Cohort 100% Off Applied/);
  assert.match(first, /currently absorbed/);
  assert.match(first, /Maximum required escrow/);
  const stacked = renderToStaticMarkup(createElement(CheckoutSummaryModal, { testerBountyEscrowCents: 8000, basePlatformFeeCents: 1600, platformTakeRateCents: 400, firstCohort: false, referralDiscountPercent: 75 }));
  assert.match(stacked, /\$84\.00/);
  assert.match(stacked, /up to 75% off platform fees/);
  assert.doesNotMatch(stacked, /First Cohort 100% Off Applied/);
  assert.match(stacked, /never reduce guaranteed tester compensation/);
});
