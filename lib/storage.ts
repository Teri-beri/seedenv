import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

const proofPrefix = "proof:";

async function privateProofBucket(supabase: NonNullable<ReturnType<typeof getSupabase>>) {
  const name = process.env.SUPABASE_PROOF_BUCKET || "proof-screenshots";
  const { data, error } = await supabase.storage.getBucket(name);
  if (error || !data) throw new Error("Private proof storage is unavailable. Check the Supabase bucket configuration.");
  if (data.public) throw new Error("Proof storage must be private. Disable public access in Supabase before uploading or viewing evidence.");
  return supabase.storage.from(name);
}

function proofPath(value: string) {
  if (value.startsWith(proofPrefix)) return value.slice(proofPrefix.length);
  const url = process.env.SUPABASE_URL;
  if (!url) return null;
  try {
    const stored = new URL(value);
    const base = new URL(url);
    const prefix = `/storage/v1/object/public/${process.env.SUPABASE_PROOF_BUCKET || "proof-screenshots"}/`;
    if (stored.origin === base.origin && stored.pathname.startsWith(prefix)) {
      return decodeURIComponent(stored.pathname.slice(prefix.length));
    }
  } catch {
    return null;
  }
  return null;
}

export async function getProofImageUrl(value: string | null) {
  if (!value) return null;
  const path = proofPath(value);
  if (!path) return value.startsWith("data:") || value.startsWith("https://images.unsplash.com/") ? value : null;
  const supabase = getSupabase();
  if (!supabase) return null;
  const bucket = await privateProofBucket(supabase);
  const { data, error } = await bucket.createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// Returns null (rather than throwing) when the object is missing, unsupported or larger than maxBytes.
export async function downloadProofObject(value: string | null, maxBytes: number): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (!value) return null;
  if (value.startsWith("data:")) {
    const match = /^data:([\w.+/-]+);base64,([\s\S]*)$/.exec(value);
    if (!match) return null;
    const buffer = Buffer.from(match[2], "base64");
    return buffer.length <= maxBytes ? { buffer, mimeType: match[1] } : null;
  }
  const path = proofPath(value);
  const supabase = getSupabase();
  if (!path || !supabase) return null;
  const bucket = await privateProofBucket(supabase);
  const { data, error } = await bucket.createSignedUrl(path, 120);
  if (error || !data?.signedUrl) return null;
  const response = await fetch(data.signedUrl, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) return null;
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) {
    await response.body.cancel();
    return null;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    size += chunk.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk);
  }
  const mimeType = (response.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
  return { buffer: Buffer.concat(chunks), mimeType };
}

export async function uploadProofImage(input: {
  buffer: Buffer;
  contentType: string;
  path: string;
}) {
  const supabase = getSupabase();
  if (!supabase) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Supabase storage is not configured for proof uploads.");
    }
    return `data:${input.contentType};base64,${input.buffer.toString("base64")}`;
  }

  const bucket = await privateProofBucket(supabase);
  const { error } = await bucket.upload(input.path, input.buffer, {
    contentType: input.contentType,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  return `${proofPrefix}${input.path}`;
}

export function proofStorageConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function uploadProofRecording(input: { buffer: Buffer; contentType: string; path: string }) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Recording storage is not configured.");
  const bucket = await privateProofBucket(supabase);
  const { error } = await bucket.upload(input.path, input.buffer, {
    contentType: input.contentType,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return `${proofPrefix}${input.path}`;
}

export async function deleteProofObject(value: string) {
  const path = value.startsWith(proofPrefix) ? value.slice(proofPrefix.length) : null;
  const supabase = getSupabase();
  if (!path || !supabase) return;
  await supabase.storage.from(process.env.SUPABASE_PROOF_BUCKET || "proof-screenshots").remove([path]);
}

export async function uploadAvatarImage(input: {
  buffer: Buffer;
  contentType: "image/png" | "image/jpeg";
  userId: string;
}) {
  const bucket = process.env.SUPABASE_AVATAR_BUCKET || "seedenv-avatars";
  if ([process.env.SUPABASE_PROOF_BUCKET || "proof-screenshots", process.env.SUPABASE_CLIPPERS_BUCKET || "seedenv-clippers"].includes(bucket)) {
    throw new Error("Avatar storage must use a separate bucket from private evidence.");
  }
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase storage is not configured for avatar uploads.");

  const { data: existingBucket, error: bucketError } = await supabase.storage.getBucket(bucket);
  if (bucketError) {
    const { error: createError } = await supabase.storage.createBucket(bucket, {
      public: true,
      fileSizeLimit: "2MB",
      allowedMimeTypes: ["image/png", "image/jpeg"],
    });
    if (createError) {
      const { data: createdBucket, error: retryError } = await supabase.storage.getBucket(bucket);
      if (retryError) throw new Error(createError.message);
      if (!createdBucket.public) {
        const { error } = await supabase.storage.updateBucket(bucket, { public: true });
        if (error) throw new Error(error.message);
      }
    }
  } else if (!existingBucket.public) {
    const { error } = await supabase.storage.updateBucket(bucket, { public: true });
    if (error) throw new Error(error.message);
  }

  const extension = input.contentType === "image/png" ? "png" : "jpg";
  const path = `${input.userId}/${randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, input.buffer, {
    contentType: input.contentType,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}