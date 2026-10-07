import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

type Call = { model: string; contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>; config: { tools: Array<{ functionDeclarations: Array<{ name: string }> }>; systemInstruction: string } };

function fakeClient(script: Array<{ text?: string; functionCalls?: Array<{ id?: string; name: string; args?: Record<string, unknown> }> }>) {
  const calls: Call[] = [];
  return { calls, client: { models: { generateContent: async (request: Call) => {
    calls.push(JSON.parse(JSON.stringify(request)));
    const step = script.shift() ?? { text: "done" };
    return { text: step.text, functionCalls: step.functionCalls, candidates: [{ content: { role: "model", parts: (step.functionCalls ?? []).map((functionCall) => ({ functionCall })) } }] };
  } } } };
}

async function loadAgent(where: Array<Record<string, unknown>>) {
  const capture = (rows: unknown[]) => async (args: { where: Record<string, unknown> }) => { where.push(args.where); return rows; };
  const modules = [
    mock.module("../lib/prisma.ts", { namedExports: { prisma: {
      user: { findUnique: async (args: { where: Record<string, unknown> }) => { where.push(args.where); return { role: "DEVELOPER", username: "dev", testerWorkspaceEnabled: false, developerWorkspaceEnabled: true, fundingBalanceCents: 4250, autoReloadCents: 0, walletBalanceCents: 0, stripeConnectAccountId: null, stripeCustomerId: "cus_1", rankTier: "SEED", xpPoints: 0 }; } },
      appCampaign: { findMany: capture([]) },
      missionApplication: { findMany: capture([]) },
      submission: { findMany: capture([]) },
      walletTransaction: { findMany: capture([]) },
    } } }),
  ];
  const agent = await import(`../lib/support-agent.ts?t=${randomUUID()}`);
  return { agent, restore: () => modules.forEach((item) => item.restore()) };
}

test("support agent scopes account tools to the session member and ignores model-supplied ids", async () => {
  const where: Array<Record<string, unknown>> = [];
  const { agent, restore } = await loadAgent(where);
  try {
    const { client, calls } = fakeClient([
      { functionCalls: [{ id: "1", name: "get_my_account", args: { userId: "victim" } }, { id: "2", name: "list_my_cohorts", args: { developerId: "victim" } }, { id: "3", name: "list_my_payments" }] },
      { text: "Your balance is $42.50." },
    ]);
    const result = await agent.runSupportAgent({ messages: [{ role: "user", text: "What's my balance?" }], member: { id: "member-1", role: "DEVELOPER", username: "dev" }, route: "/console" }, client);
    assert.equal(result.reply, "Your balance is $42.50.");
    assert.equal(result.escalation, null);
    assert.deepEqual(where, [{ id: "member-1" }, { developerId: "member-1" }, { userId: "member-1" }]);
    const response = calls[1].contents.at(-1)!.parts[0].functionResponse as { response: { result: { prepaidBalance: string } } };
    assert.equal(response.response.result.prepaidBalance, "$42.50");
    assert.match(calls[0].config.systemInstruction, /20% platform fee/);
    assert.match(calls[0].config.systemInstruction, /No card processing/);
  } finally {
    restore();
  }
});

test("visitors get no account tools and escalation returns a reviewable draft", async () => {
  const where: Array<Record<string, unknown>> = [];
  const { agent, restore } = await loadAgent(where);
  try {
    const { client, calls } = fakeClient([
      { functionCalls: [{ name: "list_my_payments" }, { name: "escalate_to_human", args: { category: "Billing & Escrow", subject: "Charge question", summary: "Visitor asks about a charge." } }] },
      { text: "" },
    ]);
    const result = await agent.runSupportAgent({ messages: [{ role: "user", text: "I want a human" }], member: null, route: "/" }, client);
    assert.deepEqual(calls[0].config.tools[0].functionDeclarations.map((tool) => tool.name), ["escalate_to_human"]);
    assert.equal(where.length, 0);
    assert.deepEqual(result.escalation, { category: "Billing & Escrow", subject: "Charge question", summary: "Visitor asks about a charge." });
    assert.match(result.reply, /ticket/);
  } finally {
    restore();
  }
});

test("support agent stops after a bounded number of tool rounds", async () => {
  const { agent, restore } = await loadAgent([]);
  try {
    const loop = Array.from({ length: 10 }, () => ({ functionCalls: [{ name: "list_my_payments" }] }));
    const { client, calls } = fakeClient(loop);
    const result = await agent.runSupportAgent({ messages: [{ role: "user", text: "loop" }], member: { id: "m", role: "TESTER", username: "t" }, route: "/" }, client);
    assert.equal(calls.length, 4);
    assert.match(result.reply, /human/);
  } finally {
    restore();
  }
});

test("support chat limits bursts per member and visitor and enforces the daily ceiling", async () => {
  const { allowSupportChat, resetSupportChatLimits } = await import("../lib/support-rate-limit");
  resetSupportChatLimits();
  const now = Date.UTC(2026, 0, 1, 12);
  for (let index = 0; index < 12; index += 1) assert.equal(allowSupportChat("ip:1", false, now), true);
  assert.equal(allowSupportChat("ip:1", false, now), false);
  assert.equal(allowSupportChat("ip:1", false, now + 11 * 60 * 1000), true);
  for (let index = 0; index < 30; index += 1) assert.equal(allowSupportChat("m:1", true, now), true);
  assert.equal(allowSupportChat("m:1", true, now), false);
  resetSupportChatLimits();
  process.env.SUPPORT_AI_DAILY_LIMIT = "3";
  try {
    assert.equal(allowSupportChat("a", true, now), true);
    assert.equal(allowSupportChat("b", true, now), true);
    assert.equal(allowSupportChat("c", true, now), true);
    assert.equal(allowSupportChat("d", true, now), false);
    assert.equal(allowSupportChat("d", true, now + 24 * 60 * 60 * 1000), true);
  } finally {
    delete process.env.SUPPORT_AI_DAILY_LIMIT;
    resetSupportChatLimits();
  }
});

test("support chat route is unavailable without a Gemini key and rejects non-JSON posts", async () => {
  const key = process.env.GEMINI_API_KEY;
  const modules = [
    mock.module("../app/api/auth/[...nextauth]/route.ts", { namedExports: { authOptions: {} } }),
    mock.module("next-auth", { namedExports: { getServerSession: async () => null } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: {} } }),
  ];
  try {
    const { POST } = await import(`../app/api/support/chat/route.ts?t=${randomUUID()}`);
    delete process.env.GEMINI_API_KEY;
    const body = JSON.stringify({ messages: [{ role: "user", text: "hi" }] });
    assert.equal((await POST(new Request("http://x/api/support/chat", { method: "POST", headers: { "content-type": "application/json" }, body }))).status, 503);
    process.env.GEMINI_API_KEY = "test-key";
    assert.equal((await POST(new Request("http://x/api/support/chat", { method: "POST", headers: { "content-type": "text/plain" }, body }))).status, 415);
    assert.equal((await POST(new Request("http://x/api/support/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", text: "x".repeat(2001) }] }) }))).status, 400);
    assert.equal((await POST(new Request("http://x/api/support/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "assistant", text: "hello" }] }) }))).status, 400);
  } finally {
    if (key === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = key;
    modules.forEach((item) => item.restore());
  }
});
