import assert from "node:assert/strict";
import test from "node:test";
import { fillGuaranteeDeadline, fillGuaranteeVested, fillGuaranteeWindowMs } from "../lib/fill-guarantee";

const launchedAt = new Date("2026-03-01T00:00:00.000Z");
const afterWindow = new Date(launchedAt.getTime() + fillGuaranteeWindowMs + 1000);

function campaign(overrides: Partial<Parameters<typeof fillGuaranteeVested>[0]> = {}) {
  return {
    fundingModel: "PREPAID" as const,
    status: "ACTIVE" as const,
    launchedAt,
    cancelledAt: null,
    totalSlots: 12,
    claimedSlots: 3,
    fillGuaranteeCreditedCents: 0,
    ...overrides,
  };
}

test("the fill window is exactly four hours from launch", () => {
  assert.equal(fillGuaranteeWindowMs, 4 * 60 * 60 * 1000);
  assert.equal(fillGuaranteeDeadline(launchedAt).toISOString(), "2026-03-01T04:00:00.000Z");
});

test("an unfilled prepaid cohort vests only once the window has closed", () => {
  assert.equal(fillGuaranteeVested(campaign(), new Date(launchedAt.getTime() + fillGuaranteeWindowMs - 1000)), false);
  assert.equal(fillGuaranteeVested(campaign(), afterWindow), true);
  // The boundary itself counts as closed so a cohort cannot sit unpaid on an exact tick.
  assert.equal(fillGuaranteeVested(campaign(), fillGuaranteeDeadline(launchedAt)), true);
});

test("a cohort that filled in time owes nothing", () => {
  assert.equal(fillGuaranteeVested(campaign({ claimedSlots: 12 }), afterWindow), false);
  assert.equal(fillGuaranteeVested(campaign({ claimedSlots: 13 }), afterWindow), false);
});

test("pay-per-tester cohorts are excluded because unfilled places are never charged", () => {
  assert.equal(fillGuaranteeVested(campaign({ fundingModel: "PAY_PER_TESTER" }), afterWindow), false);
});

test("the credit never runs twice and never runs before launch", () => {
  assert.equal(fillGuaranteeVested(campaign({ fillGuaranteeCreditedCents: 4200 }), afterWindow), false);
  assert.equal(fillGuaranteeVested(campaign({ launchedAt: null }), afterWindow), false);
});

test("ending the cohort before the window closes forfeits the guarantee, after it does not", () => {
  const cancelledEarly = new Date(launchedAt.getTime() + 60 * 60 * 1000);
  assert.equal(fillGuaranteeVested(campaign({ cancelledAt: cancelledEarly, status: "PAUSED" }), afterWindow), false);
  const cancelledLate = new Date(launchedAt.getTime() + fillGuaranteeWindowMs + 60 * 1000);
  assert.equal(fillGuaranteeVested(campaign({ cancelledAt: cancelledLate, status: "PAUSED" }), afterWindow), true);
});

test("cohorts that never went live are ignored", () => {
  assert.equal(fillGuaranteeVested(campaign({ status: "DRAFT" }), afterWindow), false);
  assert.equal(fillGuaranteeVested(campaign({ status: "ESCROW_PENDING" }), afterWindow), false);
});

test("the published promise is only advertised where it is enforced", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile("components/PricingCalculator.tsx", "utf8"));
  // Rendered once, in the prepaid bundle branch, because that is the only path the cron can credit.
  assert.equal(source.match(/<FillGuarantee \/>/g)?.length, 1);
  assert.match(source, /4-Hour Fill Guarantee:/);
  // Pay-per-tester drops get an accurate note instead of a refund promise with nothing to refund.
  assert.match(source, /Pay only for testers you accept:/);
  // The Google production-access limitation must survive any future copy edit.
  assert.match(source, /cannot guarantee Google's production-access decision/);
});

test("the console never presents invented cohort performance as platform data", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile("components/console-overview.tsx", "utf8"));
  for (const invented of ["Network Cadence", "2h 45m", "Fintech Staging Auth", "Creator Analytics Mobile Beta"]) {
    assert.ok(!source.includes(invented), `console-overview must not hardcode "${invented}"`);
  }
});

test("the audit PDF does not overstate what it verifies", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile("app/api/cohorts/[id]/compliance-pdf/route.tsx", "utf8"));
  assert.match(source, /self-reported by each tester and are not independently attested/);
  assert.match(source, /does not certify the accuracy of tester-reported hardware/);
  assert.ok(!source.includes("verified telemetry"), "the export must not claim telemetry was verified");
});
