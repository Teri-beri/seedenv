import { safeExternalUrl } from "@/lib/public-profile";

export function MemberAvatar({ username, avatarUrl }: { username: string; avatarUrl: string | null }) {
  const image = safeExternalUrl(avatarUrl);
  return <span aria-label={`${username} avatar`} role="img" className="grid size-10 shrink-0 place-items-center rounded-full border border-white/10 bg-zinc-900 bg-cover bg-center text-sm font-semibold text-emerald-300" style={image ? { backgroundImage: `url(${JSON.stringify(image)})` } : undefined}>{image ? null : username.charAt(0).toUpperCase()}</span>;
}
