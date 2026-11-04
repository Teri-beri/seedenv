import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { checklistMarkdown, feedbackWithBug, freeTools, githubReportMarkdown, sprintHandoffPath, structuredBugSchema, toolUrlSchema, viewportPresets } from "../lib/organic-growth";

test("free tools validate full URLs and retain URL queries/fragments through the sprint handoff", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "https://user:secret@example.com", "example.com", ""]) assert.equal(toolUrlSchema.safeParse(bad).success, false);
  const target = "https://example.com/cart?a=1&b=2#checkout";
  const handoff = new URL(sprintHandoffPath(target), "https://seedenv.com");
  assert.equal(handoff.pathname, "/dashboard/projects/new");
  assert.equal(handoff.searchParams.get("url"), target);
  assert.equal(sprintHandoffPath(), "/dashboard/projects/new");
  assert.equal(new Set(freeTools.map((tool) => tool.path)).size, 3);
  assert.ok(viewportPresets.some((preset) => preset.width === 360));
});

test("checklists contain selected sections, no fake completed checks, and copyable attribution", () => {
  const output = checklistMarkdown("https://example.com", ["core", "commerce"]);
  assert.match(output, /Target: https:\/\/example.com/);
  assert.match(output, /## Core flows/);
  assert.match(output, /## Payments & commerce/);
  assert.doesNotMatch(output, /## Accounts & access|\[x\]/);
  assert.match(output, /- \[ \]/);
  assert.match(output, /seedenv.com\/tools\/qa-checklist/);
});

test("structured bugs require reproducible steps and flow through review context and safe GitHub Markdown", () => {
  assert.equal(structuredBugSchema.safeParse({ title: "Bug title", severity: "MAJOR", reproSteps: ["Only one"] }).success, false);
  const bug = structuredBugSchema.parse({ title: "Checkout **freezes**", severity: "CRITICAL", reproSteps: ["Open <checkout>", "Confirm [payment]"] });
  const output = githubReportMarkdown({ id: "report-123", ...bug, deviceModel: "iPhone\n14 Pro", osVersion: "iOS 17.4" });
  assert.match(output, /https:\/\/seedenv.com\/report\/report-123/);
  assert.match(output, /iPhone 14 Pro/);
  assert.ok(output.includes("\\*\\*freezes\\*\\*"));
  assert.ok(output.includes("\\<checkout\\>"));
  assert.match(feedbackWithBug("Expected completion; actual freeze.", bug), /Steps to reproduce:\n1\. Open/);
  assert.equal(feedbackWithBug("Normal UX feedback"), "Normal UX feedback");
});

test("tool handoff renders SSR-safe, readable conversion content without an active pinned overlay", async () => {
  const moduleMock = mock.module("next/link", { defaultExport: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children) });
  try {
    const { ToolHandoff } = await import("../components/tools/tool-handoff");
    const html = renderToStaticMarkup(createElement(ToolHandoff, { url: "https://example.com", lead: "Your viewport matrix is ready." }));
    assert.match(html, /Want 5 verified human testers/);
    assert.match(html, /Launch 1-Click Test Sprint/);
    assert.match(html, /dashboard\/projects\/new\?url=/);
    assert.doesNotMatch(html, /fixed inset/);
  } finally { moduleMock.restore(); }
});

test("anonymous handoffs keep the project URL through developer-role sign-in and launch redirect", async () => {
  class Redirect extends Error { constructor(readonly destination: string) { super(destination); } }
  let sessionRole = "DEVELOPER";
  const mocks = [
    mock.module("next-auth", { namedExports: { getServerSession: async () => ({ user: { id: "member", role: sessionRole } }) } }),
    mock.module("../lib/auth-options.ts", { namedExports: { authOptions: {} } }),
    mock.module("next-auth/jwt", { namedExports: { getToken: async () => null } }),
    mock.module("../lib/session-security.ts", { namedExports: { decodeSessionToken: () => null } }),
    mock.module("next/navigation", { namedExports: { redirect: (url: string) => { throw new Redirect(url); } } }),
  ];
  try {
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("../proxy");
    const target = "https://example.com/cart?a=1&b=2#pay";
    const handoff = sprintHandoffPath(target);
    const response = await proxy(new NextRequest(`https://seedenv.com${handoff}`));
    const location = new URL(response.headers.get("location")!);
    assert.equal(location.pathname, "/auth/signin");
    assert.equal(location.searchParams.get("role"), "DEVELOPER");
    assert.equal(location.searchParams.get("callbackUrl"), handoff);
    const { default: NewProjectPage } = await import("../app/dashboard/projects/new/page");
    await assert.rejects(NewProjectPage({ searchParams: Promise.resolve({ url: target }) }), (error: unknown) => {
      assert.ok(error instanceof Redirect);
      const destination = new URL(error.destination, "https://seedenv.com");
      assert.equal(destination.pathname, "/console");
      assert.equal(destination.searchParams.get("view"), "new-drop");
      assert.equal(destination.searchParams.get("url"), target);
      assert.equal(destination.searchParams.get("sprint"), "1");
      return true;
    });

    sessionRole = "TESTER";
    await assert.rejects(NewProjectPage({ searchParams: Promise.resolve({ url: target }) }), (error: unknown) => {
      assert.ok(error instanceof Redirect);
      const destination = new URL(error.destination, "https://seedenv.com");
      assert.equal(destination.pathname, "/onboarding");
      assert.equal(destination.searchParams.get("role"), "DEVELOPER");
      assert.equal(new URL(destination.searchParams.get("next")!, "https://seedenv.com").searchParams.get("url"), target);
      return true;
    });
  } finally { for (const item of mocks.reverse()) item.restore(); }
});

test("the actual launch wizard starts with the handed-off URL, five places and physical-device requirements", async () => {
  let snapshot: import("../lib/launch-wizard-draft").LaunchWizardDraft | undefined;
  const empty = () => null;
  const mocks = [
    mock.module("server-only", { namedExports: {} }),
    mock.module("next/navigation", { namedExports: { useRouter: () => ({ push: () => undefined, refresh: () => undefined }) } }),
    mock.module("next/link", { defaultExport: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children) }),
    mock.module("next/image", { defaultExport: empty }),
    mock.module("../app/actions/campaignActions.ts", { namedExports: { createCampaignWithEscrow: empty, saveTestCampaignDraft: empty } }),
    mock.module("../app/actions/submissionActions.ts", { namedExports: { approveSubmission: empty, rejectSubmission: empty, requestSubmissionRevision: empty } }),
    mock.module("../components/developer-insights.tsx", { namedExports: { DeveloperInsights: empty } }),
    mock.module("../components/ai-spec-drafter.tsx", { namedExports: { AiSpecDrafter: empty } }),
    mock.module("../components/ai-audit-card.tsx", { namedExports: { AiAuditBadge: empty, AiAuditCard: empty } }),
    mock.module("../components/cohort-promo-input.tsx", { namedExports: { CohortPromoInput: empty } }),
    mock.module("../components/share-report-control.tsx", { namedExports: { ShareReportControl: empty } }),
    mock.module("../components/use-launch-autosave.ts", { namedExports: { useLaunchAutosave: ({ draft }: { draft: import("../lib/launch-wizard-draft").LaunchWizardDraft }) => { snapshot = draft; return { status: "Saved", error: null, retry: empty, flush: empty, clear: empty }; } } }),
  ];
  try {
    const { DeveloperStudio } = await import("../components/developer-studio");
    const html = renderToStaticMarkup(createElement(DeveloperStudio, {
      submissions: [], assets: [], auditReports: [], reviewPage: 1, reviewTotalPages: 1, reviewTotalCount: 0, canSaveTestDraft: false,
      view: "new-drop", userId: "fixture", draftRevision: 0, initialAppUrl: "https://example.com/app?a=1&b=2", initialSprint: true,
    }));
    assert.ok(snapshot);
    assert.equal(snapshot.form.appUrl, "https://example.com/app?a=1&b=2");
    assert.equal(snapshot.form.totalSlots, 5);
    assert.equal(snapshot.form.platform, "WEB_STAGING");
    assert.equal(snapshot.form.hardwareStrict, true);
    assert.match(html, /<input[^>]*value="https:\/\/example.com\/app\?a=1&amp;b=2"/);
  } finally { for (const item of mocks.reverse()) item.restore(); }
});
