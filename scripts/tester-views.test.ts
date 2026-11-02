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
      const activeNavLink = new RegExp(`<a[^>]*aria-current="page"[^>]*href="/dashboard\\?view=${view.id}"`);
      const activeNavLinkReversed = new RegExp(`<a[^>]*href="/dashboard\\?view=${view.id}"[^>]*aria-current="page"`);
      assert.ok(activeNavLink.test(html) || activeNavLinkReversed.test(html));
      // The console nav must stay anchor-based so /dashboard?view=... remains bookmarkable.
      assert.ok(/<nav aria-label="Tester console"[^>]*>\s*<a /.test(html));
      for (const item of testerViews) assert.ok(html.includes(`/dashboard?view=${item.id}`));
      assert.ok(html.includes('href="/launch-circle"'));
      assert.ok(!html.includes('href="#'));
      assert.equal(html.includes("Available payout"), view.id === "discover");
      // The amount always renders; the "Cash Out" wording is hidden on phones to keep the app bar on one line.
      assert.ok(html.includes("$0.00"));
      assert.ok(/\$0\.00<span class="[^"]*hidden sm:inline[^"]*"> Cash Out<\/span>/.test(html));
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
  assert.match(source, /\{ id: "progress", label: "In Progress", badge: inProgressAssignments\.length \}/);
  assert.match(source, /\{ id: "review", label: "Under Review", badge: reviewAssignments\.length \}/);
  assert.match(source, /\{ id: "revisions", label: "Revisions", badge: revisionAssignments\.length \}/);
  assert.match(source, /\{ id: "history", label: "History", badge: completedHistory\.length \}/);
  assert.match(source, /No active validation runs/);
  assert.match(source, /Accepted invitations and active proof reservations remain available for up to 24 hours\./);
  assert.match(source, /href="\/dashboard\?view=discover">Browse Open Missions/);
  assert.doesNotMatch(source, /Your next contribution|No missions in progress yet/);
});

test("the mobile app shell never pans sideways and keeps desktop layout intact", async () => {
  const tabs = await readFile(new URL("../components/ui/SegmentedTabs.tsx", import.meta.url), "utf8");
  // A flex parent lets an unconstrained inline-flex track grow to max-content and scroll the whole page.
  assert.match(tabs, /inline-flex max-w-full"\} min-w-0/);
  assert.match(tabs, /segmented-tabs /);
  assert.match(tabs, /segmented-tabs-item relative/);
  assert.match(tabs, /segmented-tabs-label relative/);

  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  // `clip` rather than `hidden`, so the sticky app bar and bottom tab bar keep working.
  assert.match(css, /@media \(max-width: 1023px\) \{\s*\/\*[\s\S]*?\*\/\s*html,\s*body \{[\s\S]*?overflow-x: clip;[\s\S]*?overscroll-behavior-x: none;/);
  assert.doesNotMatch(css, /scroll-snap-type: x mandatory/);
  // Mobile pills wrap onto new rows instead of becoming a sideways track.
  assert.match(css, /\.segmented-tabs \{[\s\S]*?flex-wrap: wrap;[\s\S]*?overflow: visible;/);
  // Every desktop-only rule must stay behind a mobile media query.
  const mobileBlocks = css.split("@media (max-width: 639px)").length - 1;
  assert.ok(mobileBlocks >= 2, "mobile app-shell rules must stay scoped to the phone breakpoint");

  const leaderboard = await readFile(new URL("../components/tester/LeaderboardTable.tsx", import.meta.url), "utf8");
  // Phones get stacked rows; the 680px-wide table stays desktop-only.
  assert.match(leaderboard, /sm:hidden" aria-label="Leaderboard standings"/);
  assert.match(leaderboard, /mt-4 hidden overflow-x-auto sm:block/);
  assert.match(leaderboard, /min-w-\[680px\]/);

  const nav = await readFile(new URL("../components/navigation.tsx", import.meta.url), "utf8");
  // Keep short labels and full accessible names as creator work joins the existing navigation.
  assert.match(nav, /shortLabel: "Missions"/);
  assert.match(nav, /shortLabel: "Ranks"/);
  assert.match(nav, /shortLabel: "Clippers"/);
  assert.match(nav, /aria-label=\{label\}/);
  assert.match(nav, /min-h-14/);
});

test("segmented tabs animate a per-group indicator and keep every group id unique", async () => {
  const component = await readFile(new URL("../components/ui/SegmentedTabs.tsx", import.meta.url), "utf8");
  assert.match(component, /layoutId=\{`segmented-tabs-\$\{groupId\}`\}/);
  assert.match(component, /useReducedMotion/);
  assert.match(component, /reduceMotion \? \{ duration: 0 \} : \{ type: "spring", stiffness: 450, damping: 35 \}/);
  assert.doesNotMatch(component, /zinc-850/);

  const callSites = ["mission-experience.tsx", "public-landing.tsx", "tester/LeaderboardTable.tsx", "tester-console.tsx", "console-header.tsx"];
  const groupIds: string[] = [];
  for (const file of callSites) {
    const source = await readFile(new URL(`../components/${file}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/groupId="([^"]+)"/g)) groupIds.push(match[1]);
  }
  assert.ok(groupIds.length >= 6, "expected the segmented tabs to replace the static tab button and link maps");
  assert.equal(new Set(groupIds).size, groupIds.length, `duplicate groupId would glide the pill between groups: ${groupIds.join(", ")}`);
  // The link variant must share the pill without downgrading routes to click handlers.
  assert.match(component, /export function SegmentedTabLinks/);
  assert.match(component, /<Link[\s\S]*?aria-current=\{isActive \? "page" : undefined\}/);
  assert.doesNotMatch(component.slice(component.indexOf("export function SegmentedTabLinks")), /onChange/);
});
