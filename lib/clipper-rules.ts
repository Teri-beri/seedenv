import { z } from "zod";
import { quoteClipperFunding } from "./pricing";

export const clipTerms = "Creator retains ownership. On successful payment, the developer receives 90 days of non-exclusive organic repost rights to the approved video. Paid ads, boosting, whitelisting, raw footage, and ownership transfer are excluded and require a separate agreement. Developer review and release are due within 72 hours of submission; revisions within three days; publication within seven days of approval. Deadline or retention breaches require dispute review, not automatic forfeiture. No guaranteed views or sales. Required sponsorship disclosure and commercially licensed media are the creator's responsibility.";
export const clipTermsVersion = "clippers-v1-organic-90";
export const clipPlatforms = ["TIKTOK", "INSTAGRAM", "YOUTUBE"] as const;
export const clipGenres = ["Gaming", "Tech & apps", "Lifestyle", "Comedy", "Beauty & fashion", "Fitness", "Education", "Finance & business", "Food & travel", "Entertainment"] as const;
export const clipStatus = ["INVITED", "INVITATION_DECLINED", "WITHDRAWN", "ACCEPTED_WITHDRAWN", "APPLIED", "ACCEPTED", "FUNDING", "FUNDED", "DRAFT_SUBMITTED", "CHANGES_REQUESTED", "DRAFT_APPROVED", "PROOF_SUBMITTED", "VERIFIED", "PAYMENT_PENDING", "PAID", "DECLINED", "CANCEL_PENDING", "CANCELLED", "DISPUTED"] as const;
export const roomStatuses: readonly string[] = ["ACCEPTED", "FUNDING", "FUNDED", "DRAFT_SUBMITTED", "CHANGES_REQUESTED", "DRAFT_APPROVED", "PROOF_SUBMITTED", "VERIFIED", "PAYMENT_PENDING", "PAID", "DISPUTED", "CANCEL_PENDING", "CANCELLED", "ACCEPTED_WITHDRAWN"];
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
export const clipFeeInputSchema = z.string().trim().regex(/^\d{1,4}(?:\.\d{1,2})?$/, "Enter a USD amount with at most two decimal places.").transform((value) => {
  const [dollars, cents = ""] = value.split(".");
  return Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
}).pipe(clipCampaignSchema.shape.feeCents);

export function socialProfileIdentity(value: string) {
  const url = new URL(httpsUrl.parse(value));
  if (url.port) throw new Error("Use a standard social profile URL without a custom port.");
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.replace(/\/$/, "");
  if (host === "tiktok.com" && /^\/@[\w.-]{2,30}$/.test(path)) return { platform: "TIKTOK" as const, url: `https://www.tiktok.com${path}` };
  if (host === "instagram.com" && /^\/[\w.]{1,30}$/.test(path) && !["/p", "/reel", "/reels", "/stories", "/explore", "/accounts", "/direct"].includes(path.toLowerCase())) return { platform: "INSTAGRAM" as const, url: `https://www.instagram.com${path}/` };
  if (host === "youtube.com" && /^\/(?:@[\w.-]{3,30}|channel\/UC[\w-]{22}|(?:c|user)\/[\w.-]{1,100})$/.test(path)) return { platform: "YOUTUBE" as const, url: `https://www.youtube.com${path}` };
  throw new Error("Link a TikTok @profile, Instagram profile, or YouTube channel, not a post or shortened URL.");
}

