import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const anchorMock = { defaultExport: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children) };
const routerMock = { namedExports: { useRouter: () => ({ refresh: () => undefined, push: () => undefined }), usePathname: () => "/applications", useSearchParams: () => new URLSearchParams() } };
const actionsMock = { namedExports: { decideApplication: async () => undefined, updateMissionRequirements: async () => undefined, withdrawApplication: async () => undefined } };

function applicant(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    status: "PENDING",
    note: "Happy to run the checkout flow.",
    passReserved: false,
    startBy: null,
    completed: false,
    campaign: { id: "camp-1", title: "Goddesses Beta" },
    tester: { username: "nova", avatarUrl: null, xpPoints: 920, rankLabel: "Core Validator", submissionCount: 12, deviceModel: "iPhone 15 Pro", osBuild: "iOS 18.2" },
    ...overrides,
  };
}

const baseProps = { chargePreviews: {}, renderedAt: Date.UTC(2025, 0, 1, 12, 0, 0), shareCohort: null, rulesPanel: null, rulesSummary: null };

test("the queue buckets applications into status tabs and derives completion from approved proof", async () => {
  const modules = [mock.module("next/link", anchorMock), mock.module("next/navigation", routerMock), mock.module("../app/actions/applicationActions.ts", actionsMock)];
  try {
    const { TesterRequests } = await import(`../components/applications/TesterRequests.tsx?q=${randomUUID()}`);
    const html = renderToStaticMarkup(createElement(TesterRequests, {
      ...baseProps,
      applications: [
        applicant(),
        applicant({ status: "ACCEPTED" }),
        applicant({ status: "STARTED", completed: true }),
        applicant({ status: "DECLINED" }),
        applicant({ status: "WITHDRAWN" }),
      ],
    }));
    assert.ok(html.includes("Pending Review (1)"));
    assert.ok(html.includes("Active in Test (1)"));
    // An approved submission promotes a STARTED run into Completed rather than leaving it in flight.
    assert.ok(html.includes("Completed (1)"));
    // Exactly the four required status tabs: withdrawn requests close without a run, so they join Rejected.
    assert.ok(html.includes("Rejected (2)"));
    assert.ok(!html.includes("Withdrawn ("));
    assert.equal(html.match(/role="tab"/g)?.length, 4);
    // Folding them together must not blur who rejected whom.
    assert.ok(html.includes("Rejected: 1 declined · 1 withdrawn."));
    // Raw debug pagination copy must not reappear as unstyled body text.
    assert.ok(!html.includes("pending in this list"));
    assert.ok(!html.includes("Showing up to"));
    assert.ok(html.includes("grid-cols-1 gap-6 lg:grid-cols-3"));
    assert.ok(html.includes("REP Gating"));
    assert.ok(html.includes("Manual Dev Approval"));
    assert.ok(html.includes("24h Execution Timer"));
  } finally { for (const item of modules.reverse()) item.restore(); }
});

test("the rules card reports real cohort settings and exposes the criteria editor actions", async () => {
  const modules = [mock.module("next/link", anchorMock), mock.module("next/navigation", routerMock), mock.module("../app/actions/applicationActions.ts", actionsMock)];
  try {
    const { TesterRequests } = await import(`../components/applications/TesterRequests.tsx?q=${randomUUID()}`);
    const html = renderToStaticMarkup(createElement(TesterRequests, {
      ...baseProps,
      applications: [],
      rulesPanel: createElement("div", null, "Server-backed criteria form"),
      rulesSummary: {
        campaignTitle: "Goddesses Beta",
        minimumRep: 85,
        discoveryAllowed: true,
        discoveryMinRep: 50,
        hardwareStrict: true,
      },
    }));
    assert.ok(html.includes("Gating &amp; Validation Rules"));
    assert.ok(html.includes("Goddesses Beta"));
    assert.ok(html.includes("85 REP"));
    assert.ok(html.includes("Active · 50 REP floor"));
    assert.ok(html.includes("Physical device required"));
    assert.ok(html.includes("Escrow held until reviewed"));
    assert.ok(html.includes("REP &amp; Device Rules"));
    assert.ok(html.includes("Edit Criteria"));
    assert.ok(!html.includes("Server-backed criteria form"), "the editor belongs in a modal, not an inline accordion");
  } finally { for (const item of modules.reverse()) item.restore(); }
});

