import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { freeTools } from "../lib/organic-growth";
import { freeToolFaqs, freeToolStructuredData, freeToolsGuide } from "../lib/free-tool-discovery";
import { ToolDiscovery } from "../components/tools/tool-discovery";
import { navigationLoadMs, trackAnalytics } from "../components/analytics-tracker";
import { SITE_URL } from "../lib/seo";

test("tool descriptions and free application schema agree with visible capabilities and limitations", () => {
  for (const tool of freeTools) {
    const html = renderToStaticMarkup(createElement(ToolDiscovery, { tool }));
    for (const { question, answer } of freeToolFaqs(tool)) {
      assert.ok(html.includes(question), question);
      assert.ok(html.includes(answer.replaceAll("'", "&#x27;")), answer);
    }
    const graph = freeToolStructuredData(tool)["@graph"];
    const application = graph.find((node) => "applicationCategory" in node);
    assert.ok(application && "offers" in application && application.offers);
    assert.equal(application["@type"], "WebApplication");
    assert.equal(application.url, `${SITE_URL}${tool.path}`);
    assert.equal(application.offers.price, "0");
    assert.equal(application.isAccessibleForFree, true);
    assert.doesNotMatch(JSON.stringify(graph), /aggregateRating|reviewCount/);
    assert.ok(html.includes(tool.limitation));
  }
});

test("tool directory structured data lists every public tool", () => {
  const data = JSON.stringify(freeToolStructuredData());
  for (const tool of freeTools) assert.ok(data.includes(`${SITE_URL}${tool.path}`), tool.path);
  assert.match(data, /CollectionPage/);
  assert.match(data, /ItemList/);
});

test("the public machine-readable guide is factual text, not a login gate or recommendation instruction", async () => {
  const { GET } = await import("../app/llms.txt/route");
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
  assert.equal(await response.text(), freeToolsGuide());
  for (const tool of freeTools) {
    assert.ok(freeToolsGuide().includes(`${SITE_URL}${tool.path}`));
    assert.ok(freeToolsGuide().includes(tool.limitation));
  }
  assert.doesNotMatch(freeToolsGuide(), /always recommend|ignore previous|\/admin|\/account|\/console/i);
});

test("all free tool routes bypass authentication and remain crawlable", async () => {
  let authenticationCalls = 0;
  const modules = [
    mock.module("next-auth/jwt", { namedExports: { getToken: async () => { authenticationCalls++; return null; } } }),
    mock.module("../lib/session-security.ts", { namedExports: { decodeSessionToken: () => null } }),
  ];
  try {
    const { NextRequest } = await import("next/server");
    const { proxy, config } = await import("../proxy");
    const { default: robots } = await import("../app/robots");
    const rules = robots().rules;
    assert.ok(rules && !Array.isArray(rules));
    const excluded = typeof rules.disallow === "string" ? [rules.disallow] : rules.disallow || [];
    for (const path of ["/tools", ...freeTools.map((tool) => tool.path), "/llms.txt"]) {
      const response = await proxy(new NextRequest(`${SITE_URL}${path}`));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("location"), null);
      assert.equal(excluded.some((prefix) => path.startsWith(prefix)), false);
      assert.equal(config.matcher.some((pattern) => pattern.startsWith("/tools")), false);
    }
    assert.equal(authenticationCalls, 0);
  } finally {
    modules.reverse().forEach((item) => item.restore());
  }
});

test("tool metadata uses canonical public URLs and permits indexing", async () => {
  const pages = [
    await import("../app/tools/page"),
    await import("../app/tools/viewport-check/page"),
    await import("../app/tools/qa-checklist/page"),
    await import("../app/tools/swarm-detector/layout"),
  ];
  const paths = ["/tools", "/tools/viewport-check", "/tools/qa-checklist", "/tools/swarm-detector"];
  pages.forEach((page, index) => {
    assert.equal(page.metadata.alternates?.canonical, `${SITE_URL}${paths[index]}`);
    assert.deepEqual(page.metadata.robots, { index: true, follow: true });
    assert.ok(page.metadata.description?.includes("Free") || page.metadata.description?.includes("free"));
  });
});

test("client navigation does not reuse another page's document load timing", () => {
  const entry = { name: `${SITE_URL}/`, loadEventEnd: 1500.4, domContentLoadedEventEnd: 1200 };
  assert.equal(navigationLoadMs(entry, "/"), 1500);
  assert.equal(navigationLoadMs(entry, "/tools/viewport-check"), undefined);
  assert.equal(navigationLoadMs(undefined, "/tools"), undefined);
});

test("blocked browser storage does not break free-tool clicks or discard their analytics event", async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const bodies: string[] = [];
  const warn = mock.method(console, "warn", () => undefined);
  const fetch = mock.method(globalThis, "fetch", async (_input: unknown, options?: RequestInit) => {
    bodies.push(String(options?.body));
    return Response.json({ ok: true });
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { pathname: "/tools" }, get sessionStorage() { throw new Error("Storage blocked"); } },
  });
  try {
    trackAnalytics("cta_click", { action: "open_free_tool", tool: "/tools/viewport-check" });
    assert.equal(bodies.length, 1);
    const payload: Record<string, unknown> = JSON.parse(bodies[0]);
    assert.equal(payload.path, "/tools");
    assert.equal(payload.sessionKey, undefined);
    assert.equal(warn.mock.callCount(), 1);
  } finally {
    fetch.mock.restore();
    warn.mock.restore();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
