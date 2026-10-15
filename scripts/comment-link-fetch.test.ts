import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRedditJsonUrl,
  detectLinkPlatform,
  fetchCommentsForLink,
  normalizeProviderItems,
  parseRedditListing,
  providerActorFor,
  resetLinkFetchLimits,
  resetRedditToken,
  allowLinkFetch,
} from "@/lib/comment-link-fetch";
import { parseSwarmInput } from "@/lib/swarm-detector";

test("supported post links resolve to their platform", () => {
  assert.equal(detectLinkPlatform("https://www.reddit.com/r/webdev/comments/abc/title/")?.platform, "reddit");
  assert.equal(detectLinkPlatform("https://old.reddit.com/r/webdev/comments/abc/title/")?.platform, "reddit");
  assert.equal(detectLinkPlatform("https://www.tiktok.com/@creator/video/123")?.platform, "tiktok");
  assert.equal(detectLinkPlatform("https://x.com/user/status/123")?.platform, "x");
  assert.equal(detectLinkPlatform("https://twitter.com/user/status/123")?.platform, "x");
  assert.equal(detectLinkPlatform("https://www.instagram.com/p/abc/")?.platform, "instagram");
  assert.equal(detectLinkPlatform("https://youtu.be/abc")?.platform, "youtube");
});

test("unsupported, insecure, and internal links are rejected", () => {
  for (const value of [
    "http://www.reddit.com/r/webdev/comments/abc/",
    "https://localhost/r/webdev",
    "https://169.254.169.254/latest/meta-data",
    "https://reddit.com.evil.example/r/webdev",
    "https://user:pass@www.reddit.com/r/webdev",
    "https://www.reddit.com:8080/r/webdev",
    "file:///etc/passwd",
    "not a url",
  ]) {
    assert.equal(detectLinkPlatform(value), null, `expected ${value} to be rejected`);
  }
});

test("reddit permalinks become public JSON endpoints without duplicate suffixes", () => {
  const first = buildRedditJsonUrl(new URL("https://old.reddit.com/r/webdev/comments/abc/title/?sort=top"));
  assert.match(first, /^https:\/\/www\.reddit\.com\/r\/webdev\/comments\/abc\/title\.json\?/);
  assert.match(first, /limit=200/);
  assert.match(first, /raw_json=1/);
  const second = buildRedditJsonUrl(new URL("https://www.reddit.com/r/webdev/comments/abc/title.json"));
  assert.equal(second.includes(".json.json"), false);
  const oauth = buildRedditJsonUrl(new URL("https://www.reddit.com/r/webdev/comments/abc/title/"), { oauth: true, limit: 50 });
  assert.match(oauth, /^https:\/\/oauth\.reddit\.com\/r\/webdev\/comments\/abc\/title\?/);
  assert.equal(oauth.includes(".json"), false);
  assert.match(oauth, /limit=50/);
});

test("reddit listings flatten into records the forensic engine can parse", () => {
  const listing = [
    { kind: "Listing", data: { children: [{ kind: "t3", data: { title: "post" } }] } },
    {
      kind: "Listing",
      data: {
        children: [
          {
            kind: "t1",
            data: {
              author: "swarm_one",
              body: "Cancel this launch now.",
              created_utc: 1_700_000_000,
              replies: {
                kind: "Listing",
                data: { children: [{ kind: "t1", data: { author: "swarm_two", body: "Cancel this launch now.", created_utc: 1_700_000_060 } }] },
              },
            },
          },
          { kind: "t1", data: { author: "[deleted]", body: "gone", created_utc: 1_700_000_100 } },
          { kind: "t1", data: { author: "real_user", body: "[removed]", created_utc: 1_700_000_100 } },
          { kind: "more", data: { children: ["abc"] } },
        ],
      },
    },
  ];

  const comments = parseRedditListing(listing);
  assert.deepEqual(comments.map((comment) => comment.author), ["swarm_one", "swarm_two"]);
  // Offsets are "seconds ago" relative to the newest comment in the sample.
  assert.deepEqual(comments.map((comment) => comment.timeOffsetSec), [60, 0]);
  assert.equal(parseSwarmInput(JSON.stringify(comments)).length, 2);
});

