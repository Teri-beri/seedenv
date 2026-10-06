import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

const proofPrefix = "proof:";

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
  const { data, error } = await supabase.storage
    .from(process.env.SUPABASE_PROOF_BUCKET || "proof-screenshots")
    .createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function uploadProofImage(input: {
  buffer: Buffer;
  contentType: string;
  path: string;
}) {
  const bucket = process.env.SUPABASE_PROOF_BUCKET || "proof-screenshots";
  const supabase = getSupabase();
  if (!supabase) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Supabase storage is not configured for proof uploads.");
    }
    return `data:${input.contentType};base64,${input.buffer.toString("base64")}`;
  }

  const { error } = await supabase.storage.from(bucket).upload(input.path, input.buffer, {
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
  const { error } = await supabase.storage.from(process.env.SUPABASE_PROOF_BUCKET || "proof-screenshots").upload(input.path, input.buffer, {
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