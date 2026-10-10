import assert from "node:assert/strict";
import test, { mock } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { testingGuides, getTestingGuide } from "../lib/testing-guides";
import { SITE_URL, siteMetadata, siteStructuredData } from "../lib/seo";

// The CLI JSX transform uses React while Next uses its automatic runtime.
Object.assign(globalThis, { React });

test("guides have distinct, substantive content and accurately scoped store requirements", () => {
  assert.equal(new Set(testingGuides.map((guide) => guide.slug)).size, 3);
  for (const guide of testingGuides) {
    assert.equal(getTestingGuide(guide.slug), guide);
    assert.ok(guide.sections.length >= 5);
    const words = [guide.intro, ...guide.sections.map((section) => section.text)].join(" ").split(/\s+/);
    assert.ok(words.length >= 300, `${guide.slug}: ${words.length} words`);
    assert.ok(guide.description.length <= 180);
  }
  assert.equal(getTestingGuide("missing-guide"), undefined);
  const google = getTestingGuide("google-play-closed-testing")!;
  assert.match(google.sections[0].text, /personal developer accounts created after November 13, 2023/);
  assert.match(google.sections[0].text, /12 testers opted in continuously for at least 14 days/);
  assert.match(google.sections.at(-1)!.text, /cannot guarantee approval/);
  assert.ok(google.sources?.every((source) => new URL(source.url).hostname === "support.google.com"));
});

test("site metadata describes supported testing without advertising free paid cohorts", () => {
  assert.match(siteMetadata.description!, /iOS, Android and web/);
  const organization = siteStructuredData["@graph"].find((item) => item["@type"] === "Organization");
  assert.equal(organization?.url, SITE_URL);
  assert.ok(!JSON.stringify(siteStructuredData).includes('"price":"0"'));
});

test("guide routes render one heading, canonical metadata, cross-links and accurate JSON-LD", async () => {
  const { default: GuidePage, generateMetadata, generateStaticParams } = await import("../app/(public)/guides/[slug]/page");
  const { default: HubPage } = await import("../app/(public)/guides/page");
  assert.deepEqual(generateStaticParams(), testingGuides.map(({ slug }) => ({ slug })));
  const hub = renderToStaticMarkup(React.createElement(HubPage));
  for (const guide of testingGuides) {
    const params = Promise.resolve({ slug: guide.slug });
    const metadata = await generateMetadata({ params });
    assert.ok(metadata.openGraph && "type" in metadata.openGraph);
    assert.equal(metadata.alternates?.canonical, `${SITE_URL}/guides/${guide.slug}`);
    assert.equal(metadata.title, guide.title);
    assert.equal(metadata.openGraph?.type, "article");
    assert.equal(metadata.openGraph?.description, guide.description);
    assert.equal(metadata.twitter?.description, guide.description);
    const html = renderToStaticMarkup(await GuidePage({ params }));
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    assert.ok(html.includes('href="/pricing"'));
    assert.ok(html.includes("role=DEVELOPER"));
    assert.ok(html.includes('aria-current="page"'));
    const script = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script);
    const data = JSON.parse(script);
    assert.equal(data["@graph"][0].headline, guide.title);
    assert.equal(data["@graph"][0].url, metadata.alternates?.canonical);
    assert.equal(data["@graph"][0].publisher["@id"], `${SITE_URL}/#organization`);
    assert.deepEqual(data["@graph"][1].itemListElement.map((item: { position: number }) => item.position), [1, 2, 3]);
    for (const other of testingGuides) {
      assert.ok(hub.includes(`href="/guides/${other.slug}"`));
      if (other.slug !== guide.slug) assert.ok(html.includes(`href="/guides/${other.slug}"`));
    }
  }
  const missing = await generateMetadata({ params: Promise.resolve({ slug: "missing" }) });
  assert.deepEqual(missing.robots, { index: false });
  await assert.rejects(GuidePage({ params: Promise.resolve({ slug: "missing" }) }), /NEXT_HTTP_ERROR_FALLBACK;404/);
});

test("sitemap includes every guide and retains published posts and developer profiles without a live database", async () => {
  const modules = [
    mock.module("../lib/prisma.ts", { namedExports: { prisma: { user: { findMany: async () => [{ username: "sample_dev", updatedAt: new Date("2026-01-01") }] } } } }),
    mock.module("../lib/growth/blog.ts", { namedExports: { listPublishedPosts: async () => [{ slug: "published-test", updatedAt: new Date("2026-01-01") }] } }),
  ];
  try {
    const { default: sitemap } = await import("../app/sitemap");
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    for (const path of ["/guides", ...testingGuides.map((guide) => `/guides/${guide.slug}`), "/blog/published-test", "/@sample_dev"]) assert.ok(urls.includes(`${SITE_URL}${path}`), path);
    assert.equal(new Set(urls).size, urls.length);
  } finally {
    modules.reverse().forEach((item) => item.restore());
  }
});