test("provider dataset rows normalize across differing field names", () => {
  const comments = normalizeProviderItems([
    { uniqueId: "bot_a", text: "Same talking point.", createTimeISO: "2026-01-01T00:00:00Z" },
    { user: { name: "bot_b" }, comment: "Same talking point.", timestamp: 1_767_225_660_000 },
    { author: "", text: "dropped: no author" },
    { author: "no_text" },
    "not an object",
  ]);
  assert.deepEqual(comments.map((comment) => comment.author), ["bot_a", "bot_b"]);
  assert.deepEqual(comments.map((comment) => comment.timeOffsetSec), [60, 0]);
});

test("provider lookup stays disabled unless both the token and actor are configured", () => {
  assert.equal(providerActorFor("reddit", { APIFY_TOKEN: "t", APIFY_TIKTOK_COMMENTS_ACTOR: "a" } as unknown as NodeJS.ProcessEnv), null);
  assert.equal(providerActorFor("tiktok", {} as unknown as NodeJS.ProcessEnv), null);
  assert.equal(providerActorFor("tiktok", { APIFY_TOKEN: "t" } as unknown as NodeJS.ProcessEnv), null);
  assert.deepEqual(
    providerActorFor("tiktok", { APIFY_TOKEN: "t", APIFY_TIKTOK_COMMENTS_ACTOR: " actor " } as unknown as NodeJS.ProcessEnv),
    { actor: "actor", token: "t" },
  );
});

test("link fetches are rate limited per visitor", () => {
  resetLinkFetchLimits();
  const now = Date.now();
  for (let index = 0; index < 10; index += 1) assert.equal(allowLinkFetch("ip:1.2.3.4", now), true);
  assert.equal(allowLinkFetch("ip:1.2.3.4", now), false);
  assert.equal(allowLinkFetch("ip:5.6.7.8", now), true);
  assert.equal(allowLinkFetch("ip:1.2.3.4", now + 11 * 60 * 1000), true);
  resetLinkFetchLimits();
});

test("reddit links resolve through the public endpoint and fall back to guidance when blocked", async (t) => {
  resetRedditToken();
  const listing = [
    { kind: "Listing", data: { children: [{ kind: "t3", data: {} }] } },
    {
      kind: "Listing",
      data: {
        children: [
          { kind: "t1", data: { author: "a", body: "Cancel this launch now.", created_utc: 1_700_000_000 } },
          { kind: "t1", data: { author: "b", body: "Cancel this launch now.", created_utc: 1_700_000_030 } },
        ],
      },
    },
  ];

  const requested: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    requested.push(String(input));
    return new Response(JSON.stringify(listing), { status: 200, headers: { "Content-Type": "application/json" } });
  });

  const ok = await fetchCommentsForLink("reddit", new URL("https://www.reddit.com/r/webdev/comments/abc/title/"), { env: {} as unknown as NodeJS.ProcessEnv });
  assert.equal(ok.status, "ok");
  assert.equal(requested[0].startsWith("https://www.reddit.com/r/webdev/comments/abc/title.json"), true);
  if (ok.status === "ok") assert.equal(ok.comments.length, 2);

  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => new Response("<html>blocked</html>", { status: 403 }));
  const blocked = await fetchCommentsForLink("reddit", new URL("https://www.reddit.com/r/webdev/comments/abc/title/"), { env: {} as unknown as NodeJS.ProcessEnv });
  assert.equal(blocked.status, "guidance");
  t.mock.restoreAll();
});

test("platforms without a configured provider return guidance instead of calling out", async (t) => {
  let called = false;
  t.mock.method(globalThis, "fetch", async () => {
    called = true;
    return new Response("{}", { status: 200 });
  });
  for (const platform of ["tiktok", "x", "instagram", "youtube"] as const) {
    const result = await fetchCommentsForLink(platform, new URL("https://www.tiktok.com/@creator/video/1"), { env: {} as unknown as NodeJS.ProcessEnv });
    assert.equal(result.status, "guidance");
    if (result.status === "guidance") assert.match(result.message, /Paste Comments/);
  }
  assert.equal(called, false);
  t.mock.restoreAll();
});
