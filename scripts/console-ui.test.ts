import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const Empty = () => null;
const anchorMock = { defaultExport: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children) };

test("the join requests card mutes its action until testers are actually waiting", async () => {
  const modules = [mock.module("next/link", anchorMock)];
  try {
    const { JoinRequestsCard } = await import(`../components/console-join-requests.tsx?join=${randomUUID()}`);
    const idle = renderToStaticMarkup(createElement(JoinRequestsCard, { pendingCount: 0 }));
    assert.ok(idle.includes("No requests to review"));
    assert.ok(idle.includes('aria-disabled="true"'));
    assert.ok(idle.includes("text-zinc-500"));
    // An idle card must not offer a live link or imply activity with a pulse.
    assert.ok(!idle.includes("/applications#tester-requests"));
    assert.ok(!idle.includes("animate-pulse"));

    const waiting = renderToStaticMarkup(createElement(JoinRequestsCard, { pendingCount: 3 }));
    assert.ok(waiting.includes("/applications#tester-requests"));
    assert.ok(waiting.includes("bg-emerald-400"));
    assert.ok(waiting.includes("animate-pulse"));
    assert.ok(waiting.includes("Review tester requests"));
  } finally { for (const item of modules.reverse()) item.restore(); }
});

test("admin cohort tools collapse into one menu and stay hidden from non-admins", async () => {
  const modules = [
    mock.module("next/link", anchorMock),
    mock.module("next/image", { defaultExport: Empty }),
    mock.module("../components/user-dropdown.tsx", { namedExports: { UserDropdown: Empty } }),
  ];
  try {
    const { ConsoleHeader, CohortRulesMenu } = await import(`../components/console-header.tsx?header=${randomUUID()}`);
    const account = { username: "teri", avatarUrl: null, organization: null, roleLabel: "Developer", publicProfileHref: null };
    const admin = renderToStaticMarkup(createElement(ConsoleHeader, {
      activeView: "overview", paymentsMode: "test", account,
      cohortRules: [{ label: "Manage cohort promo codes", href: "/admin/promos" }, { label: "Review denied tester work", href: "/admin/proof-reviews", tone: "caution" }],
    }));
    assert.ok(admin.includes("Cohort Rules"));
    assert.ok(admin.includes('aria-haspopup="menu"'));
    // Collapsed into the menu: the links are no longer loose text under the header.
    assert.ok(!admin.includes("Manage cohort promo codes"));

    const plain = renderToStaticMarkup(createElement(ConsoleHeader, { activeView: "overview", paymentsMode: "test", account }));
    assert.ok(!plain.includes("Cohort Rules"));
    assert.equal(renderToStaticMarkup(createElement(CohortRulesMenu, { links: [] })), "");
  } finally { for (const item of modules.reverse()) item.restore(); }
});

test("the waived-fee banner is dismissible and defers to the stored client preference", async () => {
  const { ConsolePromoBanner } = await import(`../components/console-promo-banner.tsx?banner=${randomUUID()}`);
  // The server cannot read localStorage, so it renders nothing instead of flashing a banner the user hid.
  assert.equal(renderToStaticMarkup(createElement(ConsolePromoBanner, null, "Platform fees are permanently waived")), "");
  const source = await import("node:fs/promises").then((fs) => fs.readFile("components/console-promo-banner.tsx", "utf8"));
  assert.match(source, /hide_promo_banner/);
  assert.match(source, /aria-label="Dismiss platform fee notice"/);
  assert.match(source, /setItem\(STORAGE_KEY, "true"\)/);
});

