import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { testerViews } from "../lib/tester-console";

test("each tester screen renders only its own sections and marks the selected navigation", async () => {
  const mocks = [
    mock.module("../components/mission-experience.tsx", { namedExports: { MissionExperience: ({ mode }: { mode: string }) => createElement("section", { "data-mission-mode": mode }, mode === "discover" ? "Discovery-only content" : "Proof-only content") } }),
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
      assert.ok(html.includes(`<h1 class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">${view.label}</h1>`));
      assert.equal(html.includes("Discovery-only content"), view.id === "discover");
      assert.equal(html.includes("Proof-only content"), view.id === "missions");
      assert.equal(html.includes("Your recent activity"), view.id === "missions");
      assert.equal(html.includes("Milestones worth earning"), view.id === "reputation");
      assert.equal(html.includes("Community standouts"), view.id === "leaderboard");
      assert.equal(html.includes('aria-label="Tester opportunities"'), view.id === "discover");
      assert.ok(html.includes(`aria-current="page" class="rounded-md bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-white" href="/dashboard?view=${view.id}"`));
      for (const item of testerViews) assert.ok(html.includes(`/dashboard?view=${item.id}`));
      assert.ok(!html.includes('href="#'));
      assert.ok(html.includes("Ready for cashout"));
    }
  } finally {
    for (const moduleMock of mocks.reverse()) moduleMock.restore();
  }
});
