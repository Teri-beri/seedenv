import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase storage connection is not configured.");
  const bucket = process.env.SUPABASE_CLIPPERS_BUCKET || "seedenv-clippers";
  const storage = createClient(url, key, { auth: { persistSession: false } }).storage;
  const { data, error } = await storage.getBucket(bucket);
  if (data) {
    if (data.public) throw new Error("The existing Clippers bucket is public. It was not changed; configure a separate private bucket.");
    if (!data.file_size_limit || data.file_size_limit > 50 * 1024 * 1024 || !data.allowed_mime_types?.length) throw new Error("The existing bucket needs explicit size and MIME restrictions. It was not changed.");
    console.log("Private Clippers bucket already exists with size and MIME restrictions.");
    return;
  }
  if (error && error.status !== 404 && !(error.status === 400 && error.message === "Bucket not found")) throw new Error(`Bucket lookup failed (${error.status}): ${error.message}. No bucket was created.`);
  const created = await storage.createBucket(bucket, { public: false, fileSizeLimit: 50 * 1024 * 1024, allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "video/quicktime"] });
  if (created.error) throw new Error(`Private bucket creation failed: ${created.error.message}`);
  console.log("Created separate private Clippers bucket with a 50MB object limit and restricted image/video types. Existing buckets were not changed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Clippers storage setup failed.");
  process.exitCode = 1;
});
