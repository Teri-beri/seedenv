import assert from "node:assert/strict";
import test from "node:test";
import { analyzeCoordination, classifyForensics, computeSwarmMetrics, getSanityVerdict, parseRelativeTimeOffset, parseSwarmInput } from "@/lib/swarm-detector";

test("organic comments remain below the watchlist threshold", () => {
  const entries = parseSwarmInput(`alice | Search worked well, though filters could be clearer. | 2026-10-14T08:00:00Z
bob | Checkout loaded slowly on cellular data. | 2026-10-14T10:30:00Z
carol | The onboarding instructions were easy to follow. | 2026-10-14T13:15:00Z
dave | I found a typo in the billing settings panel. | 2026-10-14T16:45:00Z
erin | Dark mode has low contrast on the profile screen. | 2026-10-14T20:00:00Z`);

  const metrics = computeSwarmMetrics(entries);
  assert.ok(metrics.inauthenticityIndex < 35, `organic index was ${metrics.inauthenticityIndex}`);
  assert.equal(metrics.label, "Stable");
  assert.ok(metrics.pipelineStrength < 50);
});

test("coordinated duplicate comments produce a high-risk verdict", () => {
  const entries = parseSwarmInput(JSON.stringify([
    { author: "alpha", text: "The hidden fee is unacceptable, cancel this launch now", timestamp: "2026-10-14T08:00:00Z" },
    { author: "bravo", text: "The hidden fee is unacceptable, cancel this launch now", timestamp: "2026-10-14T08:00:40Z" },
    { author: "charlie", text: "The hidden fee is unacceptable, cancel this launch now", timestamp: "2026-10-14T08:01:10Z" },
    { author: "delta", text: "The hidden fee is unacceptable, cancel this launch now", timestamp: "2026-10-14T08:01:50Z" },
    { author: "echo", text: "The hidden fee is unacceptable, cancel this launch now", timestamp: "2026-10-14T08:02:30Z" },
    { author: "foxtrot", text: "The hidden fee is unacceptable, cancel this launch now", timestamp: "2026-10-14T08:03:00Z" },
  ]));

  const metrics = computeSwarmMetrics(entries);
  assert.ok(metrics.inauthenticityIndex >= 80, `coordinated index was ${metrics.inauthenticityIndex}`);
  assert.equal(metrics.label, "Critical swarm");
  assert.equal(metrics.narrativeOverlap, 1);
  assert.equal(metrics.burstDensity, 1);
});

test("missing and invalid timestamps are deterministic and excluded from burst scoring", () => {
  const input = JSON.stringify([
    { author: "alice", text: "This exact sentence appears twice" },
    { author: "bob", text: "This exact sentence appears twice", timestamp: "not-a-date" },
  ]);

  const firstEntries = parseSwarmInput(input);
  const secondEntries = parseSwarmInput(input);
  assert.deepEqual(firstEntries, secondEntries);
  assert.equal(firstEntries[0].sortTime, null);
  assert.equal(firstEntries[1].sortTime, null);

  const firstMetrics = computeSwarmMetrics(firstEntries);
  const secondMetrics = computeSwarmMetrics(secondEntries);
  assert.deepEqual(firstMetrics, secondMetrics);
  assert.equal(firstMetrics.burstDensity, 0);
  assert.match(firstMetrics.notes[1], /valid timestamps/);
});

test("malformed JSON is rejected instead of being interpreted as delimited text", () => {
  assert.deepEqual(parseSwarmInput('[{"author":"alice"'), []);
});

test("similar synchronized narratives form a coordination cluster without exact duplicates", () => {
  const entries = parseSwarmInput(`jules | The pricing page doesn't say why the fees are jumping. This is the exact same copy seeing across the comments on every channel. | 2026-10-14T08:03:00Z
mila | The pricing page doesn't say why the fees are jumping. Same copy, same tone, same timing. | 2026-10-14T08:04:10Z
nova | I keep seeing the same scripted comment about hidden fees on the pricing page. | 2026-10-14T08:05:40Z
otto | Why are the fees hidden? This copy feels coordinated. | 2026-10-14T08:06:20Z
sora | The pricing page is confusing and this message is repeating across every thread in the same 10 minutes. | 2026-10-14T08:07:15Z
aria | I enjoyed the redesign and the checkout was easy to use. | 2026-10-14T08:08:07Z`);

  const results = analyzeCoordination(entries);
  assert.ok(results.flaggedRatio >= 60, `flagged ratio was ${results.flaggedRatio}`);
  assert.ok(results.flaggedAuthors.includes("jules"));
  assert.ok(results.flaggedAuthors.includes("mila"));
  assert.ok(!results.flaggedAuthors.includes("aria"));
  assert.ok(results.duplicatePhrases.length > 1);
  assert.ok(results.recurringTokens.includes("pricing"));
});

