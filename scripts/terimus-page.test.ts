import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync("app/terimus/page.tsx", "utf8");

test("the corporate page uses correct labels and identifies its SeedEnv relationship", () => {
  assert.match(source, />Company Info</);
  assert.match(source, />Portfolio</);
  assert.match(source, /SeedEnv \/ Corporate operator &amp; governance/);
  assert.match(source, /corporate operator behind SeedEnv/);
  assert.doesNotMatch(source, /Comoany|PORTFOI TO/);
});

test("the hero flows directly into a concrete product portfolio", () => {
  assert.doesNotMatch(source, /const capabilities|Developer Infrastructure|Digital Products & Tooling/);
  assert.match(source, /title: "LoCat"/);
  assert.match(source, /tags: \["Telemetry hardware"\]/);
  assert.match(source, /status: "CAD & Firmware Staging"/);
  assert.doesNotMatch(source, /Hardware & Utility Prototypes|Internal research/);
});

test("corporate verification links to the official Florida record", () => {
  assert.match(source, /search\.sunbiz\.org\/Inquiry\/CorporationSearch\/SearchResultDetail/);
  assert.match(source, /L25000544505/);
  assert.match(source, /Verify Florida Registration/);
  assert.match(source, /Florida, United States · Verified/);
  assert.match(source, /target="_blank" rel="noreferrer"/);
});

test("the corporate inbox remains a direct mail link", () => {
  assert.match(source, /href: "mailto:terimus@seedenv\.com"/);
});
