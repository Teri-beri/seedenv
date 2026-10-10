import test, { mock } from "node:test";
import assert from "node:assert/strict";

test("follower cron accepts the existing configured credential and rejects missing or incorrect credentials", async () => {
  let deliveries = 0;
  const original = process.env.CRON_SECRET;
  const moduleMock = mock.module("../lib/follower-emails.ts", { namedExports: {
    deliverFollowerEmails: async () => { deliveries++; return { delivered: 0, failed: 0 }; },
  } });
  try {
    const { POST } = await import("../app/api/cron/follower-emails/route");
    process.env.CRON_SECRET = "fixture-key";
    const request = (value?: string) => new Request("https://example.invalid/api/cron/follower-emails", {
      method: "POST", headers: value ? { authorization: value } : {},
    });
    assert.equal((await POST(request())).status, 401);
    assert.equal((await POST(request("Bearer wrong"))).status, 401);
    assert.equal((await POST(request("Bearer fixture-kez"))).status, 401);
    assert.equal(deliveries, 0);
    assert.equal((await POST(request("Bearer fixture-key"))).status, 200);
    assert.equal(deliveries, 1);
    delete process.env.CRON_SECRET;
    assert.equal((await POST(request("Bearer fixture-key"))).status, 401);
    assert.equal(deliveries, 1);
  } finally {
    moduleMock.restore();
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  }
});
