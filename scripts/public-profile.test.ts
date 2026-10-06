import assert from "node:assert/strict";
import test from "node:test";
import { isPublicHandle, normalizeProfileHandle, publicProfilePath, safeExternalUrl } from "../lib/public-profile";

test("profile handles accept @-prefixed, encoded, and plain usernames only", () => {
  assert.equal(normalizeProfileHandle("TeriBeri"), "TeriBeri");
  assert.equal(normalizeProfileHandle("%40teriberi"), "teriberi");
  assert.equal(normalizeProfileHandle("@dev_1"), "dev_1");
  assert.equal(normalizeProfileHandle("SeedEnv%20Member"), null);
  assert.equal(normalizeProfileHandle("ab"), null);
  assert.equal(normalizeProfileHandle("%E0%A4%A"), null);
  assert.equal(normalizeProfileHandle("../admin"), null);
});

test("default placeholder usernames do not get a public profile link", () => {
  assert.equal(isPublicHandle("SeedEnv Member"), false);
  assert.equal(isPublicHandle("TeriBeri"), true);
  assert.equal(publicProfilePath("TeriBeri"), "/@TeriBeri");
});

test("profile links only render http(s) URLs", () => {
  assert.equal(safeExternalUrl("https://seedenv.com"), "https://seedenv.com/");
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("data:text/html,hi"), null);
  assert.equal(safeExternalUrl("not a url"), null);
  assert.equal(safeExternalUrl(null), null);
});
