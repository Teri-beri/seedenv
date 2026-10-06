import assert from "node:assert/strict";
import test from "node:test";
import { clientIp, countryFrom, isBotUserAgent, isLocalHost, parseUserAgent, sourceFrom, visitorIdFor } from "../lib/analytics-context";

const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const macChrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

test("dev hosts and bots are never counted", () => {
  for (const host of ["localhost:3000", "127.0.0.1:3108", "[::1]:3000", "192.168.1.20:3000", "mac.local", null]) assert.equal(isLocalHost(host), true, String(host));
  assert.equal(isLocalHost("seedenv.com"), false);
  assert.equal(isBotUserAgent("Googlebot/2.1 (+http://www.google.com/bot.html)"), true);
  assert.equal(isBotUserAgent("Mozilla/5.0 HeadlessChrome/129.0"), true);
  assert.equal(isBotUserAgent(""), true);
  assert.equal(isBotUserAgent(iphone), false);
});

test("visitor id rotates daily and never contains the IP", () => {
  const day1 = visitorIdFor("203.0.113.9", iphone, "secret", new Date("2026-10-06T10:00:00Z"));
  const sameDay = visitorIdFor("203.0.113.9", iphone, "secret", new Date("2026-10-06T23:00:00Z"));
  const day2 = visitorIdFor("203.0.113.9", iphone, "secret", new Date("2026-10-07T01:00:00Z"));
  assert.equal(day1, sameDay);
  assert.notEqual(day1, day2);
  assert.ok(!day1.includes("203"));
});

test("request context is parsed from Cloudflare headers and user agent", () => {
  const headers = new Headers({ "cf-connecting-ip": "198.51.100.4", "x-forwarded-for": "10.0.0.1", "cf-ipcountry": "us" });
  assert.equal(clientIp(headers), "198.51.100.4");
  assert.equal(countryFrom(headers), "US");
  assert.equal(countryFrom(new Headers({ "cf-ipcountry": "XX" })), null);
  assert.deepEqual(parseUserAgent(iphone), { device: "Mobile", browser: "Safari", os: "iOS" });
  assert.deepEqual(parseUserAgent(macChrome), { device: "Desktop", browser: "Chrome", os: "macOS" });
});

test("sources ignore self and local referrers and prefer utm_source", () => {
  assert.equal(sourceFrom("https://www.twitter.com/some/post", undefined, "seedenv.com"), "twitter.com");
  assert.equal(sourceFrom("https://seedenv.com/terimus", undefined, "seedenv.com"), null);
  assert.equal(sourceFrom("http://localhost:3000/", undefined, "seedenv.com"), null);
  assert.equal(sourceFrom("https://t.co/abc", "ProductHunt", "seedenv.com"), "producthunt");
  assert.equal(sourceFrom("", undefined, "seedenv.com"), null);
});
