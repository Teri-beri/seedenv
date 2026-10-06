import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { landingViews, landingViewHref, resolveLandingView } from "../lib/landing-views";

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
  assert.equal(landingViewHref("circle"), "/community");
  assert.equal(landingViews.some((view) => String(view.id) === "circle"), false);
  assert.deepEqual(["developers", "validators", "cohorts", "pricing", "mobile"].map((view) => landingViewHref(resolveLandingView(view))), ["#engine", "#validators", "#cohorts", "#pricing", "#pwa"]);
  for (const view of landingViews) {
    assert.equal(resolveLandingView(view.id), view.id);
    assert.equal(landingViewHref(view.id), `#${view.anchor}`);
  }
});

test("Account profile avoids unmigrated invoice columns and unrelated analytics", async () => {
  const previousOwner = process.env.SEEDENV_ANALYTICS_OWNER_EMAIL;
  process.env.SEEDENV_ANALYTICS_OWNER_EMAIL = "owner@example.invalid";
  let query: { include?: { transactions?: { select?: Record<string, boolean> } } } = {};
  let analyticsCalls = 0;
  const Empty = () => null;
  const modules = [
    mock.module("next-auth", { namedExports: { getServerSession: async () => ({ user: { id: "owner" } }) } }),
    mock.module("../app/api/auth/[...nextauth]/route.ts", { namedExports: { authOptions: {} } }),
    mock.module("next/navigation", { namedExports: { redirect: (path: string) => { throw new Error(`Unexpected redirect: ${path}`); } } }),
    mock.module("next/image", { defaultExport: Empty }),
    mock.module("next/link", { defaultExport: Empty }),
    mock.module("lucide-react", { namedExports: Object.fromEntries(["ArrowLeft", "ArrowRight", "BadgeCheck", "BriefcaseBusiness", "CheckCircle2", "ShieldCheck", "Sprout", "Trophy", "WalletCards"].map((name) => [name, Empty])) }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: { user: { findUnique: async (input: typeof query) => {
      query = input;
      if (!input.include?.transactions?.select || "invoiceSnapshot" in input.include.transactions.select) throw new Error("New invoice columns are unavailable in this simulated database.");
      return { id: "owner", email: "owner@example.invalid", username: "teriberi", role: "DEVELOPER", rankTier: "ALPHA_SEEDER", xpPoints: 0, walletBalanceCents: 0, submissions: [], campaigns: [], transactions: [], accounts: [], createdAt: new Date("2026-01-01"), notificationPreferences: {}, emailVerified: null };
    } } } } }),
    mock.module("../lib/analytics.ts", { namedExports: { getAnalyticsSummary: async () => { analyticsCalls++; throw new Error("Optional analytics unavailable."); } } }),
    mock.module("../components/AuthCheck.tsx", { defaultExport: Empty }),
    mock.module("../components/analytics-summary.tsx", { namedExports: { AnalyticsSummary: Empty } }),
    mock.module("../components/account-settings-form.tsx", { namedExports: { AccountSettingsForm: Empty } }),
    mock.module("../components/account-signout-button.tsx", { namedExports: { AccountSignOutButton: Empty } }),
    mock.module("../components/notification-settings-form.tsx", { namedExports: { NotificationSettingsForm: Empty } }),
    mock.module("../components/github-token-form.tsx", { namedExports: { GitHubTokenForm: Empty } }),
    mock.module("../components/password-settings-form.tsx", { namedExports: { PasswordSettingsForm: Empty } }),
    mock.module("../components/stripe-settings-card.tsx", { namedExports: { StripeSettingsCard: Empty } }),
    mock.module("../components/workspace-access-switcher.tsx", { namedExports: { WorkspaceAccessSwitcher: Empty } }),
    mock.module("../components/navigation.tsx", { namedExports: { DeveloperBottomNav: Empty, TesterBottomNav: Empty } }),
  ];
  try {
    const { default: AccountPage } = await import(`../app/account/page.tsx?account-compat=${randomUUID()}`);
    const result = await AccountPage({ searchParams: Promise.resolve({ tab: "profile" }) });
    assert.ok(result);
    assert.equal(analyticsCalls, 0);
    assert.deepEqual(Object.keys(query.include?.transactions?.select || {}).sort(), ["amountCents", "createdAt", "description", "id", "status", "type"]);
    await AccountPage({ searchParams: Promise.resolve({ tab: "security" }) });
    await AccountPage({ searchParams: Promise.resolve({ tab: "notifications" }) });
    assert.equal(analyticsCalls, 0);
  } finally {
    for (const item of modules.reverse()) item.restore();
    if (previousOwner === undefined) delete process.env.SEEDENV_ANALYTICS_OWNER_EMAIL;
    else process.env.SEEDENV_ANALYTICS_OWNER_EMAIL = previousOwner;
  }
});