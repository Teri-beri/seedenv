import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
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

  const { data } = supabase.storage.from(bucket).getPublicUrl(input.path);
  return data.publicUrl;
}