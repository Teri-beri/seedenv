import test from "node:test";
import assert from "node:assert/strict";
import { createGeminiClient, type GeminiModels } from "@/lib/ai/gemini-client";
import { normalizeQaIntake, runQaIntakeAgent, type QaIntakeInput, type QaIntakeResult } from "@/lib/ai/agents/qa-intake.agent";
import { composeInstructionDetail, finalizeBlueprint } from "@/lib/ai/agents/spec-architect.agent";
import { finalizeSynthesis, type SynthesisInput } from "@/lib/ai/agents/synthesis.agent";
import { normalizeFraudVerdict, runFraudWatchdogAgent } from "@/lib/ai/agents/fraud-watchdog.agent";
import { buildClarificationNote, decideAuditOutcome, textSimilarity } from "@/lib/ai/qa-audit";
import { allowAgentCall, resetAgentLimits } from "@/lib/ai/agent-route";
import { isAutoApprovalDue, isFraudHeld } from "@/lib/auto-approval-window";

type Request = { model: string; contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>; config: Record<string, unknown> };

function fakeModels(replies: Array<string | Error>) {
  const requests: Request[] = [];
  const models = { generateContent: async (request: Request) => {
    requests.push({ ...request, contents: [...request.contents] });
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return { text: next ?? "" };
  } } as unknown as GeminiModels;
  return { requests, client: createGeminiClient({ models, sleep: async () => undefined, logger: { info() {}, warn() {}, error() {} } as never }) };
}

const intakeInput: QaIntakeInput = {
  missionTitle: "Checkout v2",
  missionSteps: ["Add an item to the cart", "Pay with Apple Pay"],
  feedbackText: "app broke",
  deviceInfo: { deviceModel: null, osBuild: null, appBuildVersion: null, networkType: null, screenResolution: null },
  hasScreenshot: false,
  hasRecording: false,
  crashLogExcerpt: null,
  existingSubmissions: [{ id: "sub_a", excerpt: "Apple Pay sheet freezes on iPhone 13" }],
};

const intake = (overrides: Partial<QaIntakeResult> = {}): QaIntakeResult => ({ qualityScore: 2, reproductionValid: false, missingFields: ["exact steps"], action: "REQUEST_CLARIFICATION", feedbackToTester: "Please add the exact steps you took.", isDuplicate: false, duplicateOfId: null, ...overrides });

test("low-effort report leads to clarification with concrete missing fields", async () => {
  const { client, requests } = fakeModels([JSON.stringify({ qualityScore: 2, reproductionValid: false, missingFields: [], action: "APPROVE", feedbackToTester: "Thanks! Could you describe what happened at each step?", isDuplicate: true, duplicateOfId: "made_up" })]);
  const result = await runQaIntakeAgent(client, intakeInput);
  assert.equal(result.action, "REQUEST_CLARIFICATION");
  assert.ok(result.missingFields.length > 0);
  assert.equal(result.isDuplicate, false, "invented duplicate IDs are dropped");
  assert.equal(requests[0].config.responseMimeType, "application/json");
  assert.match(String(requests[0].contents[0].parts.at(-1)?.text), /<untrusted[^>]*>[\s\S]*app broke/);
});

test("intake keeps real duplicate references and upgrades strong clarifications", () => {
  const dup = normalizeQaIntake({ qualityScore: 7, reproductionValid: true, missingFields: [], action: "APPROVE", feedbackToTester: "Clear report, thank you.", isDuplicate: true, duplicateOfId: " sub_a " }, intakeInput);
  assert.equal(dup.duplicateOfId, "sub_a");
  const strong = normalizeQaIntake({ qualityScore: 9, reproductionValid: true, missingFields: [], action: "REQUEST_CLARIFICATION", feedbackToTester: "Great detail throughout.", isDuplicate: false, duplicateOfId: "" }, intakeInput);
  assert.equal(strong.action, "APPROVE");
});

test("structured client repairs invalid JSON and retries transient errors", async () => {
  const transient = Object.assign(new Error("rate limited"), { status: 429 });
  const { client, requests } = fakeModels([transient, "not json", JSON.stringify({ qualityScore: 11 }), JSON.stringify({ qualityScore: 3, reproductionValid: false, missingFields: ["steps"], action: "REQUEST_CLARIFICATION", feedbackToTester: "Please list your steps.", isDuplicate: false, duplicateOfId: "" })]);
  const result = await runQaIntakeAgent(client, intakeInput);
  assert.equal(result.qualityScore, 3);
  assert.equal(requests.length, 4);
  assert.match(String(requests[3].contents.at(-1)?.parts[0].text), /failed validation/);
});

