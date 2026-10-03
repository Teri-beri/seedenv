import "server-only";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
import { requireClipRoom } from "@/lib/clippers";
import { assertClipTransition, draftStatuses } from "@/lib/clipper-rules";

export const clipUploadSchema = z.object({
  campaignId: z.string().min(1),
  engagementId: z.string().optional(),
  kind: z.enum(["BRIEF", "DRAFT", "PROOF"]),
  name: z.string().trim().min(1).max(160),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "video/quicktime"]),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
});
export type ClipUploadInput = z.infer<typeof clipUploadSchema>;

export function clipStorageConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function storage() {
  if (!clipStorageConfigured()) throw new Error("Private Clippers storage is not configured. Video uploads are unavailable.");
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }).storage;
}

async function privateBucket() {
  const api = storage();
  const bucket = process.env.SUPABASE_CLIPPERS_BUCKET || "seedenv-clippers";
  const { data, error } = await api.getBucket(bucket);
  if (error || !data) throw new Error("Create the private Clippers storage bucket before uploading.");
  if (data.public) throw new Error("Clippers requires a private storage bucket. Public buckets are not permitted.");
  if (!data.file_size_limit || data.file_size_limit > 50 * 1024 * 1024 || !data.allowed_mime_types?.length || data.allowed_mime_types.some((mime) => !clipUploadSchema.shape.mimeType.options.some((supported) => supported === mime))) throw new Error("Clippers storage must restrict file sizes to at most 50MB and allow only supported image/video types.");
  return api.from(bucket);
}

export async function checkClipStorage() {
  await privateBucket();
}

async function uploadPermission(tx: Parameters<typeof requireClipRoom>[0], member: { id: string; role: string }, input: ClipUploadInput) {
  const campaign = await requireClipRoom(tx, input.campaignId, member.id, member.role);
  if (input.kind === "BRIEF") {
    if (campaign.developerId !== member.id || input.engagementId) throw new Error("Only the campaign developer can share brief assets.");
  } else {
    if (!input.engagementId) throw new Error("Choose a creator agreement for this upload.");
    const item = await tx.clipEngagement.findUnique({ where: { id: input.engagementId } });
    if (!item || item.creatorId !== member.id || item.campaignId !== campaign.id) throw new Error("This is not your creator agreement.");
    assertClipTransition(item.status, input.kind === "DRAFT" ? draftStatuses : ["DRAFT_APPROVED", "PROOF_SUBMITTED"]);
    if (input.kind === "DRAFT" && !input.mimeType.startsWith("video/")) throw new Error("Drafts must be video files.");
    if (input.kind === "PROOF" && !input.mimeType.startsWith("image/")) throw new Error("Publication evidence must be an image.");
  }
  if (input.mimeType.startsWith("image/") && input.sizeBytes > 10 * 1024 * 1024) throw new Error("Images must be 10MB or smaller.");
}

export async function beginClipUpload(member: { id: string; role: string }, raw: ClipUploadInput) {
  const input = clipUploadSchema.parse(raw);
  const bucket = await privateBucket();
  const asset = await serializable(async (tx) => {
    await uploadPermission(tx, member, input);
    if (await tx.clipAsset.count({ where: { ownerId: member.id, createdAt: { gte: new Date(Date.now() - 86400000) } } }) >= 30) throw new Error("You can upload up to 30 Clippers files per day.");
    const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" }[input.mimeType];
    return tx.clipAsset.create({ data: { ...input, ownerId: member.id, path: `${input.campaignId}/${member.id}/${randomUUID()}.${extension}` } });
  });
  const { data, error } = await bucket.createSignedUploadUrl(asset.path, { upsert: false });
  if (error || !data) throw new Error(error?.message || "A private upload URL could not be created.");
  return { assetId: asset.id, uploadUrl: data.signedUrl };
}

function validSignature(buffer: Buffer, mime: string) {
  if (mime === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/jpeg") return buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (mime === "image/webp") return buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
  if (mime === "video/webm") return buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return buffer.subarray(4, 8).toString() === "ftyp";
}

export async function finishClipUpload(member: { id: string; role: string }, assetId: string) {
  const asset = await prisma.clipAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.ownerId !== member.id) throw new Error("Upload not found.");
  const bucket = await privateBucket();
  const { data: info, error: infoError } = await bucket.info(asset.path);
  if (infoError || !info) throw new Error("The storage upload has not completed.");
  if (Number(info.size) !== asset.sizeBytes || info.contentType !== asset.mimeType) throw new Error("Uploaded file size or type does not match its declaration.");
  const { data, error } = await bucket.createSignedUrl(asset.path, 60);
  if (error || !data) throw new Error("Upload verification URL could not be created.");
  const response = await fetch(data.signedUrl, { headers: { Range: "bytes=0-31" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error("Uploaded file could not be inspected.");
  const reader = response.body.getReader();
  let prefix = Buffer.alloc(0);
  try {
    while (prefix.length < 32) {
      const chunk = await reader.read();
      if (chunk.done) break;
      prefix = Buffer.concat([prefix, Buffer.from(chunk.value).subarray(0, 32 - prefix.length)]);
    }
  } finally {
    await reader.cancel();
  }
  if (!validSignature(prefix, asset.mimeType)) throw new Error("The file contents do not match a supported image or video.");
  await serializable(async (tx) => {
    await uploadPermission(tx, member, clipUploadSchema.parse({ ...asset, engagementId: asset.engagementId || undefined }));
    await tx.clipAsset.update({ where: { id: asset.id }, data: { ready: true } });
  });
  return asset.id;
}

export async function clipAssetUrl(assetId: string, member: { id: string; role: string }) {
  const asset = await prisma.clipAsset.findUnique({ where: { id: assetId }, include: { engagement: true } });
  if (!asset?.ready) throw new Error("Asset is unavailable.");
  const campaign = await requireClipRoom(prisma, asset.campaignId, member.id, member.role);
  if (asset.kind !== "BRIEF" && member.role !== "ADMIN" && campaign.developerId !== member.id && asset.ownerId !== member.id) throw new Error("Creator drafts and evidence are private, not shared with the group.");
  const bucket = await privateBucket();
  const { data, error } = await bucket.createSignedUrl(asset.path, 120);
  if (error || !data) throw new Error("Private asset URL could not be created.");
  return data.signedUrl;
}
