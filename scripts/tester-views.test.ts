import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { testerViews } from "../lib/tester-console";

test("each tester screen renders only its own sections and marks the selected navigation", async () => {
  const mocks = [
    mock.module("../components/mission-experience.tsx", { namedExports: { MissionExperience: ({ mode, history = [] }: { mode: string; history?: Array<{ rejectionReason: string | null }> }) => createElement("section", { "data-mission-mode": mode }, mode === "discover" ? "Discovery-only content" : ["Proof-only content", ...history.map((item) => item.rejectionReason ? `Held for manual review: ${item.rejectionReason}` : "")]) } }),
    mock.module("../components/navigation.tsx", { namedExports: { TesterBottomNav: () => null } }),
    mock.module("../components/flight-deck-cashout.tsx", { namedExports: { FlightDeckCashout: () => null } }),
    mock.module("next/image", { defaultExport: () => null }),
    mock.module("next/link", { defaultExport: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children) }),
  ];
  try {
    const { TesterConsole } = await import("../components/tester-console");
    const props = { tester: { id: "fixture", username: "Test member", xpPoints: 1600, stripeConnectAccountId: null }, missions: [], leaderboard: [], summary: [], recent: [], pending: [], approvedCampaigns: [], pendingPayoutCents: 0, now: new Date(), applications: [], questXp: 100, discoveryPasses: 1 };
    for (const view of testerViews) {
      const html = renderToStaticMarkup(createElement(TesterConsole, { ...props, activeView: view.id }));
      const heading = view.id === "reputation" ? "Reputation &amp; Clearance" : view.label;
      assert.ok(html.includes(`<h1 class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">${heading}</h1>`));
      assert.equal(html.includes("Discovery-only content"), view.id === "discover");
      assert.equal(html.includes("Proof-only content"), view.id === "missions");
      assert.equal(html.includes("Your recent activity"), false);
      assert.equal(html.includes("Verified milestones"), view.id === "reputation");
      assert.equal(html.includes("Community standouts"), view.id === "leaderboard");
      assert.equal(html.includes('aria-label="Tester opportunities"'), false);
      assert.ok(html.includes(`aria-current="page" class="rounded-md bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-white" href="/dashboard?view=${view.id}"`));
      for (const item of testerViews) assert.ok(html.includes(`/dashboard?view=${item.id}`));
      assert.ok(!html.includes('href="#'));
      assert.equal(html.includes("Available payout"), view.id === "discover");
      assert.ok(html.includes("$0.00 Cash Out"));
      if (view.id === "reputation") {
        assert.ok(html.includes('aria-label="Reputation summary"'));
        assert.ok(html.includes("Clearance tier"));
        assert.ok(html.includes("Verified audits"));
        assert.ok(html.includes("Approval ratio"));
        assert.ok(html.includes("Reputation Vanguard"));
        assert.ok(html.includes("100 Quest XP"));
        assert.ok(html.includes("1 Discovery Pass"));
      }
      if (view.id === "leaderboard") {
        assert.ok(html.includes("All-Time REP"));
        assert.ok(html.includes("Current Month"));
        assert.ok(html.includes("Highest Pass Rate"));
        assert.ok(html.includes("Benchmark examples"));
        assert.ok(html.includes("not live SeedEnv activity"));
        assert.ok(html.includes("@sample_apex"));
        assert.ok(html.includes("#--"));
        assert.ok(html.includes("Browse Open Cohorts to Earn REP"));
        assert.ok(!html.includes("Quality over quantity"));
        assert.ok(!html.includes("View rewards &amp; payout setup"));
      }
    }
    const heldActivity = renderToStaticMarkup(createElement(TesterConsole, { ...props, activeView: "missions", recent: [{
      id: "held-proof", status: "PENDING", feedbackText: "Submitted work", proofImageUrl: null,
      denialReviewPending: true, rejectionReason: "Required participation period not completed",
      revisionRequestedAt: null, payoutCents: 400, expiresAt: new Date(0), campaign: { title: "14-day test" },
    }] }));
    assert.ok(/manual review/i.test(heldActivity));
    assert.ok(/Held for manual review/i.test(heldActivity));
    const updatedMission = renderToStaticMarkup(createElement(TesterConsole, { ...props, activeView: "missions", missions: [{
      id: "versioned-mission", title: "Versioned test", appUrl: "https://example.invalid", iconUrl: null, targetVibe: "Testing",
      description: "Test original directions", bountyPerTaskUsd: 4, totalSlots: 5, claimedSlots: 1, completedSlots: 0, platform: "WEB_STAGING",
      discoveryAllowed: false, discoveryMinRep: 0, estimatedMinutes: null, testerPerk: null, instructions: [],
      acceptedInstructionRevision: 1, directionsUpdated: true,
    }] }));
    assert.ok(/version 1/i.test(updatedMission));
    assert.ok(/saved steps, not the newer requirements/i.test(updatedMission));
    const reputationWithUpdatedMission = renderToStaticMarkup(createElement(TesterConsole, { ...props, activeView: "reputation", missions: [{
      id: "versioned-mission", title: "Versioned test", appUrl: "https://example.invalid", iconUrl: null, targetVibe: "Testing",
      description: "Test original directions", bountyPerTaskUsd: 4, totalSlots: 5, claimedSlots: 1, completedSlots: 0, platform: "WEB_STAGING",
      discoveryAllowed: false, discoveryMinRep: 0, estimatedMinutes: null, testerPerk: null, instructions: [],
      acceptedInstructionRevision: 1, directionsUpdated: true,
    }] }));
    assert.ok(!/saved steps, not the newer requirements/i.test(reputationWithUpdatedMission));
  } finally {
    for (const moduleMock of mocks.reverse()) moduleMock.restore();
  }
});

test("mission discovery includes an honest three-column completed-cohort preview", async () => {
  const source = await readFile(new URL("../components/mission-experience.tsx", import.meta.url), "utf8");
  assert.match(source, /md:grid-cols-2 xl:grid-cols-3/);
  assert.match(source, /FinFlow Staging Auth/);
  assert.match(source, /Pulse Analytics PWA/);
  assert.match(source, /Marketplace preview/);
  assert.match(source, /Example completed cohort/);
  assert.match(source, /showCompletedPreviews \? completedMissionPreviews\.map/);
});

test("mission desk consolidates status and empty states without changing timer semantics", async () => {
  const source = await readFile(new URL("../components/mission-experience.tsx", import.meta.url), "utf8");
  assert.match(source, /\["progress", "In Progress", inProgressAssignments\.length\]/);
  assert.match(source, /\["review", "Under Review", reviewAssignments\.length\]/);
  assert.match(source, /\["revisions", "Revisions", revisionAssignments\.length\]/);
  assert.match(source, /\["history", "History", completedHistory\.length\]/);
  assert.match(source, /No active validation runs/);
  assert.match(source, /Accepted invitations remain available for up to 24 hours; the 30-minute proof timer starts only after you begin\./);
  assert.match(source, /href="\/dashboard\?view=discover">Browse Open Missions/);
  assert.doesNotMatch(source, /Your next contribution|No missions in progress yet/);
});
