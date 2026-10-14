import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { mock } from "node:test";
import { resolveIncidentSeverity } from "../lib/telemetry/thresholds";

test("telemetry thresholds escalate service degradation server-side", () => {
  assert.equal(resolveIncidentSeverity({ requestedSeverity: "WARN", statusCode: "500" }), "CRITICAL");
  assert.equal(resolveIncidentSeverity({ requestedSeverity: "WARN", statusCode: "1006" }), "CRITICAL");
  assert.equal(resolveIncidentSeverity({ requestedSeverity: "WARN", statusCode: "FPS_DROP", payloadSnapshot: { fps: 11 } }), "CRITICAL");
  assert.equal(resolveIncidentSeverity({ requestedSeverity: "WARN", statusCode: "SLOW_API", payloadSnapshot: { latencyMs: 2800 } }), "CRITICAL");
  assert.equal(resolveIncidentSeverity({ requestedSeverity: "WARN", statusCode: "MEMORY", payloadSnapshot: { memoryMb: 1900 } }), "CRITICAL");
  assert.equal(resolveIncidentSeverity({ requestedSeverity: "WARN", statusCode: "FRAME_JITTER", payloadSnapshot: { fps: 48 } }), "WARN");
});

test("telemetry ingestion authenticates session access and assigns the validator server-side", async () => {
  let campaignAllowed = true;
  const createdRows: Array<Record<string, unknown>> = [];
  const modules = [
    mock.module("next-auth", { namedExports: { getServerSession: async () => ({ user: { id: "tester-1", role: "TESTER" } }) } }),
    mock.module("../lib/auth-options.ts", { namedExports: { authOptions: {} } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: {
      appCampaign: { findFirst: async () => campaignAllowed ? { id: "cohort-1" } : null },
      telemetryIncident: {
        count: async () => 0,
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdRows.push(data);
          return { id: "incident-1" };
        },
      },
    } } }),
    mock.module("../lib/telemetry/incident-alert.ts", { namedExports: { dispatchCriticalIncidentAlert: async () => true } }),
  ];
  try {
    const { POST } = await import("../app/api/telemetry/event/route");
    const payload = {
      cohortId: "cohort-1",
      severity: "WARN",
      statusCode: "FRAME_JITTER",
      endpoint: "WebSocket",
      deviceModel: "Pixel 8",
      osVersion: "Android 15",
      message: "Socket closed during arena replication.",
      validatorId: "spoofed-validator",
    };
    const response = await POST(new Request("https://seedenv.example/api/telemetry/event", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://seedenv.example", host: "seedenv.example" },
      body: JSON.stringify(payload),
    }));
    assert.equal(response.status, 400, "strict schema rejects client-supplied validator IDs");

    delete (payload as Partial<typeof payload>).validatorId;
    const accepted = await POST(new Request("https://seedenv.example/api/telemetry/event", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://seedenv.example", host: "seedenv.example" },
      body: JSON.stringify(payload),
    }));
    assert.equal(accepted.status, 201);
    assert.equal(createdRows[0]?.validatorId, "tester-1");

    const invalidSeverity = await POST(new Request("https://seedenv.example/api/telemetry/event", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://seedenv.example", host: "seedenv.example" },
      body: JSON.stringify({ ...payload, severity: "INFO" }),
    }));
    assert.equal(invalidSeverity.status, 400);

    campaignAllowed = false;
    const forbidden = await POST(new Request("https://seedenv.example/api/telemetry/event", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://seedenv.example", host: "seedenv.example" },
      body: JSON.stringify(payload),
    }));
    assert.equal(forbidden.status, 403);
  } finally {
    modules.reverse().forEach((item) => item.restore());
  }
});

test("critical incidents dispatch idempotent email and Discord alerts with a monitor deep link", async () => {
  const emails: unknown[][] = [];
  const webhooks: unknown[][] = [];
  const modules = [
    mock.module("../lib/prisma.ts", { namedExports: { prisma: {
      telemetryIncident: { findUnique: async () => ({
        id: "incident-1",
        severity: "CRITICAL",
        statusCode: "LUAU_NIL",
        endpoint: "LocalScript:42",
        deviceModel: "iPhone 15 Pro",
        osVersion: "iOS 18.2",
        message: "Nil instance indexing during inventory render.",
        cohort: {
          id: "cohort-1",
          title: "Arena Stress Run",
          developer: {
            email: "developer@example.invalid",
            discordWebhookUrl: "https://discord.com/api/webhooks/123/token",
            notificationPreferences: { email_telemetry_incidents: true },
          },
        },
      }) },
    } } }),
    mock.module("../lib/notifications.ts", { namedExports: {
      notificationEnabled: () => true,
      sendNotificationEmail: async (...args: unknown[]) => { emails.push(args); return true; },
    } }),
    mock.module("../lib/discord.ts", { namedExports: {
      sendDiscordWebhookMessage: async (...args: unknown[]) => { webhooks.push(args); return { ok: true, status: 204 }; },
    } }),
  ];
  const previousOrigin = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://seedenv.example";
  try {
    const { dispatchCriticalIncidentAlert } = await import("../lib/telemetry/incident-alert");
    assert.equal(await dispatchCriticalIncidentAlert("incident-1"), true);
    assert.equal(emails.length, 1);
    assert.equal(emails[0][0], "developer@example.invalid");
    assert.equal(emails[0][1], "[SeedEnv Incident] Service Degraded on Arena Stress Run");
    assert.match(String(emails[0][2]), /LUAU_NIL/);
    assert.match(String(emails[0][2]), /console\/monitor\?cohort=cohort-1&incident=incident-1/);
    assert.equal(emails[0][3], "telemetry-incident-incident-1");
    assert.equal(webhooks.length, 1);
    assert.match(String(webhooks[0][1]), /SeedEnv critical incident/);
  } finally {
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previousOrigin;
    modules.reverse().forEach((item) => item.restore());
  }
});

test("monitor UI, reversible pause, GitHub export, schema, and migration stay wired", async () => {
  const [monitor, action, exportRoute, schema, migration, settings] = await Promise.all([
    readFile("components/console/TelemetryMonitor.tsx", "utf8"),
    readFile("app/actions/telemetryActions.ts", "utf8"),
    readFile("app/api/telemetry/incidents/[id]/export-github/route.ts", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
    readFile("prisma/migrations/20261013_telemetry_incidents/migration.sql", "utf8"),
    readFile("components/notification-settings-form.tsx", "utf8"),
  ]);
  assert.match(monitor, /STREAMING LIVE/);
  assert.match(monitor, /Pause Cohort Drop/);
  assert.match(monitor, /AUTO-REFRESH 5S/);
  assert.match(monitor, /Export Issue/);
  assert.match(action, /CampaignStatus\.PAUSED/);
  assert.match(action, /CampaignStatus\.ACTIVE/);
  assert.match(exportRoute, /createGitHubIssue/);
  assert.match(schema, /model TelemetryIncident/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "TelemetryIncident"/);
  assert.match(settings, /email_telemetry_incidents/);
});
