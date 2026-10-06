import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateServices, summarize } from "../lib/system-status";

const healthyEnv = {
  STRIPE_SECRET_KEY: "sk_test_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  RESEND_API_KEY: "re_x",
};

test("status is operational only when every live check passes", () => {
  const healthy = evaluateServices(healthyEnv, true);
  assert.equal(healthy.length, 4);
  assert.ok(healthy.every((service) => service.state === "operational"));
  assert.equal(summarize(healthy), "operational");

  const databaseDown = evaluateServices(healthyEnv, false);
  assert.equal(databaseDown.find((service) => service.id === "core")?.state, "degraded");
  assert.equal(summarize(databaseDown), "degraded");

  for (const key of Object.keys(healthyEnv)) {
    const services = evaluateServices({ ...healthyEnv, [key]: "" }, true);
    assert.equal(summarize(services), "degraded", `${key} missing should degrade status`);
  }
  assert.equal(summarize(evaluateServices({ ...healthyEnv, RESEND_API_KEY: "not-a-key" }, true)), "degraded");
});

test("footer status links stay internal and never claim fabricated uptime", async () => {
  for (const path of ["components/Footer.tsx", "components/StatusPill.tsx", "app/status/page.tsx"]) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /status\.seedenv\.com/, path);
    assert.doesNotMatch(source, /99\.\d+%/, path);
  }
  assert.match(await readFile("components/Footer.tsx", "utf8"), /\["Operational Status", "\/status"\]/);
  assert.match(await readFile("components/StatusPill.tsx", "utf8"), /href="\/status"/);
});
