import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicDeveloperProfile, publicProfilePath, safeExternalUrl } from "@/lib/public-profile";
import { platformTag } from "@/lib/billing";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getPublicDeveloperProfile((await params).username);
  if (!profile) return { title: "Profile not found", robots: { index: false } };
  const title = `@${profile.username} · Developer Profile`;
  const description = profile.bio || `@${profile.username} runs beta validation cohorts on SeedEnv.`;
  return { title, description, alternates: { canonical: publicProfilePath(profile.username) }, openGraph: { title, description } };
}

export default async function PublicDeveloperProfilePage({ params }: Props) {
  const profile = await getPublicDeveloperProfile((await params).username);
  if (!profile) notFound();

  const initial = profile.username.charAt(0).toUpperCase();
  const avatarUrl = safeExternalUrl(profile.avatarUrl);
  const twitter = profile.twitterHandle?.replace(/^@/, "");
  const links = [
    { label: "Website", href: safeExternalUrl(profile.productUrl) },
    { label: "Portfolio", href: safeExternalUrl(profile.portfolioUrl) },
    { label: "GitHub", href: profile.githubUsername ? `https://github.com/${encodeURIComponent(profile.githubUsername)}` : null },
    { label: "X / Twitter", href: twitter ? `https://x.com/${encodeURIComponent(twitter)}` : null },
    { label: "Discord", href: safeExternalUrl(profile.discordUrl) },
  ].filter((link): link is { label: string; href: string } => Boolean(link.href));

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <span
          className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900 bg-cover bg-center text-xl font-semibold text-zinc-300"
          style={avatarUrl ? { backgroundImage: `url(${JSON.stringify(avatarUrl)})` } : undefined}
          role="img"
          aria-label={`@${profile.username} avatar`}
        >
          {avatarUrl ? null : initial}
        </span>
        <div className="min-w-0">
          <span className="block font-mono text-xs uppercase tracking-wider text-zinc-500">Developer Profile</span>
          <h1 className="!mt-1 break-words !text-2xl !font-semibold tracking-tight text-zinc-100 sm:!text-3xl">@{profile.username}</h1>
          {profile.companyName ? <span className="mt-1 block font-mono text-sm text-zinc-400">{profile.companyName}</span> : null}
        </div>
      </section>

      {profile.bio ? <div className="max-w-2xl text-base leading-relaxed text-zinc-300">{profile.bio}</div> : null}

      {links.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Developer links">
          {links.map((link) => (
            <li key={link.label}>
              <a href={link.href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 font-mono text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100">
                {link.label} <span className="text-zinc-500">↗</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      <section className="border-t border-zinc-800 pt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="!mt-0 !text-base !font-semibold text-zinc-100">Active Cohorts</h2>
          <span className="font-mono text-xs text-zinc-500">{profile.cohorts.length} open</span>
        </div>
        {profile.cohorts.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {profile.cohorts.map((cohort) => {
              const open = Math.max(0, cohort.totalSlots - cohort.claimedSlots);
              const platform = platformTag(cohort.platform);
              return (
                <li key={cohort.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700">
                  <div className="flex items-start justify-between gap-3">
                    <span className="break-words text-sm font-medium text-zinc-100">{cohort.title}</span>
                    {platform ? <span className="shrink-0 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">{platform}</span> : null}
                  </div>
                  <span className="mt-2 line-clamp-2 block text-sm text-zinc-400">{cohort.description}</span>
                  <div className="mt-4 flex items-center justify-between font-mono text-xs">
                    <span className="text-emerald-400">${cohort.bountyPerTaskUsd.toFixed(2)} / approved task</span>
                    <span className="text-zinc-500">{open} of {cohort.totalSlots} slots open</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-500">No cohorts are recruiting testers right now.</div>
        )}
        <Link href="/explore" className="mt-6 inline-flex font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-100">Browse all open cohorts →</Link>
      </section>
    </div>
  );
}
