import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { NextRequest } from "next/server";

test("cohort creation survives sign-in redirects without weakening admin route protection", async () => {
  let token: { role: string } | null = null;
  const mocks = [
    mock.module("next-auth/jwt", { namedExports: { getToken: async () => token } }),
    mock.module("../lib/session-security.ts", { namedExports: { decodeSessionToken: async () => token } }),
  ];
  try {
    const { proxy } = await import("../proxy");
    for (const path of ["/console?view=new-drop", "/console?view=new-drop&draft=saved-draft", "/console"]) {
      const response = await proxy(new NextRequest(`https://seedenv.com${path}`));
      const destination = new URL(response.headers.get("location")!);
      assert.equal(response.status, 307);
      assert.equal(destination.pathname, "/auth/signin");
      assert.equal(destination.searchParams.get("role"), "DEVELOPER");
      assert.equal(destination.searchParams.get("callbackUrl"), path);
    }

    token = { role: "ADMIN" };
    const adminLaunch = await proxy(new NextRequest("https://seedenv.com/console?view=new-drop"));
    assert.equal(adminLaunch.headers.get("x-middleware-next"), "1");

    token = { role: "DEVELOPER" };
    const developerLaunch = await proxy(new NextRequest("https://seedenv.com/console?view=new-drop"));
    assert.equal(developerLaunch.headers.get("x-middleware-next"), "1");

    token = { role: "TESTER" };
    const adminDenied = await proxy(new NextRequest("https://seedenv.com/admin"));
    assert.equal(new URL(adminDenied.headers.get("location")!).pathname, "/dashboard");
  } finally {
    for (const moduleMock of mocks.reverse()) moduleMock.restore();
  }
});