test("an applicant card shows REP, device telemetry and a non-amber decline control", async () => {
  const modules = [mock.module("next/link", anchorMock), mock.module("next/navigation", routerMock), mock.module("../app/actions/applicationActions.ts", actionsMock)];
  try {
    const { TesterRequests } = await import(`../components/applications/TesterRequests.tsx?q=${randomUUID()}`);
    const html = renderToStaticMarkup(createElement(TesterRequests, {
      ...baseProps,
      chargePreviews: { "camp-1": { credit: false, stipendCents: 500, platformFeeCents: 100, totalCents: 600 } },
      balance: { balanceCents: 200, autoReloadCents: 0 },
      applications: [applicant()],
    }));
    assert.ok(html.includes("REP 920 · Core Validator"));
    assert.ok(html.includes("iPhone 15 Pro · iOS 18.2"));
    assert.ok(html.includes("Accept &amp; Issue Build · $6.00"));
    assert.ok(html.includes("Decline"));
    // The financial disclosure before accepting a place must survive the redesign.
    assert.ok(html.includes("$5.00 tester reward + $1.00 platform fee"));
    assert.ok(html.includes("Add funds"));
    // Decline stays a quiet ghost control, never the amber primary button.
    const decline = html.slice(html.indexOf(">Decline<") - 400, html.indexOf(">Decline<"));
    assert.ok(!decline.includes("bg-amber"));
    assert.ok(decline.includes("border-zinc-800"));
  } finally { for (const item of modules.reverse()) item.restore(); }
});

test("missing telemetry is reported honestly instead of inventing a device", async () => {
  const modules = [mock.module("next/link", anchorMock), mock.module("next/navigation", routerMock), mock.module("../app/actions/applicationActions.ts", actionsMock)];
  try {
    const { TesterRequests } = await import(`../components/applications/TesterRequests.tsx?q=${randomUUID()}`);
    const html = renderToStaticMarkup(createElement(TesterRequests, {
      ...baseProps,
      applications: [applicant({ tester: { username: "ghost", avatarUrl: null, xpPoints: 0, rankLabel: "Alpha Seeder", submissionCount: 0, deviceModel: null, osBuild: null } })],
    }));
    assert.ok(html.includes("Device not reported yet"));
    assert.ok(!html.includes("iPhone"));
  } finally { for (const item of modules.reverse()) item.restore(); }
});

test("the empty queue renders the terminal empty state with a share action", async () => {
  const modules = [mock.module("next/link", anchorMock), mock.module("next/navigation", routerMock), mock.module("../app/actions/applicationActions.ts", actionsMock)];
  try {
    const { TesterRequests } = await import(`../components/applications/TesterRequests.tsx?q=${randomUUID()}`);
    const html = renderToStaticMarkup(createElement(TesterRequests, { ...baseProps, applications: [], shareCohort: { id: "camp-1", title: "Goddesses Beta" } }));
    assert.ok(html.includes("border-dashed"));
    assert.ok(html.includes(">0/0<"));
    assert.ok(html.includes("No pending tester applications"));
    assert.ok(html.includes("Share Cohort Link"));
    assert.ok(html.includes("/cohorts/camp-1"));

    const noCohort = renderToStaticMarkup(createElement(TesterRequests, { ...baseProps, applications: [] }));
    assert.ok(!noCohort.includes("Share Cohort Link"));
    assert.ok(noCohort.includes("Deploy a cohort"));
  } finally { for (const item of modules.reverse()) item.restore(); }
});

test("the claim timer counts down from the rendered instant and expires cleanly", async () => {
  const { remainingLabel } = await import(`../components/applications/ClaimTimer.tsx?q=${randomUUID()}`);
  const now = Date.UTC(2025, 0, 1, 12, 0, 0);
  assert.equal(remainingLabel(new Date(now + 23 * 3600_000 + 45 * 60_000).toISOString(), now), "23h 45m remaining to start");
  assert.equal(remainingLabel(new Date(now + 90_000).toISOString(), now), "1m remaining to start");
  assert.equal(remainingLabel(new Date(now - 1000).toISOString(), now), "Start window expired");
});

test("testers keep their own application list and are never shown the developer queue", async () => {
  const modules = [mock.module("next/link", anchorMock), mock.module("next/navigation", routerMock), mock.module("../app/actions/applicationActions.ts", actionsMock)];
  try {
    const { ApplicationCenter } = await import(`../components/application-center.tsx?q=${randomUUID()}`);
    const html = renderToStaticMarkup(createElement(ApplicationCenter, {
      developer: false,
      applications: [{ id: "a1", status: "ACCEPTED", note: "On it", passReserved: true, startBy: null, campaign: { id: "camp-1", title: "Goddesses Beta" }, tester: { username: "nova", xpPoints: 920, _count: { submissions: 3 } } }],
      campaigns: [],
    }));
    assert.ok(html.includes("Your applications"));
    assert.ok(html.includes("Withdraw / return unused pass"));
    assert.ok(!html.includes("Accept &amp; Issue Build"));
    assert.ok(!html.includes("Pending Review ("));
    // The console links straight to this anchor, so it must stay addressable.
    assert.ok(html.includes('id="tester-requests"'));
  } finally { for (const item of modules.reverse()) item.restore(); }
});
