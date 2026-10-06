import test from "node:test";
import assert from "node:assert/strict";
import { classifyHardwareSignals } from "../lib/hardware-integrity";
import { buildGitHubIssue, GITHUB_REPO_PATTERN } from "../lib/github-issue-format";

const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

test("hardware signals flag emulator GPUs, touchless mobile UAs, and headless browsers", () => {
  assert.equal(classifyHardwareSignals(null, iphone).integrity, "UNVERIFIED");
  assert.equal(classifyHardwareSignals({ gpuRenderer: "Apple GPU", isTouchCapable: true, webglBlocked: false }, iphone).integrity, "VERIFIED_PHYSICAL_NODE");
  const swift = classifyHardwareSignals({ gpuRenderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))", isTouchCapable: true, webglBlocked: false }, "Mozilla/5.0 (Linux; Android 14)");
  assert.equal(swift.integrity, "EMULATOR_FLAGGED");
  assert.match(swift.flags[0], /^EMULATOR_GPU/);
  assert.deepEqual(classifyHardwareSignals({ gpuRenderer: "Adreno 740", isTouchCapable: false, webglBlocked: false }, "Mozilla/5.0 (Linux; Android 14)").flags, ["MOBILE_UA_WITHOUT_TOUCH"]);
  assert.ok(classifyHardwareSignals({ gpuRenderer: "Apple M2", isTouchCapable: false, webglBlocked: false }, "Mozilla/5.0 HeadlessChrome/120").flags.includes("AUTOMATION_USER_AGENT"));
  assert.equal(classifyHardwareSignals({ gpuRenderer: null, isTouchCapable: true, webglBlocked: false }, iphone).integrity, "UNVERIFIED");
});

test("GitHub issues neutralize mentions, escape fences, and truncate logs", () => {
  const issue = buildGitHubIssue({
    id: "sub_1", feedbackText: "Checkout crashes @octocat\nSecond line", recordingUrl: "javascript:alert(1)", proofImageUrl: "proofs/a.png",
    osBuild: "iOS 18.2", deviceModel: "iPhone | 16", screenResolution: null, appBuildVersion: "1.4 (22)", networkType: "5G",
    crashLogs: "```\\nboom\\n" + "x".repeat(7000), networkLogs: null, hardwareStatus: "EMULATOR_FLAGGED", hardwareFlags: ["MOBILE_UA_WITHOUT_TOUCH"],
    gpuRenderer: "Apple GPU", batteryLevel: 0.42, createdAt: new Date("2026-10-06T12:00:00Z"),
    tester: { username: "tester1" }, campaign: { id: "c1", title: "Beta", platform: "TESTFLIGHT" },
  }, "https://seedenv.com");
  assert.equal(issue.title, "[SeedEnv] Beta: Checkout crashes @octocat");
  assert.ok(!/@octocat/.test(issue.body));
  assert.match(issue.body, /iPhone \\\| 16/);
  assert.match(issue.body, /Screen recording: not provided/);
  assert.match(issue.body, /````text/);
  assert.match(issue.body, /truncated/);
  assert.match(issue.body, /Emulator signals detected/);
  assert.match(issue.body, /42%/);
  assert.ok(GITHUB_REPO_PATTERN.test("acme/mobile-app.v2"));
  assert.ok(!GITHUB_REPO_PATTERN.test("acme/../../user"));
});