test("structured client gives up after three invalid responses and reports unconfigured keys", async () => {
  const { client } = fakeModels(["{}", "{}", "{}"]);
  await assert.rejects(runQaIntakeAgent(client, intakeInput), /failed schema validation/);
  const unconfigured = createGeminiClient({ apiKey: "", models: undefined });
  if (!unconfigured.configured) await assert.rejects(runQaIntakeAgent(unconfigured, intakeInput), /not configured/);
});

test("spec blueprint computes pool and packs acceptance criteria within 900 chars", () => {
  const detail = composeInstructionDetail("Open the app and sign up.", ["Welcome screen shows", "x".repeat(890)]);
  assert.ok(detail.length <= 900);
  assert.match(detail, /- Welcome screen shows/);
  assert.doesNotMatch(detail, /xxxx/);
  const blueprint = finalizeBlueprint({ suggestedTitle: "Checkout test", description: "Test the new checkout flow end to end.", targetVibe: "iPhone shoppers", recommendedTesters: 12, recommendedBountyPerTester: 4.333, estimatedMinutes: 9, devicePills: ["iPhone 15", " iPhone 15 "], taskPresets: [{ title: "Pay", category: "Core Flows", instructions: "Buy one item with Apple Pay.", acceptanceCriteria: ["Receipt appears"], proofType: "SCREENSHOT" }, { title: "Offline", category: "Edge Cases", instructions: "Turn on airplane mode and retry.", acceptanceCriteria: ["Error is friendly"], proofType: "TEXT_FEEDBACK" }] });
  assert.equal(blueprint.recommendedBountyPerTester, 4.33);
  assert.equal(blueprint.recommendedBountyPool, 51.96);
  assert.deepEqual(blueprint.devicePills, ["iPhone 15"]);
  assert.match(blueprint.taskPresets[0].instructionDetail, /Acceptance criteria:\n- Receipt appears/);
});

