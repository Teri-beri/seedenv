import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { mock } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { supportRequestSchema } from "../lib/enterprise-rules";
import { buildIssueSupportRequest, issueReportMailto, type IssueReportDraft } from "../lib/support-issues";

const draft: IssueReportDraft = {
  type: "UI or visual issue",
  subject: "  Mobile menu is clipped  ",
  details: "  The support button overlaps the menu on a small screen.  ",
  steps: "  Open the menu on a phone.\nTap the support button.  ",
  expected: "  Both controls should remain visible.  ",
  viewport: { width: 360, height: 800 },
};

test("issue reports are structured as technical support requests with privacy-safe page context", () => {
  const result = buildIssueSupportRequest(draft, "/account");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.category, "Technical Bug");
  assert.equal(result.data.subject, "Mobile menu is clipped");
  assert.equal(result.data.route, "/account");
  assert.match(result.data.message, /Issue type: UI or visual issue/);
  assert.match(result.data.message, /What happened:\nThe support button overlaps/);
  assert.match(result.data.message, /Steps to reproduce:\nOpen the menu on a phone\./);
  assert.match(result.data.message, /Expected behavior:\nBoth controls should remain visible\./);
  assert.match(result.data.message, /Viewport: 360 x 800 CSS px/);
  assert.equal(supportRequestSchema.safeParse(result.data).success, true);

  const minimal = buildIssueSupportRequest({ ...draft, steps: "", expected: "", viewport: undefined }, "/tools");
  assert.equal(minimal.ok, true);
  if (!minimal.ok) return;
  assert.doesNotMatch(minimal.data.message, /Steps to reproduce|Expected behavior|Viewport/);
});

test("issue reports reject invalid input and fit the existing support limits", () => {
  const shortTitle = buildIssueSupportRequest({ ...draft, subject: "  x  " }, "/account");
  assert.equal(shortTitle.ok, false);
  if (!shortTitle.ok) assert.match(shortTitle.message, /title/i);
  const shortDetails = buildIssueSupportRequest({ ...draft, details: "   too short   " }, "/account");
  assert.equal(shortDetails.ok, false);
  if (!shortDetails.ok) assert.match(shortDetails.message, /20 characters/);
  assert.equal(buildIssueSupportRequest(draft, "/account?token=secret").ok, false);
  assert.equal(buildIssueSupportRequest({ ...draft, viewport: { width: -1, height: 800 } }, "/account").ok, false);
  assert.equal(buildIssueSupportRequest({ ...draft, details: "x".repeat(2001) }, "/account").ok, false);

  const maximum = buildIssueSupportRequest({
    ...draft, subject: "s".repeat(150), details: "d".repeat(2000), steps: "r".repeat(1200), expected: "e".repeat(1200),
  }, "/account");
  assert.equal(maximum.ok, true);
  if (maximum.ok) assert.ok(maximum.data.message.length <= 5000);
});

test("signed-out email drafts preserve the report without injecting email headers", () => {
  const result = buildIssueSupportRequest({ ...draft, subject: "Menu\nCc: other@example.com", details: "The menu is clipped on 日本語 pages and mobile 📱." }, "/tools");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const email = new URL(issueReportMailto(result.data));
  assert.equal(email.protocol, "mailto:");
  assert.equal(email.pathname, "terimus@seedenv.com");
  assert.equal(email.searchParams.get("subject"), "[SeedEnv issue] Menu Cc: other@example.com");
  assert.equal(email.searchParams.get("cc"), null);
  assert.match(email.searchParams.get("body") || "", /日本語 pages and mobile 📱/);
  assert.match(email.searchParams.get("body") || "", /Page: \/tools$/);
});

test("issue reports use the existing authenticated, rate-limited support queue", async () => {
  let signedIn = true;
  let recent = 0;
  let emailAvailable = true;
  const saved: Array<Record<string, unknown>> = [];
  const recipients: string[] = [];
  const queue = {
    count: async () => recent,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      saved.push(data);
      return { id: "issue-ticket-1" };
    },
  };
  const modules = [
    mock.module("../lib/member.ts", { namedExports: { requireMember: async () => {
      if (!signedIn) throw new Error("Access denied");
      return { id: "member-1", role: "TESTER", email: "tester@example.com" };
    } } }),
    mock.module("../lib/notifications.ts", { namedExports: { sendNotificationEmail: async (recipient: string) => {
      recipients.push(recipient);
      return emailAvailable;
    } } }),
    mock.module("next/headers", { namedExports: { headers: async () => new Headers({ "user-agent": "Test browser / OS" }) } }),
    mock.module("next/cache", { namedExports: { revalidatePath: () => undefined } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: { supportTicket: queue } } }),
    mock.module("../lib/quest-ledger.ts", { namedExports: { serializable: async (work: (tx: { supportTicket: typeof queue }) => Promise<unknown>) => work({ supportTicket: queue }) } }),
  ];
  try {
    const actions = await import(`../app/actions/enterpriseActions.ts?issue=${randomUUID()}`);
    const request = buildIssueSupportRequest(draft, "/account");
    assert.equal(request.ok, true);
    if (!request.ok) return;
    const response = await actions.submitSupportRequest(request.data);
    assert.equal(response.ok, true);
    if (response.ok) assert.equal(response.ticketId, "issue-ticket-1");
    assert.equal(saved[0].category, "Technical Bug");
    assert.equal(saved[0].userId, "member-1");
    assert.equal(saved[0].userAgent, "Test browser / OS");
    assert.equal(saved[0].route, "/account");
    assert.match(String(saved[0].message), /Viewport: 360 x 800 CSS px/);
    assert.deepEqual(recipients, ["terimus@seedenv.com"]);

    recent = 5;
    assert.equal((await actions.submitSupportRequest(request.data)).ok, false);
    assert.equal(saved.length, 1);
    recent = 0;
    signedIn = false;
    assert.equal((await actions.submitSupportRequest(request.data)).ok, false);
    assert.equal(saved.length, 1);
    signedIn = true;
    emailAvailable = false;
    const withoutEmail = await actions.submitSupportRequest(request.data);
    assert.equal(withoutEmail.ok, true);
    if (withoutEmail.ok) assert.equal(withoutEmail.emailNotified, false);
    assert.equal(saved.length, 2);
  } finally {
    for (const item of modules.reverse()) item.restore();
  }
});

test("issue form offers the correct action for signed-in and signed-out visitors", async () => {
  const action = mock.module("../app/actions/enterpriseActions.ts", { namedExports: { submitSupportRequest: async () => ({ ok: false, message: "Not sent" }) } });
  try {
    const { SupportIssueForm } = await import("../components/support-issue-form");
    const authenticated = renderToStaticMarkup(createElement(SupportIssueForm, { route: "/account", status: "authenticated" }));
    const guest = renderToStaticMarkup(createElement(SupportIssueForm, { route: "/tools", status: "unauthenticated" }));
    assert.match(authenticated, /Send issue report/);
    assert.match(guest, /Open email draft/);
    assert.match(guest, /must send to the team/);
    assert.match(guest, /Sign in to send directly/);
    for (const markup of [authenticated, guest]) {
      assert.match(markup, /Type of issue/);
      assert.match(markup, /What happened\?/);
      assert.match(markup, /Steps to reproduce/);
      assert.match(markup, /Query parameters are not included/);
    }
  } finally {
    action.restore();
  }
});
