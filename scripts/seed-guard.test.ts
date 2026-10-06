import assert from "node:assert/strict";
import test from "node:test";
import { isLocalDatabaseUrl } from "./seed-guard";

test("seed guard only treats local database hosts as safe", () => {
  assert.equal(isLocalDatabaseUrl("postgresql://u:p@localhost:5432/seedenv"), true);
  assert.equal(isLocalDatabaseUrl("postgresql://u:p@127.0.0.1/seedenv"), true);
  assert.equal(isLocalDatabaseUrl("postgresql://u:p@dpg-abc.oregon-postgres.render.com/seedenv"), false);
  assert.equal(isLocalDatabaseUrl(undefined), false);
  assert.equal(isLocalDatabaseUrl("not a url"), false);
});