const socialProfileUrl = httpsUrl.transform((value, ctx) => {
  try { return socialProfileIdentity(value).url; }
  catch (error) { ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid social profile." }); return z.NEVER; }
});
function optionalSocialUrl(platform: typeof clipPlatforms[number]) {
  return z.union([z.literal(""), socialProfileUrl.refine((value) => socialProfileIdentity(value).platform === platform, `Use your ${platform.toLowerCase()} profile URL.`)]).default("");
}
export const clipProfileSchema = z.object({
  bio: z.string().trim().min(20).max(1000),
  portfolioUrl: httpsUrl,
  socialUrl: socialProfileUrl,
  specialties: z.string().trim().min(3).max(200),
  genres: z.array(z.enum(clipGenres)).min(1).max(5).refine((items) => new Set(items).size === items.length, "Choose each genre only once."),
  tiktokUrl: optionalSocialUrl("TIKTOK"),
  instagramUrl: optionalSocialUrl("INSTAGRAM"),
  youtubeUrl: optionalSocialUrl("YOUTUBE"),
}).superRefine((profile, ctx) => {
  const primary = socialProfileIdentity(profile.socialUrl);
  const additional = primary.platform === "TIKTOK" ? profile.tiktokUrl : primary.platform === "INSTAGRAM" ? profile.instagramUrl : profile.youtubeUrl;
  if (additional && additional !== primary.url) ctx.addIssue({ code: "custom", path: [primary.platform === "TIKTOK" ? "tiktokUrl" : primary.platform === "INSTAGRAM" ? "instagramUrl" : "youtubeUrl"], message: "Use the same account as your primary social profile, or make a different platform your primary." });
});
export type ClipProfileInput = z.infer<typeof clipProfileSchema>;
export type ClipProfileView = ClipProfileInput & { status: string; revision: number; reviewNote: string | null; available: boolean };
export function clipSocialLinks(profile: { socialUrl: string; tiktokUrl?: string | null; instagramUrl?: string | null; youtubeUrl?: string | null }) {
  const links = new Map<typeof clipPlatforms[number], string>();
  for (const value of [profile.socialUrl, profile.tiktokUrl, profile.instagramUrl, profile.youtubeUrl]) {
    if (value) {
      const parsed = socialProfileIdentity(value);
      links.set(parsed.platform, parsed.url);
    }
  }
  return [...links].map(([platform, url]) => ({ platform, url }));
}
export function clipEligibility(creator: { emailVerified: Date | null; xpPoints: number }, profile: { status: string; socialUrl: string; tiktokUrl?: string | null; instagramUrl?: string | null; youtubeUrl?: string | null } | null, campaign: { platform: string; minimumRep: number }) {
  if (!creator.emailVerified) return "Verify your email before applying as a creator.";
  if (!profile) return "Complete your creator profile first.";
  if (profile.status !== "APPROVED") return "Your creator profile must be approved by SeedEnv before applying or accepting invitations.";
  if (creator.xpPoints < campaign.minimumRep) return `This campaign requires ${campaign.minimumRep} REP. Discovery Passes do not apply to creator contracts.`;
  if (!clipSocialLinks(profile).some((link) => link.platform === campaign.platform)) return `Add your ${campaign.platform.toLowerCase()} profile and have it approved before joining this campaign.`;
  return null;
}
export function clipProfileStatusLabel(status: string) {
  const labels: Record<string, string> = { DRAFT: "Not submitted", PENDING_REVIEW: "Under SeedEnv review", APPROVED: "Approved for the marketplace", REJECTED: "Changes needed", SUSPENDED: "Marketplace access suspended" };
  return labels[status] ?? status;
}

export function clipChargeCents(feeCents: number, platformFeeWaived = false) {
  if (!Number.isSafeInteger(feeCents) || feeCents < 1000 || feeCents > 100000) throw new Error("Creator fees must be between $10 and $1,000.");
  return quoteClipperFunding(feeCents / 100, platformFeeWaived);
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

export type ClipViewer = "DEVELOPER" | "CREATOR" | "ADMIN";

const clipStatusLabels: Record<string, string> = {
  INVITED: "Invitation pending", INVITATION_DECLINED: "Invitation declined", WITHDRAWN: "Withdrawn before funding", ACCEPTED_WITHDRAWN: "Closed before funding",
  APPLIED: "Application in review", ACCEPTED: "Accepted — awaiting funding", FUNDING: "Funding processing", FUNDED: "Funded — ready for draft",
  DRAFT_SUBMITTED: "Draft in review", CHANGES_REQUESTED: "Changes requested", DRAFT_APPROVED: "Approved — ready to post",
  PROOF_SUBMITTED: "Posted — awaiting verification", VERIFIED: "Verified — ready to release", PAYMENT_PENDING: "Releasing payment",
  PAID: "Paid", DECLINED: "Declined", CANCEL_PENDING: "Refund processing", CANCELLED: "Cancelled & refunded", DISPUTED: "Under review by SeedEnv",
};

export function clipStatusLabel(status: string) {
  return clipStatusLabels[status] ?? status.toLowerCase().replaceAll("_", " ");
}

const clipNextSteps: Record<string, Partial<Record<ClipViewer, string>>> = {
  INVITED: { DEVELOPER: "Waiting for the creator to accept your brief and terms. No payment has been taken.", CREATOR: "Read the brief and terms, then accept or decline this invitation before it expires." },
  APPLIED: { DEVELOPER: "Review this creator's background and samples, then accept or decline.", CREATOR: "Waiting for the developer to review your application." },
  ACCEPTED: { DEVELOPER: "Fund this agreement so the creator can start. Their fee transfers only after publication verification and release.", CREATOR: "Accepted! Do not start filming until this agreement says Funded." },
  FUNDING: { DEVELOPER: "Your funding payment is processing. Return here after checkout; the signed webhook confirms funding.", CREATOR: "Funding is processing. Do not start work until this agreement says Funded." },
  FUNDED: { DEVELOPER: "Payment received. The creator is working on their first draft.", CREATOR: "You're funded. Film your video and upload the clean draft below." },
  DRAFT_SUBMITTED: { DEVELOPER: "Watch the draft, then approve it or request specific changes.", CREATOR: "Your draft is with the developer for review." },
  CHANGES_REQUESTED: { DEVELOPER: "The creator is working on your requested changes.", CREATOR: "Read the developer's notes and upload a new version." },
  DRAFT_APPROVED: { DEVELOPER: "Approved. The creator will post it and submit the link.", CREATOR: "Post the approved video with the campaign code in the caption, then submit the link and a screenshot below." },
  PROOF_SUBMITTED: { DEVELOPER: "Open the live post, check it matches the approved draft, then record your verification.", CREATOR: "The developer is checking your post." },
  VERIFIED: { DEVELOPER: "Everything checks out. Release the creator's payment.", CREATOR: "Verified. Waiting for the developer to release your payment." },
  PAYMENT_PENDING: { DEVELOPER: "Payment release is in progress. Retry if it stays here.", CREATOR: "Your payment is being sent to your Stripe account." },
  PAID: { DEVELOPER: "Creator payment is complete. Your organic repost license ends on the date shown below; paid ads are not included.", CREATOR: "Paid! Keep the post public for the agreed number of days." },
  DISPUTED: { DEVELOPER: "SeedEnv is reviewing this agreement. Funds are frozen until it's resolved.", CREATOR: "SeedEnv is reviewing this agreement. Funds are frozen until it's resolved.", ADMIN: "Review both sides' evidence, then resume or refund." },
  CANCEL_PENDING: { DEVELOPER: "Your refund is processing.", CREATOR: "This agreement was cancelled before work started." },
};

export function clipNextStep(status: string, viewer: ClipViewer) {
  return clipNextSteps[status]?.[viewer] ?? null;
}
