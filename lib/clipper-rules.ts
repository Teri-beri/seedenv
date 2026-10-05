import { z } from "zod";
import { quoteCampaignFunding } from "./pricing";

export const clipTerms = "Creator retains ownership. On successful payment, the developer receives 90 days of non-exclusive organic repost rights to the approved video. Paid ads, boosting, whitelisting, raw footage, and ownership transfer are excluded and require a separate agreement. Developer review and release are due within 72 hours of submission; revisions within three days; publication within seven days of approval. Deadline or retention breaches require dispute review, not automatic forfeiture. No guaranteed views or sales. Required sponsorship disclosure and commercially licensed media are the creator's responsibility.";
export const clipTermsVersion = "clippers-v1-organic-90";
export const clipPlatforms = ["TIKTOK", "INSTAGRAM", "YOUTUBE"] as const;
export const clipStatus = ["APPLIED", "ACCEPTED", "FUNDING", "FUNDED", "DRAFT_SUBMITTED", "CHANGES_REQUESTED", "DRAFT_APPROVED", "PROOF_SUBMITTED", "VERIFIED", "PAYMENT_PENDING", "PAID", "DECLINED", "CANCEL_PENDING", "CANCELLED", "DISPUTED"] as const;
export const roomStatuses: readonly string[] = ["ACCEPTED", "FUNDING", "FUNDED", "DRAFT_SUBMITTED", "CHANGES_REQUESTED", "DRAFT_APPROVED", "PROOF_SUBMITTED", "VERIFIED", "PAYMENT_PENDING", "PAID", "DISPUTED"];
export const draftStatuses: readonly string[] = ["FUNDED", "CHANGES_REQUESTED"];
export const fundedStatuses: readonly string[] = ["FUNDED", "DRAFT_SUBMITTED", "CHANGES_REQUESTED", "DRAFT_APPROVED", "PROOF_SUBMITTED", "VERIFIED", "DISPUTED"];
export const httpsUrl = z.string().trim().url().max(1000).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Use a public HTTPS URL without credentials.");

export const clipCampaignSchema = z.object({
  title: z.string().trim().min(4).max(90),
  appUrl: httpsUrl,
  brief: z.string().trim().min(40).max(8000),
  platform: z.enum(clipPlatforms),
  feeCents: z.number().int().min(1000).max(100000),
  revisionLimit: z.number().int().min(0).max(5),
  deliveryDays: z.number().int().min(3).max(30),
  liveDays: z.number().int().min(7).max(90),
  minimumRep: z.number().int().min(0).max(1000000),
});
export type ClipCampaignInput = z.infer<typeof clipCampaignSchema>;
export const clipProfileSchema = z.object({
  bio: z.string().trim().min(20).max(1000),
  portfolioUrl: httpsUrl,
  socialUrl: httpsUrl,
  specialties: z.string().trim().min(3).max(200),
});
export type ClipProfileInput = z.infer<typeof clipProfileSchema>;

export function clipChargeCents(feeCents: number) {
  if (!Number.isSafeInteger(feeCents) || feeCents < 1000 || feeCents > 100000) throw new Error("Creator fees must be between $10 and $1,000.");
  return quoteCampaignFunding(feeCents / 100).escrowTotalCents;
}

export function publicationIdentity(value: string, platform: string) {
  const url = new URL(httpsUrl.parse(value));
  const host = url.hostname.toLowerCase();
  const patterns: Record<string, { hosts: string[]; pattern: RegExp }> = {
    TIKTOK: { hosts: ["www.tiktok.com", "tiktok.com"], pattern: /^\/@[\w.-]+\/video\/(\d{10,25})\/?$/ },
    INSTAGRAM: { hosts: ["www.instagram.com", "instagram.com"], pattern: /^\/(?:reel|p)\/([\w-]{5,30})\/?$/ },
    YOUTUBE: { hosts: ["www.youtube.com", "youtube.com", "youtu.be"], pattern: /^\/(?:shorts\/)?([\w-]{11})\/?$/ },
  };
  const config = patterns[platform];
  if (!config || !config.hosts.includes(host) || url.port) throw new Error("Use a full post URL from the campaign's social platform, not a shortened or profile link.");
  const id = platform === "YOUTUBE" && host !== "youtu.be" && url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(config.pattern)?.[1];
  if (!id || (platform === "YOUTUBE" && !/^[\w-]{11}$/.test(id))) throw new Error("This is not a supported video post URL.");
  return { id, url: platform === "TIKTOK" ? `${url.origin}${url.pathname}` : url.toString() };
}

export function assertClipTransition(status: string, allowed: readonly string[]) {
  if (!allowed.includes(status)) throw new Error(`This action is unavailable while the agreement is ${status.toLowerCase().replaceAll("_", " ")}.`);
}