test("active cohort rows lead with the app identity and consolidate their actions", async () => {
  const modules = [
    mock.module("next/link", anchorMock),
    mock.module("next/image", { defaultExport: Empty }),
    mock.module("../components/end-cohort-button.tsx", { namedExports: { EndCohortButton: Empty } }),
  ];
  try {
    const { ActiveCohorts } = await import(`../components/console-overview.tsx?cohorts=${randomUUID()}`);
    const cohort = {
      id: "cohort-1", title: "Goddesses", platform: "TESTFLIGHT", iconUrl: "https://example.invalid/icon.png",
      totalBudgetUsd: 30, totalSlots: 5, claimedSlots: 0, completedSlots: 0, bountyPerTaskUsd: 5,
      platformFeeUsd: 5, fundingModel: "PREPAID", paidStipendCents: null, clickCount: 0,
    };
    const markup = renderToStaticMarkup(createElement(ActiveCohorts, { cohorts: [cohort], total: 1 }));
    assert.ok(markup.includes("Goddesses"));
    assert.ok(markup.includes("iOS TestFlight"));
    assert.ok(markup.includes("$5.00 / tester · 0/5 slots claimed"));
    // Mixed app icons are normalised inside one dark container.
    assert.ok(markup.includes("rounded-lg border border-zinc-800 bg-zinc-950 p-1"));
    // The progress track keeps contrast against the row background.
    assert.ok(markup.includes("border border-zinc-800 bg-zinc-950"));
    assert.ok(markup.includes("Manage"));
    assert.ok(markup.includes("More actions for Goddesses"));
    // Stacked underlined links are gone; secondary actions live in the overflow menu.
    assert.ok(!markup.includes("View instruction history"));
    assert.ok(!markup.includes("text-xs text-emerald-300 underline"));
  } finally { for (const item of modules.reverse()) item.restore(); }
});

test("the submission queue separates view switching from status filtering", async () => {
  const modules = [
    mock.module("next/link", anchorMock),
    mock.module("next/image", { defaultExport: Empty }),
    mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh: () => {} }) } }),
    mock.module("framer-motion", { namedExports: { motion: new Proxy({}, { get: () => ({ children }: { children: ReactNode }) => createElement("div", null, children) }) } }),
    mock.module("../app/actions/submissionActions.ts", { namedExports: { approveSubmission: async () => ({}), rejectSubmission: async () => ({}), requestSubmissionRevision: async () => ({}) } }),
    mock.module("../app/actions/campaignActions.ts", { namedExports: { createCampaignWithEscrow: async () => ({}), saveTestCampaignDraft: async () => ({}) } }),
  ];
  try {
    const { DeveloperStudio } = await import(`../components/developer-studio.tsx?studio=${randomUUID()}`);
    const base = { proofImageUrl: null, recordingUrl: null, feedbackText: "Checkout stalls", osBuild: null, deviceModel: null, screenResolution: null, appBuildVersion: null, networkType: null, crashLogs: null, networkLogs: null, payoutCents: 500, createdAt: new Date("2026-10-01"), hardwareStatus: "UNVERIFIED", hardwareFlags: [], gpuRenderer: null, tester: { username: "qa_halden", avatarUrl: null }, campaign: { id: "cohort-1", title: "Goddesses", instructions: [] }, acceptedInstructionRevision: 1 };
    const submissions = [
      { ...base, id: "s1" },
      { ...base, id: "s2", aiHold: true },
      { ...base, id: "s3", revisionRequestedAt: new Date("2026-10-02"), rejectionReason: "Needs a clearer recording" },
    ];
    const markup = renderToStaticMarkup(createElement(DeveloperStudio, {
      submissions, assets: [], auditReports: [], reviewPage: 1, reviewTotalPages: 1, reviewTotalCount: 3,
      canSaveTestDraft: false, view: "review-deck", userId: "dev", draftRevision: 0,
    }));
    assert.ok(markup.includes("Submission views"));
    assert.ok(markup.includes("/console?view=asset-vault"));
    assert.ok(markup.includes("Filter queue by status"));
    // Counts reflect the real queue rather than placeholder zeroes.
    assert.ok(markup.includes("All (3)"));
    assert.ok(markup.includes("Awaiting review (1)"));
    assert.ok(markup.includes("In revision (1)"));
    assert.ok(markup.includes("Flagged (1)"));
  } finally { for (const item of modules.reverse()) item.restore(); }
});
