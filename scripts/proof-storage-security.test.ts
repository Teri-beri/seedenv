import test, { mock } from "node:test";
import assert from "node:assert/strict";

test("proof uploads and signing reject public buckets, and avatars cannot publicize evidence", async () => {
  const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_PROOF_BUCKET", "SUPABASE_AVATAR_BUCKET", "SUPABASE_CLIPPERS_BUCKET"] as const;
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.SUPABASE_URL = "https://storage.example.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "isolated-storage-test-key";
  process.env.SUPABASE_PROOF_BUCKET = "private-proofs";
  process.env.SUPABASE_CLIPPERS_BUCKET = "private-clips";
  let isPublic = true;
  let unavailable = false;
  let writes = 0;
  let signed = 0;
  const stub = mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== "https://storage.example.invalid") throw new Error("Unexpected external request in storage test.");
    if (url.pathname === "/storage/v1/bucket/private-proofs") {
      return Response.json(unavailable ? { message: "Unavailable" } : { id: "private-proofs", public: isPublic }, { status: unavailable ? 503 : 200 });
    }
    if (url.pathname === "/storage/v1/object/private-proofs/owner/proof.png") {
      writes++;
      return Response.json({ Key: "private-proofs/owner/proof.png" });
    }
    if (url.pathname === "/storage/v1/object/sign/private-proofs/owner/proof.png") {
      signed++;
      return Response.json({ signedURL: "/signed-test" });
    }
    throw new Error(`Unexpected storage test request: ${url.pathname}`);
  });
  try {
    const storage = await import("../lib/storage");
    const input = { buffer: Buffer.from("test"), contentType: "image/png", path: "owner/proof.png" };
    await assert.rejects(storage.uploadProofImage(input), /must be private/);
    await assert.rejects(storage.uploadProofRecording({ ...input, contentType: "video/mp4" }), /must be private/);
    await assert.rejects(storage.getProofImageUrl("proof:owner/proof.png"), /must be private/);
    await assert.rejects(storage.downloadProofObject("proof:owner/proof.png", 100), /must be private/);
    assert.equal(writes, 0);
    assert.equal(signed, 0);
    for (const bucket of ["private-proofs", "private-clips"]) {
      process.env.SUPABASE_AVATAR_BUCKET = bucket;
      await assert.rejects(storage.uploadAvatarImage({ ...input, contentType: "image/png", userId: "owner" }), /separate bucket/);
    }
    isPublic = false;
    assert.equal(await storage.uploadProofImage(input), "proof:owner/proof.png");
    assert.equal(await storage.getProofImageUrl("proof:owner/proof.png"), "https://storage.example.invalid/storage/v1/signed-test");
    assert.equal(writes, 1);
    assert.equal(signed, 1);
    unavailable = true;
    await assert.rejects(storage.uploadProofImage(input), /storage is unavailable/);
    assert.equal(writes, 1);
  } finally {
    stub.mock.restore();
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});
