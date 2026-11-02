"use client";

import Link from "next/link";
import { inviteClipper } from "@/app/actions/clipperActions";
import { ClipperForm, clipInputClass } from "@/components/clipper-controls";
import { clipGenres, clipPlatforms, clipSocialLinks, type ClipProfileInput } from "@/lib/clipper-rules";
import { formatCents } from "@/lib/utils";

export type MarketplaceCreator = ClipProfileInput & { userId: string; username: string; reputation: number; socialName: string | null; completedCollaborations: number; existingCampaignIds: string[] };
export type MarketplaceCampaign = { id: string; title: string; platform: string; feeCents: number; minimumRep: number; open: boolean };

export function ClipperMarketplace({ creators, campaigns, developer, query, genre, platform, page, total }: {
  creators: MarketplaceCreator[]; campaigns: MarketplaceCampaign[]; developer: boolean;
  query: string; genre: string; platform: string; page: number; total: number;
}) {
  function pageHref(next: number) {
    return `/clippers?${new URLSearchParams({ q: query, genre, platform, page: String(next) })}#marketplace`;
  }
  return <section id="marketplace" className="scroll-mt-24 space-y-5">
    <div><p className="text-xs uppercase tracking-widest text-violet-300">Accepted creator marketplace</p><h2 className="mt-2 text-2xl font-bold">Find the voice that fits your app.</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-neutral-400">Browse real, SeedEnv-reviewed clippers by their usual genres and social platforms. Look at their samples before hiring. Creator fees are fixed per campaign, not paid per view.</p></div>
    <form action="/clippers" className="grid gap-3 rounded-2xl border border-stroke p-4 sm:grid-cols-[2fr_1fr_1fr_auto]">
      <label className="text-sm">Search creators<input name="q" maxLength={100} defaultValue={query} placeholder="Name, audience, style..." className={clipInputClass} /></label>
      <label className="text-sm">Genre<select name="genre" defaultValue={genre} className={clipInputClass}><option value="">All genres</option>{clipGenres.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="text-sm">Social platform<select name="platform" defaultValue={platform} className={clipInputClass}><option value="">All platforms</option>{clipPlatforms.map((item) => <option key={item}>{item}</option>)}</select></label>
      <button type="submit" className="min-h-11 self-end rounded-xl bg-violet-500 px-4 py-3 text-sm font-semibold">Find creators</button>
    </form>
    <p role="status" className="text-xs text-neutral-400">{total} approved {total === 1 ? "creator matches" : "creators match"} your filters. Social profiles are creator-provided; reach and performance are not guaranteed.</p>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{creators.map((creator) => {
      const socials = clipSocialLinks(creator);
      const available = campaigns.filter((campaign) => !creator.existingCampaignIds.includes(campaign.id) && creator.reputation >= campaign.minimumRep && socials.some((link) => link.platform === campaign.platform));
      return <article key={creator.userId} className="flex min-w-0 flex-col rounded-2xl border border-violet-400/20 bg-surface p-5">
        <div className="flex items-center gap-3"><span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/20 text-xl font-bold text-violet-200">{creator.username.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><h3 className="break-words text-lg font-bold">{creator.username}</h3><p className="mt-1 text-xs text-emerald-300">SeedEnv profile reviewed</p></div></div>
        <div className="mt-4 flex flex-wrap gap-2">{creator.genres.map((item) => <span key={item} className="rounded-full bg-violet-500/10 px-3 py-1 text-xs text-violet-200">{item}</span>)}</div>
        <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-300">{creator.bio}</p>
        <p className="mt-3 break-words text-sm leading-6 text-neutral-400">Audience & style: {creator.specialties}</p>
        <p className="mt-3 text-xs text-neutral-500">{creator.completedCollaborations} paid SeedEnv collaborations / {creator.reputation} tester REP (not creator reach)</p>
        <div className="mt-4 flex flex-wrap gap-2">{socials.map((link) => <a key={link.platform} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-stroke px-3 py-2 text-sm">{link.platform} profile ↗</a>)}<a href={creator.portfolioUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-stroke px-3 py-2 text-sm">View samples ↗</a></div>
        {creator.socialName ? <p className="mt-3 text-xs text-emerald-200">TikTok connection: {creator.socialName}. Other profiles are self-reported.</p> : null}
        {developer ? <div className="mt-5 border-t border-stroke pt-4">{available.length ? <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-amber-200">Invite to your campaign</summary><ClipperForm label="Send invitation — no charge" action={async (data) => inviteClipper(creator.userId, String(data.get("campaignId")), String(data.get("note")))}>
          <label className="block text-sm">Choose a matching brief<select required name="campaignId" className={clipInputClass}>{available.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.title} / {formatCents(campaign.feeCents)} to creator{campaign.open ? "" : " / invite-only"}</option>)}</select></label>
          <label className="block text-sm">Why you want to collaborate<textarea required name="note" minLength={20} maxLength={1500} rows={3} className={clipInputClass} /></label>
          <p className="text-xs leading-6 text-neutral-500">They have seven days to accept your fixed brief and terms. After acceptance, you fund the agreement through Stripe. No filming starts until funding is confirmed.</p>
        </ClipperForm></details> : <p className="text-sm leading-6 text-neutral-400">{!campaigns.length ? <><a href="#create-campaign" className="text-violet-200 underline">Create a campaign below</a> to invite this creator.</> : "No eligible new campaign on this page. Match their platform and REP requirement, browse older campaigns below, or open your existing agreement."}</p>}</div> : null}
      </article>;
    })}</div>
    {!creators.length ? <div className="rounded-2xl border border-dashed border-stroke p-6"><h3 className="font-semibold">No approved creators match yet.</h3><p className="mt-2 text-sm leading-6 text-neutral-400">{query || genre || platform ? "Try a different genre, platform, or search." : developer ? "Post a clear campaign brief while creators apply for marketplace approval." : "Complete your profile below and submit it for review to join this marketplace."}</p>{query || genre || platform ? <Link href="/clippers#marketplace" className="mt-3 inline-flex min-h-11 items-center text-sm text-violet-200">Clear filters</Link> : null}</div> : null}
    {total > 12 ? <nav aria-label="Creator marketplace pages" className="flex items-center justify-between gap-3">{page > 1 ? <Link href={pageHref(page - 1)} className="min-h-11 rounded-xl border border-stroke p-3 text-sm">Previous</Link> : <span />}<p className="text-sm text-neutral-400">Page {page} of {Math.ceil(total / 12)}</p>{page * 12 < total ? <Link href={pageHref(page + 1)} className="min-h-11 rounded-xl border border-stroke p-3 text-sm">Next</Link> : <span />}</nav> : null}
  </section>;
}
