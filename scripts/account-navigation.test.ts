import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { landingSectionReached, landingViews, landingViewHref, resolveLandingView } from "../lib/landing-views";
import { workspaceHome } from "../lib/workspace-navigation";

test("production npm startup applies pending database migrations before serving traffic", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(pkg.scripts.start, "prisma migrate deploy && tsx scripts/ensure-schema.ts && next start");
  assert.doesNotMatch(pkg.scripts.start, /seed/, "production startup must never seed demo data");
  assert.match(await readFile("render.yaml", "utf8"), /startCommand: npm run start/);
  assert.match(await readFile("prisma/migrations/20261005_enterprise_billing_support/migration.sql", "utf8"), /ADD COLUMN "campaignId" TEXT/);
  assert.match(await readFile("prisma/migrations/migration_lock.toml", "utf8"), /provider = "postgresql"/);
});

test("landing destinations map to continuous-page anchors and keep safe legacy routing", () => {
  assert.equal(resolveLandingView(undefined), "overview");
  assert.equal(resolveLandingView("not-a-section"), "overview");
  assert.equal(landingViewHref("overview"), "#top");
  assert.equal(resolveLandingView("circle"), "circle");
  assert.equal(landingViewHref("circle"), "/launch-circle");
  assert.equal(landingViews.some((view) => String(view.id) === "circle"), false);
  assert.deepEqual(["developers", "validators", "cohorts", "pricing", "mobile"].map((view) => landingViewHref(resolveLandingView(view))), ["#engine", "#validators", "#cohorts", "#pricing", "#pwa"]);
  for (const view of landingViews) {
    assert.equal(resolveLandingView(view.id), view.id);
    assert.equal(landingViewHref(view.id), `#${view.anchor}`);
  }
});

test("workspace navigation sends administrators and developers to the console", () => {
  assert.equal(workspaceHome("ADMIN"), "/console");
  assert.equal(workspaceHome("DEVELOPER"), "/console");
  assert.equal(workspaceHome("TESTER"), "/dashboard");
  assert.equal(workspaceHome(undefined), "/dashboard");
});

test("landing active sections account for scroll padding and anchor margins", () => {
  assert.equal(landingSectionReached(168, 88, 80), true);
  assert.equal(landingSectionReached(144, 88, 56), true);
  assert.equal(landingSectionReached(171, 88, 80), false);
  assert.equal(landingSectionReached(130, 0, 0), true);
  assert.equal(landingSectionReached(131, 0, 0), false);
});