test("synthesis drops invented IDs, computes counts and neutralises mentions", () => {
  const input: SynthesisInput = { campaignTitle: "Shop @everyone", platform: "TESTFLIGHT", missionSteps: [], submissions: ["s1", "s2", "s3", "s4"].map((id, index) => ({ id, feedbackText: "x", deviceModel: index < 2 ? "iPhone 13" : "Pixel 8", osBuild: null, networkType: null, appBuildVersion: null, crashLogExcerpt: null })) };
  const cluster = (severity: "P0" | "P1" | "P2", ids: string[], title: string) => ({ title, severity, rootCause: "Race condition in payment sheet", stepsToReproduce: ["Open cart"], expectedResult: "Pays", actualResult: "Freezes", submissionIds: ids, suggestedFix: "" });
  const result = finalizeSynthesis({ executiveSummary: "Payments freeze for some iPhone testers; ping @octocat for details.", positiveSignals: ["Fast onboarding"], clusters: [cluster("P2", ["s3"], "Typo on receipt"), cluster("P0", ["s1", "s2", "ghost"], "Apple Pay freezes"), cluster("P1", ["ghost"], "Phantom bug")] }, input);
  assert.equal(result.validBugsCount, 2);
  assert.deepEqual([result.p0Count, result.p1Count, result.p2Count], [1, 0, 1]);
  assert.equal(result.clusters[0].title, "Apple Pay freezes");
  assert.equal(result.clusters[0].count, 2);
  assert.equal(result.clusters[0].reproRate, 0.5);
  assert.deepEqual(result.clusters[0].devices, ["iPhone 13"]);
  assert.doesNotMatch(result.githubMarkdownExport, /(^|[^`\u200b])@(octocat|everyone)/);
  assert.match(result.githubMarkdownExport, /## What worked/);
});

test("fraud verdicts are normalised and media is sent inline", async () => {
  assert.deepEqual(normalizeFraudVerdict({ riskScore: 20, isAuthentic: false, flags: ["WRONG_APP", "WRONG_APP"], explanation: " Different app. " }), { riskScore: 50, isAuthentic: false, flags: ["WRONG_APP"], explanation: "Different app." });
  assert.equal(normalizeFraudVerdict({ riskScore: 85, isAuthentic: true, flags: [], explanation: "Looks generated." }).isAuthentic, false);
  const { client, requests } = fakeModels([JSON.stringify({ riskScore: 10, isAuthentic: true, flags: [], explanation: "Checkout screen visible." })]);
  await runFraudWatchdogAgent(client, [{ data: Buffer.from("png"), mimeType: "image/png" }], { missionTitle: "Checkout", missionSteps: [], appName: "Shop", platform: "TESTFLIGHT", reportedDescription: "No bugs" });
  assert.equal((requests[0].contents[0].parts[0].inlineData as { mimeType: string }).mimeType, "image/png");
  assert.equal(requests[0].config.temperature, 0);
});

test("audit decisions: fraud holds, near copies, emulator boost and auto-clarify limits", () => {
  const clean = { riskScore: 10, isAuthentic: true, flags: [], explanation: "ok ok ok ok" };
  assert.deepEqual(decideAuditOutcome(intake(), clean, { nearCopyOfId: null, emulatorFlagged: false }), { status: "NEEDS_CLARIFICATION", fraudRiskScore: 10, fraudFlags: [], autoClarify: true });
  assert.equal(decideAuditOutcome(intake({ qualityScore: 5 }), clean, { nearCopyOfId: null, emulatorFlagged: false }).autoClarify, false);
  assert.equal(decideAuditOutcome(intake({ action: "APPROVE", qualityScore: 8 }), null, { nearCopyOfId: null, emulatorFlagged: false }).status, "APPROVED");
  assert.equal(decideAuditOutcome(intake({ action: "REJECT" }), null, { nearCopyOfId: null, emulatorFlagged: false }).status, "REJECTED");
  const copied = decideAuditOutcome(intake(), null, { nearCopyOfId: "sub_a", emulatorFlagged: false });
  assert.equal(copied.status, "FLAGGED_FRAUD");
  assert.equal(copied.autoClarify, false);
  assert.deepEqual(copied.fraudFlags, ["NEAR_COPY_OF_ANOTHER_REPORT"]);
  const emulator = decideAuditOutcome(intake({ action: "APPROVE", qualityScore: 8 }), { ...clean, riskScore: 50 }, { nearCopyOfId: null, emulatorFlagged: true });
  assert.equal(emulator.fraudRiskScore, 75);
  assert.equal(emulator.status, "FLAGGED_FRAUD");
  assert.equal(decideAuditOutcome(intake(), { ...clean, riskScore: 69 }, { nearCopyOfId: null, emulatorFlagged: false }).status, "NEEDS_CLARIFICATION");
});

test("clarification note is bounded and similarity catches copies", () => {
  const note = buildClarificationNote(intake({ feedbackToTester: "a".repeat(400) }));
  assert.ok(note.length <= 300);
  assert.match(note, /^SeedEnv QA assistant:/);
  const report = "Opened the cart, tapped Apple Pay, the payment sheet froze for ten seconds and then the app closed.";
  assert.ok(textSimilarity(report, report.toUpperCase().replace(/,/g, "")) >= 0.85);
  assert.ok(textSimilarity(report, "Signed up with email, the welcome screen loaded quickly and profile photo upload worked fine.") < 0.2);
  assert.equal(textSimilarity("too short", "too short"), 0);
});

test("fraud hold pauses auto-approval until a human clears it", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const base = { status: "PENDING", submittedAt: new Date("2026-10-09T12:00:00Z"), revisionRequestedAt: null, feedbackText: "done", proofImageUrl: null };
  assert.equal(isAutoApprovalDue(base, now), true);
  assert.equal(isAutoApprovalDue({ ...base, audit: { status: "FLAGGED_FRAUD", humanClearedAt: null } }, now), false);
  assert.equal(isAutoApprovalDue({ ...base, audit: { status: "FLAGGED_FRAUD", humanClearedAt: now } }, now), true);
  assert.equal(isAutoApprovalDue({ ...base, audit: { status: "NEEDS_CLARIFICATION", humanClearedAt: null } }, now), true);
  assert.equal(isFraudHeld(null), false);
});

test("agent rate limits enforce per-key hourly and daily caps", () => {
  resetAgentLimits();
  const now = Date.parse("2026-10-12T12:00:00Z");
  assert.equal(allowAgentCall("dev:1", 2, 100, now), true);
  assert.equal(allowAgentCall("dev:1", 2, 100, now + 1), true);
  assert.equal(allowAgentCall("dev:1", 2, 100, now + 2), false);
  assert.equal(allowAgentCall("dev:1", 2, 100, now + 3_600_001), true);
  resetAgentLimits();
  assert.equal(allowAgentCall("a", 10, 1, now), true);
  assert.equal(allowAgentCall("b", 10, 1, now), false);
  assert.equal(allowAgentCall("b", 10, 1, now + 86_400_000), true);
  resetAgentLimits();
});
