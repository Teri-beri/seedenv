export type CirclePostTag = "CHANGELOG" | "NEED_VALIDATION" | "BUG_FIX";
export type CircleCommentTag = "GENERAL_FEEDBACK" | "REPRO_LOG" | "DEVICE_CONFIRMED";

export type CircleAuthor = { id: string; username: string; role: string; xpPoints: number };

export type CircleCampaign = { id: string; title: string; platform: string; status?: string };

export type CircleComment = {
  id: string;
  body: string;
  author: CircleAuthor;
  tag?: CircleCommentTag | null;
  deviceLabel?: string | null;
  createdAt?: string;
};

export type CirclePost = {
  id: string;
  body: string;
  createdAt: string;
  publicVisible?: boolean;
  tag?: CirclePostTag | null;
  buildLabel?: string | null;
  campaign?: CircleCampaign | null;
  author: CircleAuthor;
  _count: { comments: number };
  helpfulCount?: number;
  viewerFoundHelpful?: boolean;
  comments: CircleComment[];
};

export const POST_TAGS: ReadonlyArray<{ value: CirclePostTag; label: string; className: string }> = [
  { value: "CHANGELOG", label: "Changelog", className: "border-sky-900 bg-sky-950/40 text-sky-300" },
  { value: "NEED_VALIDATION", label: "Need Validation", className: "border-emerald-900 bg-emerald-950/40 text-emerald-300" },
  { value: "BUG_FIX", label: "Bug Fix", className: "border-amber-900 bg-amber-950/40 text-amber-300" },
];

export const COMMENT_TAGS: ReadonlyArray<{ value: CircleCommentTag; label: string; className: string }> = [
  { value: "GENERAL_FEEDBACK", label: "General Feedback", className: "border-zinc-800 bg-zinc-900/60 text-zinc-300" },
  { value: "REPRO_LOG", label: "Repro Log", className: "border-amber-900 bg-amber-950/40 text-amber-300" },
  { value: "DEVICE_CONFIRMED", label: "Device Confirmed", className: "border-emerald-900 bg-emerald-950/40 text-emerald-300" },
];

export const PLATFORM_LABELS: Record<string, string> = {
  TESTFLIGHT: "iOS TestFlight",
  PLAY_STORE: "Play Console",
  WEB_STAGING: "Web / PWA",
};

export const pillClass = "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] leading-5";

export function postTag(value?: CirclePostTag | null) {
  return POST_TAGS.find((item) => item.value === value) ?? POST_TAGS[0];
}

export function commentTag(value?: CircleCommentTag | null) {
  return COMMENT_TAGS.find((item) => item.value === value) ?? COMMENT_TAGS[0];
}

export function roleLabel(role: string) {
  return role === "TESTER" ? "Validator" : role === "ADMIN" ? "Moderator" : "Developer";
}

/** `@handle` form used in post headers; falls back to a slug when the username has spaces. */
export function handleFor(username: string) {
  return `@${username.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "member"}`;
}

export function appBadgeLabel(campaign?: CircleCampaign | null, buildLabel?: string | null) {
  if (!campaign) return null;
  const build = buildLabel?.trim();
  return build ? `${campaign.title} v${build.replace(/^v/i, "")}` : campaign.title;
}

export function timeAgo(iso: string, now = Date.now()) {
  const elapsed = now - new Date(iso).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return "just now";
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
