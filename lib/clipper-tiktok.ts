import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
import { assertClipTransition } from "@/lib/clipper-rules";

function tokenKey() {
  const key = Buffer.from(process.env.CLIPPERS_TOKEN_KEY || "", "base64");
  if (key.length !== 32) throw new Error("Clippers needs a dedicated 32-byte base64 CLIPPERS_TOKEN_KEY to encrypt social tokens.");
  return key;
}

export function tikTokConfigured() {
  return Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && process.env.TIKTOK_REDIRECT_URI?.startsWith("https://") && Buffer.from(process.env.CLIPPERS_TOKEN_KEY || "", "base64").length === 32);
}

export function tikTokConfig() {
  if (!tikTokConfigured()) throw new Error("TikTok is not configured. An approved Login Kit / Display API application, HTTPS callback, and encrypted-token key are required.");
  return { key: process.env.TIKTOK_CLIENT_KEY!, secret: process.env.TIKTOK_CLIENT_SECRET!, redirect: process.env.TIKTOK_REDIRECT_URI! };
}

function seal(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString("base64");
}

function unseal(value: string) {
  const buffer = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(-16));
  return Buffer.concat([decipher.update(buffer.subarray(12, -16)), decipher.final()]).toString("utf8");
}

const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), open_id: z.string().min(1), expires_in: z.number().positive(), refresh_expires_in: z.number().positive(), scope: z.string() });
async function requestTokens(parameters: Record<string, string>) {
  const config = tikTokConfig();
  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: config.key, client_secret: config.secret, ...parameters }), cache: "no-store", signal: AbortSignal.timeout(15000) });
  const parsed = tokenSchema.safeParse(await response.json());
  if (!response.ok || !parsed.success) throw new Error("TikTok authorization failed. Reconnect your account and grant profile and video access.");
  const scopes = parsed.data.scope.split(",");
  if (!scopes.includes("user.info.basic") || !scopes.includes("video.list")) throw new Error("TikTok profile and video-list permission are both required.");
  return parsed.data;
}

export async function connectTikTok(userId: string, code: string) {
  const tokens = await requestTokens({ code, grant_type: "authorization_code", redirect_uri: tikTokConfig().redirect });
  const response = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  const profile = z.object({ data: z.object({ user: z.object({ open_id: z.string(), display_name: z.string() }) }), error: z.object({ code: z.literal("ok") }) }).safeParse(await response.json());
  if (!response.ok || !profile.success || profile.data.data.user.open_id !== tokens.open_id) throw new Error("TikTok account ownership could not be established.");
  await serializable(async (tx) => {
    const linked = await tx.clipSocialAccount.findUnique({ where: { provider_providerId: { provider: "TIKTOK", providerId: tokens.open_id } } });
    if (linked && linked.userId !== userId) throw new Error("This TikTok account is already linked to another SeedEnv member.");
    const data = { providerId: tokens.open_id, displayName: profile.data.data.user.display_name, accessToken: seal(tokens.access_token), refreshToken: seal(tokens.refresh_token), expiresAt: new Date(Date.now() + tokens.expires_in * 1000), refreshExpiresAt: new Date(Date.now() + tokens.refresh_expires_in * 1000), scope: tokens.scope };
    await tx.clipSocialAccount.upsert({ where: { userId_provider: { userId, provider: "TIKTOK" } }, create: { userId, provider: "TIKTOK", ...data }, update: data });
  });
}

async function tikTokAccessToken(userId: string) {
  let account = await prisma.clipSocialAccount.findUnique({ where: { userId_provider: { userId, provider: "TIKTOK" } } });
  if (!account) throw new Error("Connect the TikTok account that published this video first.");
  if (account.expiresAt.getTime() > Date.now() + 60000) return unseal(account.accessToken);
  if (account.refreshExpiresAt <= new Date()) throw new Error("TikTok authorization expired. Reconnect your account.");
  const tokens = await requestTokens({ grant_type: "refresh_token", refresh_token: unseal(account.refreshToken) });
  if (tokens.open_id !== account.providerId) throw new Error("TikTok returned a different account during refresh. Reconnect.");
  await prisma.clipSocialAccount.updateMany({ where: { id: account.id, updatedAt: account.updatedAt }, data: { accessToken: seal(tokens.access_token), refreshToken: seal(tokens.refresh_token), expiresAt: new Date(Date.now() + tokens.expires_in * 1000), refreshExpiresAt: new Date(Date.now() + tokens.refresh_expires_in * 1000), scope: tokens.scope } });
  account = await prisma.clipSocialAccount.findUniqueOrThrow({ where: { id: account.id } });
  return unseal(account.accessToken);
}

export async function verifyTikTokPublication(id: string, userId: string) {
  tikTokConfig();
  const item = await serializable(async (tx) => {
    const current = await tx.clipEngagement.findUnique({ where: { id }, include: { campaign: true } });
    if (!current || current.creatorId !== userId || current.campaign.platform !== "TIKTOK") throw new Error("This TikTok agreement is unavailable.");
    assertClipTransition(current.status, ["PROOF_SUBMITTED"]);
    if (!current.publicationId || !current.approvedAt) throw new Error("Approved draft and submitted publication are required.");
    if (current.lastVerificationAt && current.lastVerificationAt.getTime() > Date.now() - 60000) throw new Error("Wait one minute before checking TikTok again.");
    await tx.clipEngagement.update({ where: { id }, data: { lastVerificationAt: new Date() } });
    return current;
  });
  const token = await tikTokAccessToken(userId);
  const response = await fetch("https://open.tiktokapis.com/v2/video/query/?fields=id,create_time,video_description,share_url", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ filters: { video_ids: [item.publicationId] } }), cache: "no-store", signal: AbortSignal.timeout(15000) });
  const result = z.object({ data: z.object({ videos: z.array(z.object({ id: z.string(), create_time: z.number(), video_description: z.string(), share_url: z.string() })) }), error: z.object({ code: z.literal("ok") }) }).safeParse(await response.json());
  if (!response.ok || !result.success) throw new Error("TikTok could not verify this video. Retry later or request explicitly labeled manual verification.");
  const video = result.data.data.videos.find((entry) => entry.id === item.publicationId);
  if (!video) throw new Error("This video was not returned for your connected TikTok account. It may be private, unavailable, or belong to someone else.");
  if (!video.video_description.includes(item.publicationCode) || video.create_time * 1000 < item.approvedAt!.getTime() - 1000) throw new Error("The public post must be created after draft approval and include the agreement's publication code in its caption.");
  const changed = await prisma.clipEngagement.updateMany({ where: { id, status: "PROOF_SUBMITTED", publicationId: item.publicationId, approvedDraftId: item.approvedDraftId }, data: { status: "VERIFIED", verifiedAt: new Date(), verificationMethod: "TIKTOK_OWNERSHIP_AND_CAPTION" } });
  if (!changed.count) throw new Error("The agreement changed during verification. Reload and retry.");
  return "TikTok confirmed account ownership, post metadata, and campaign code. The developer must still confirm the video matches the approved draft before releasing payment.";
}

export async function disconnectTikTok(userId: string) {
  const account = await prisma.clipSocialAccount.findUnique({ where: { userId_provider: { userId, provider: "TIKTOK" } } });
  if (!account) throw new Error("No TikTok account is connected.");
  const config = tikTokConfig();
  const response = await fetch("https://open.tiktokapis.com/v2/oauth/revoke/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: config.key, client_secret: config.secret, token: unseal(account.accessToken) }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("TikTok did not confirm revocation. You can also remove access in TikTok's account settings.");
  await prisma.clipSocialAccount.delete({ where: { id: account.id } });
}