test("the landing Console link points to the correct workspace for each role", async () => {
  const Empty = () => null;
  const modules = [
    mock.module("next-auth/react", { namedExports: { useSession: () => ({ data: null, status: "unauthenticated" }) } }),
    mock.module("next/navigation", { namedExports: { useRouter: () => ({ push: () => {} }) } }),
    mock.module("next/image", { defaultExport: Empty }),
    mock.module("next/link", { defaultExport: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }),
    mock.module("../components/analytics-tracker.tsx", { namedExports: { AnalyticsTracker: Empty, trackAnalytics: () => {} } }),
    mock.module("../components/status-pill.tsx", { namedExports: { StatusPill: Empty } }),
    mock.module("../components/public-footer.tsx", { namedExports: { PublicFooter: Empty } }),
    mock.module("../components/PricingCalculator.tsx", { namedExports: { PricingCalculator: Empty } }),
    mock.module("../components/TelemetryGridCanvas.tsx", { defaultExport: Empty }),
    mock.module("../components/landing-platform-fee-offer.tsx", { namedExports: { LandingPlatformFeeOfferCard: Empty } }),
    mock.module("../components/ui/SegmentedTabs.tsx", { namedExports: { SegmentedTabs: Empty } }),
    mock.module("../components/telemetry-sandbox.tsx", { namedExports: {
      SandboxBadge: Empty,
      ScenarioCard: Empty,
      ScenarioDrawer: Empty,
      sandboxScenarios: [],
      useScenarioInspector: () => ({ active: null, inspect: () => {}, onOpenChange: () => {} }),
    } }),
  ];
  try {
    const { PublicLanding } = await import(`../components/public-landing.tsx?workspace=${randomUUID()}`);
    for (const [role, destination] of [["ADMIN", "/console"], ["DEVELOPER", "/console"], ["TESTER", "/dashboard"]] as const) {
      const html = renderToStaticMarkup(createElement(PublicLanding, { missions: [], viewer: { id: "member", role } }));
      const actions = html.match(/<nav[^>]*aria-label="Landing actions"[^>]*>.*?<\/nav>/)?.[0] ?? "";
      assert.match(actions, new RegExp(`href="${destination}"[^>]*>Console<\\/a>`));
      assert.doesNotMatch(actions, /href="\/admin"/);
      assert.match(actions, /href="\/account"[^>]*aria-label="Account profile"/);
      assert.doesNotMatch(actions, /Deploy a Cohort/);
    }
    const visitor = renderToStaticMarkup(createElement(PublicLanding, { missions: [], viewer: null }));
    const visitorActions = visitor.match(/<nav[^>]*aria-label="Landing actions"[^>]*>.*?<\/nav>/)?.[0] ?? "";
    const desktopSections = visitor.match(/<nav[^>]*aria-label="Landing sections"[^>]*>.*?<\/nav>/)?.[0] ?? "";
    for (const section of landingViews) {
      assert.match(desktopSections, new RegExp(`href="${landingViewHref(section.id)}"[^>]*>${section.label}<\\/a>`));
    }
    assert.match(desktopSections, /href="#top"[^>]*aria-current="location"[^>]*>Overview<\/a>/);
    assert.match(visitorActions, /href="\/auth\/signin"[^>]*aria-label="Sign in or create an account"/);
    assert.doesNotMatch(visitorActions, /Deploy a Cohort/);
    assert.match(visitor, /href="#free-tools"/);
    const toolsSection = visitor.match(/<section[^>]*id="free-tools"[\s\S]*?<\/section>/)?.[0] || "";
    assert.match(toolsSection, /Free utilities \/ no login \/ no credit card/);
    for (const path of ["/tools/swarm-detector", "/tools/viewport-check", "/tools/qa-checklist"]) {
      assert.ok(toolsSection.includes(`href="${path}"`), path);
    }
    assert.doesNotMatch(toolsSection, /href="\/auth\/|dashboard\/projects/);
  } finally {
    for (const moduleMock of modules.reverse()) moduleMock.restore();
  }
});

test("Account profile avoids unmigrated invoice columns and unrelated analytics", async () => {
  const previousOwner = process.env.SEEDENV_ANALYTICS_OWNER_EMAIL;
  process.env.SEEDENV_ANALYTICS_OWNER_EMAIL = "owner@example.invalid";
  let query: { include?: { transactions?: { select?: Record<string, boolean> } } } = {};
  let analyticsCalls = 0;
  let role: "ADMIN" | "DEVELOPER" | "TESTER" = "DEVELOPER";
  const Empty = () => null;
  const PassThrough = ({ children }: { children: ReactNode }) => createElement("div", null, children);
  const modules = [
    mock.module("next-auth", { namedExports: { getServerSession: async () => ({ user: { id: "owner" } }) } }),
    mock.module("../lib/auth-options.ts", { namedExports: { authOptions: {} } }),
    mock.module("next/navigation", { namedExports: { redirect: (path: string) => { throw new Error(`Unexpected redirect: ${path}`); } } }),
    mock.module("next/image", { defaultExport: Empty }),
    mock.module("next/link", { defaultExport: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children) }),
    mock.module("lucide-react", { namedExports: Object.fromEntries(["ArrowLeft", "ArrowRight", "BadgeCheck", "BriefcaseBusiness", "CheckCircle2", "ShieldCheck", "Sprout", "Trophy", "WalletCards"].map((name) => [name, Empty])) }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: { user: { findUnique: async (input: typeof query) => {
      query = input;
      if (!input.include?.transactions?.select || "invoiceSnapshot" in input.include.transactions.select) throw new Error("New invoice columns are unavailable in this simulated database.");
      return { id: "owner", email: "owner@example.invalid", username: "teriberi", role, rankTier: "ALPHA_SEEDER", xpPoints: 0, walletBalanceCents: 0, submissions: [], campaigns: [], transactions: [], accounts: [], developerReferralReceived: null, developerReferralsSent: [], ownedPromoCodes: [], feeCredits: [], createdAt: new Date("2026-01-01"), notificationPreferences: {}, emailVerified: null };
    } } } } }),
    mock.module("../lib/analytics.ts", { namedExports: { getAnalyticsSummary: async () => { analyticsCalls++; throw new Error("Optional analytics unavailable."); } } }),
    mock.module("../components/AuthCheck.tsx", { defaultExport: PassThrough }),
    mock.module("../components/analytics-summary.tsx", { namedExports: { AnalyticsSummary: Empty } }),
    mock.module("../components/account-settings-form.tsx", { namedExports: { AccountSettingsForm: Empty } }),
    mock.module("../components/developer-referral-settings.tsx", { namedExports: { DeveloperReferralSettings: Empty } }),
    mock.module("../components/account-signout-button.tsx", { namedExports: { AccountSignOutButton: Empty } }),
    mock.module("../components/notification-settings-form.tsx", { namedExports: { NotificationSettingsForm: Empty } }),
    mock.module("../components/github-token-form.tsx", { namedExports: { GitHubTokenForm: Empty } }),
    mock.module("../components/password-settings-form.tsx", { namedExports: { PasswordSettingsForm: Empty } }),
    mock.module("../components/stripe-settings-card.tsx", { namedExports: { StripeSettingsCard: Empty } }),
    mock.module("../components/workspace-access-switcher.tsx", { namedExports: { WorkspaceAccessSwitcher: Empty } }),
    mock.module("../components/navigation.tsx", { namedExports: { DeveloperBottomNav: Empty, TesterBottomNav: Empty } }),
    mock.module("../components/developer-resources.tsx", { namedExports: { DeveloperResources: () => createElement("div", null, "developer-resources-panel") } }),
  ];
  try {
    const { default: AccountPage } = await import(`../app/account/page.tsx?account-compat=${randomUUID()}`);
    const result = await AccountPage({ searchParams: Promise.resolve({ tab: "profile" }) });
    const developerPage = renderToStaticMarkup(result);
    assert.match(developerPage, /<a href="\/console"[^>]*>.*?Back<\/a>/);
    assert.doesNotMatch(developerPage, /Private Admin Control/);
    assert.match(developerPage, /href="\/account\?tab=resources"[^>]*>Developer Resources<\/a>/);
    assert.doesNotMatch(developerPage, /developer-resources-panel/);
    assert.match(renderToStaticMarkup(await AccountPage({ searchParams: Promise.resolve({ tab: "resources" }) })), /developer-resources-panel/);
    assert.equal(analyticsCalls, 0);
    assert.deepEqual(Object.keys(query.include?.transactions?.select || {}).sort(), ["amountCents", "createdAt", "description", "id", "status", "type"]);
    await AccountPage({ searchParams: Promise.resolve({ tab: "security" }) });
    await AccountPage({ searchParams: Promise.resolve({ tab: "notifications" }) });
    assert.equal(analyticsCalls, 0);

    role = "ADMIN";
    const adminPage = renderToStaticMarkup(await AccountPage({ searchParams: Promise.resolve({}) }));
    assert.match(adminPage, /<a href="\/console"[^>]*>.*?Back<\/a>/);
    assert.match(adminPage, /<a href="\/admin"[^>]*>.*?Private Admin Control/);
    assert.match(adminPage, /href="\/account\?tab=resources"/);

    role = "TESTER";
    const testerPage = renderToStaticMarkup(await AccountPage({ searchParams: Promise.resolve({}) }));
    assert.match(testerPage, /<a href="\/dashboard"[^>]*>.*?Back<\/a>/);
    assert.doesNotMatch(testerPage, /Private Admin Control/);
    assert.doesNotMatch(testerPage, /tab=resources/);
    assert.doesNotMatch(renderToStaticMarkup(await AccountPage({ searchParams: Promise.resolve({ tab: "resources" }) })), /developer-resources-panel/);
  } finally {
    for (const item of modules.reverse()) item.restore();
    if (previousOwner === undefined) delete process.env.SEEDENV_ANALYTICS_OWNER_EMAIL;
    else process.env.SEEDENV_ANALYTICS_OWNER_EMAIL = previousOwner;
  }
});
test("developer tools live in account resources instead of the console tab bar", async () => {
  const { developerResources } = await import("../components/developer-resources");
  const hrefs = developerResources.map((resource) => resource.href);
  for (const href of ["/console/monitor", "/tools/swarm-detector", "/docs", "/status"]) assert.ok(hrefs.includes(href), href);
  const header = await readFile(new URL("../components/console-header.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(header, /href: "\/console\/monitor"|href: "\/tools\/swarm-detector"/);
  const navigation = await readFile(new URL("../components/navigation.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(navigation, /\/console\/monitor/);
});