test("organic comments do not get removed by the noise-canceling cluster", () => {
  const entries = parseSwarmInput(`alice | Search worked well, though filters could be clearer. | 2026-10-14T08:00:00Z
bob | Checkout loaded slowly on cellular data. | 2026-10-14T08:02:00Z
carol | The onboarding instructions were easy to follow. | 2026-10-14T08:04:00Z`);

  assert.deepEqual(analyzeCoordination(entries), {
    flaggedRatio: 0,
    duplicatePhrases: [],
    recurringTokens: [],
    flaggedAuthors: [],
  });
});

test("messy social clipboard text is cleaned into deterministic relative-time records", () => {
  const entries = parseSwarmInput(`@pixel.pilot · 2h ago
The checkout button keeps freezing after I tap pay.
Reply
1,204 likes

launchwatcher
The checkout button freezes every time I tap pay.
3h ago
Reply
View 12 replies

human.user
I liked the new colors and the page loaded quickly.
2d ago
42 likes`);

  assert.deepEqual(entries, [
    {
      author: "pixel.pilot",
      text: "The checkout button keeps freezing after I tap pay.",
      timestamp: "2h ago",
      timeOffsetSec: 7_200,
      sortTime: -7_200_000,
    },
    {
      author: "launchwatcher",
      text: "The checkout button freezes every time I tap pay.",
      timestamp: "3h ago",
      timeOffsetSec: 10_800,
      sortTime: -10_800_000,
    },
    {
      author: "human.user",
      text: "I liked the new colors and the page loaded quickly.",
      timestamp: "2d ago",
      timeOffsetSec: 172_800,
      sortTime: -172_800_000,
    },
  ]);
});

test("relative social timestamps support compact and human-readable units", () => {
  assert.equal(parseRelativeTimeOffset("45s"), 45);
  assert.equal(parseRelativeTimeOffset("12 min ago"), 720);
  assert.equal(parseRelativeTimeOffset("2d ago"), 172_800);
  assert.equal(parseRelativeTimeOffset("Yesterday"), 86_400);
  assert.equal(parseRelativeTimeOffset("Reply"), null);
});


test("forensic quadrant distinguishes manufactured hate from genuine backlash", () => {
  const coordinated = parseSwarmInput(JSON.stringify([
    { author: "bot1", text: "This fake app is a terrible scam, cancel it now", timeOffsetSec: 1 },
    { author: "bot2", text: "This fake app is a terrible scam, cancel it now", timeOffsetSec: 2 },
    { author: "bot3", text: "This fake app is a terrible scam, cancel it now", timeOffsetSec: 3 },
  ]));
  const coordinatedMetrics = computeSwarmMetrics(coordinated);
  const coordinatedCluster = analyzeCoordination(coordinated);
  const manufactured = classifyForensics(coordinated, coordinatedMetrics, coordinatedCluster);
  assert.equal(manufactured.quadrant, "Manufactured Hate");
  assert.equal(manufactured.sentimentLabel, "Negative");
  assert.equal(manufactured.arrivalVelocity, 1.5);

  const organic = parseSwarmInput(`alice | This update is terrible and slow. | 2026-10-14T08:00:00Z
bob | Search is broken on my phone. | 2026-10-14T12:00:00Z
carol | The hidden fee is bad for customers. | 2026-10-14T18:00:00Z`);
  const organicResult = classifyForensics(organic, computeSwarmMetrics(organic), analyzeCoordination(organic));
  assert.equal(organicResult.quadrant, "Genuine Backlash");
});

test("sanity verdict maps the inauthenticity index to plain-language bands", () => {
  assert.equal(getSanityVerdict(100).title, "Manufactured Swarm");
  assert.equal(getSanityVerdict(60).title, "Manufactured Swarm");
  assert.equal(getSanityVerdict(59).title, "Echo Chamber");
  assert.equal(getSanityVerdict(30).title, "Echo Chamber");
  assert.equal(getSanityVerdict(29).title, "Organic Discourse");
  assert.equal(getSanityVerdict(0).title, "Organic Discourse");

  assert.equal(getSanityVerdict(85).tone, "alarm");
  assert.equal(getSanityVerdict(45).tone, "caution");
  assert.equal(getSanityVerdict(5).tone, "calm");
});

test("sanity verdict matches the forensic score of a coordinated swarm", () => {
  const entries = parseSwarmInput(JSON.stringify([
    { author: "bot1", text: "This fake app is a terrible scam, cancel it now", timeOffsetSec: 1 },
    { author: "bot2", text: "This fake app is a terrible scam, cancel it now", timeOffsetSec: 2 },
    { author: "bot3", text: "This fake app is a terrible scam, cancel it now", timeOffsetSec: 3 },
  ]));
  const verdict = getSanityVerdict(computeSwarmMetrics(entries).inauthenticityIndex);
  assert.equal(verdict.title, "Manufactured Swarm");
  assert.equal(verdict.message, "The hostility on this post is mathematically coordinated. You are not imagining it.");
});
