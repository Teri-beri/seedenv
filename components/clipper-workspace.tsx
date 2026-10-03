"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clipPlatforms, clipTerms, type ClipProfileInput } from "@/lib/clipper-rules";
import { createClipCampaign, saveClipProfile, removeClipTikTok } from "@/app/actions/clipperActions";
import { ClipperForm, clipInputClass } from "@/components/clipper-controls";
import { MemberAction } from "@/components/member-action";
import { formatCents } from "@/lib/utils";

type CampaignCard = { id: string; title: string; brief: string; platform: string; feeCents: number; minimumRep: number; open: boolean; revisionLimit: number; developer: { username: string } };
export function ClipperWorkspace({ developer, profile, campaigns, agreements, socialName, tikTokEnabled, socialStatus }: {
  developer: boolean; profile: ClipProfileInput | null; campaigns: CampaignCard[]; agreements: Array<{ id: string; status: string; feeCents: number; campaign: { id: string; title: string } }>; socialName: string | null; tikTokEnabled: boolean; socialStatus?: string;
}) {
  const router = useRouter();
  return <div className="space-y-7">
    <section className="rounded-3xl border border-violet-400/25 bg-violet-500/5 p-5 sm:p-7"><p className="text-xs uppercase tracking-[0.2em] text-violet-300">Creator collaborations</p><h2 className="mt-3 text-2xl font-bold">Real stories. Clear briefs. Protected agreements.</h2><p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400">Clippers connects app teams with creators who know their audience. Apply, collaborate in a private room, refine your video, and publish the approved version. Fixed creator fees are pre-funded and released after verified publication, never based on views.</p><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{["Apply & agree", "Invite & pre-fund", "Review & publish", "Verify & pay"].map((text, index) => <p key={text} className="rounded-xl border border-stroke p-3 text-sm"><span className="mr-2 text-amber-300">{index + 1}</span>{text}</p>)}</div></section>
    {socialStatus === "failed" ? <p role="alert" className="rounded-xl border border-amber-500/30 p-4 text-sm text-amber-200">TikTok connection was not completed. Check authorization permissions and callback setup, then try again. No account was silently substituted.</p> : socialStatus === "connected" ? <p role="status" className="text-sm text-emerald-300">TikTok account connected.</p> : null}
    <details className="rounded-2xl border border-stroke p-5" open={!developer && !profile}><summary className="cursor-pointer text-lg font-bold">{developer ? "Create a Clippers campaign" : "Your creator profile & social connection"}</summary>
      <div className="mt-5">{developer ? <ClipperForm label="Create campaign" action={async (data) => {
        const id = await createClipCampaign({ title: String(data.get("title")), appUrl: String(data.get("appUrl")), brief: String(data.get("brief")), platform: clipPlatforms.find((platform) => platform === data.get("platform")) || "TIKTOK", feeCents: Math.round(Number(data.get("fee")) * 100), minimumRep: Number(data.get("minimumRep")), revisionLimit: Number(data.get("revisionLimit")), deliveryDays: Number(data.get("deliveryDays")), liveDays: Number(data.get("liveDays")) });
        router.push(`/clippers/${id}`);
        return "Campaign created.";
      }}>
        <label className="block text-sm">Campaign title<input required name="title" minLength={4} maxLength={90} className={clipInputClass} /></label>
        <label className="block text-sm">App website<input required type="url" name="appUrl" placeholder="https://your-app.com" className={clipInputClass} /></label>
        <label className="block text-sm">Creative brief<textarea required name="brief" minLength={40} maxLength={8000} rows={6} placeholder="Audience, hook, talking points, required app scenes, duration, aspect ratio, caption, disclosure, media rights, and what creators must avoid." className={clipInputClass} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">Publication platform<select name="platform" className={clipInputClass}>{clipPlatforms.map((platform) => <option key={platform}>{platform}</option>)}</select></label>
          <label className="block text-sm">Creator fee (USD)<input required type="number" name="fee" min={10} max={1000} step="0.01" defaultValue={50} className={clipInputClass} /></label>
          <label className="block text-sm">Minimum tester REP<input required type="number" name="minimumRep" min={0} max={1000000} defaultValue={0} className={clipInputClass} /></label>
          <label className="block text-sm">Included revision rounds<input required type="number" name="revisionLimit" min={0} max={5} defaultValue={2} className={clipInputClass} /></label>
          <label className="block text-sm">Draft due after funding (days)<input required type="number" name="deliveryDays" min={3} max={30} defaultValue={7} className={clipInputClass} /></label>
          <label className="block text-sm">Post must stay public (days)<input required type="number" name="liveDays" min={7} max={90} defaultValue={30} className={clipInputClass} /></label>
        </div>
        <p className="text-sm leading-6 text-neutral-400">Terms are fixed once created. You fund each accepted creator separately, including an 8% share of the total charge as platform fee. Developer review / release is due within 72 hours of submission, revisions within three days, and publication within seven days of approval. Deadlines and live-post retention are contractual requirements, not automatic refunds or retroactive payout clawbacks.</p>
        <p className="text-xs leading-6 text-neutral-500">{clipTerms}</p>
      </ClipperForm> : <div className="space-y-6"><ClipperForm label="Save creator profile" action={async (data) => saveClipProfile({ bio: String(data.get("bio")), portfolioUrl: String(data.get("portfolioUrl")), socialUrl: String(data.get("socialUrl")), specialties: String(data.get("specialties")) })}>
        <label className="block text-sm">Creator introduction<textarea required name="bio" minLength={20} maxLength={1000} rows={4} defaultValue={profile?.bio} className={clipInputClass} /></label>
        <label className="block text-sm">Portfolio / sample videos<input required type="url" name="portfolioUrl" defaultValue={profile?.portfolioUrl} className={clipInputClass} /></label>
        <label className="block text-sm">Primary social profile<input required type="url" name="socialUrl" defaultValue={profile?.socialUrl} className={clipInputClass} /></label>
        <label className="block text-sm">Audience & content specialties<input required name="specialties" minLength={3} maxLength={200} defaultValue={profile?.specialties} placeholder="Productivity, mobile apps, student life..." className={clipInputClass} /></label>
        <p className="text-xs leading-6 text-neutral-500">Profile links are self-reported, not verified follower counts. Developers review your real samples. Verify your email and finish Stripe payout setup in Account before funding.</p>
      </ClipperForm><div className="rounded-xl border border-stroke p-4">{socialName ? <><p className="mb-3 text-sm text-emerald-300">TikTok ownership connected: {socialName}</p><MemberAction action={removeClipTikTok}>Disconnect TikTok</MemberAction></> : tikTokEnabled ? <a href="/api/clippers/tiktok/connect" className="inline-flex min-h-11 items-center rounded-xl border border-stroke p-3 text-sm">Connect TikTok / profile & public video access</a> : <p className="text-sm leading-6 text-neutral-400">TikTok connection is unavailable until SeedEnv has approved Login Kit / Display API credentials. Manual publication verification remains available and is labeled as such.</p>}<p className="mt-3 text-xs leading-6 text-neutral-500">Connection does not post for you. You keep control of publishing and can revoke access.</p></div></div>}</div>
    </details>
    {agreements.length ? <section><h2 className="mb-4 text-xl font-bold">{developer ? "Creator agreements" : "Your Clippers work"}</h2><div className="grid gap-3 sm:grid-cols-2">{agreements.map((item) => <Link key={item.id} href={`/clippers/${item.campaign.id}`} className="min-w-0 rounded-xl border border-stroke p-4"><p className="font-semibold">{item.campaign.title}</p><p className="mt-2 text-sm text-amber-300">{item.status.replaceAll("_", " ")} / {formatCents(item.feeCents)}</p></Link>)}</div></section> : null}
    <section><h2 className="mb-4 text-xl font-bold">{developer ? "Your campaigns" : "Find your next creator collaboration"}</h2><div className="grid gap-4 sm:grid-cols-2">{campaigns.map((campaign) => <article key={campaign.id} className="min-w-0 rounded-2xl border border-stroke bg-surface p-5"><p className="text-xs text-violet-300">{campaign.platform} / {campaign.open ? "Applications open" : "Applications closed"}</p><h3 className="mt-2 text-lg font-bold">{campaign.title}</h3><p className="mt-2 text-sm text-neutral-500">{campaign.developer.username}</p><p className="mt-3 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-400">{campaign.brief}</p><p className="mt-4 font-semibold text-amber-300">{formatCents(campaign.feeCents)} per creator</p><p className="mt-2 text-xs text-neutral-500">{campaign.minimumRep} REP / {campaign.revisionLimit} revision rounds / No view targets</p><Link className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-stroke px-4 py-3 text-sm" href={`/clippers/${campaign.id}`}>View brief & agreements</Link></article>)}</div>{!campaigns.length ? <p className="rounded-xl border border-dashed border-stroke p-6 text-sm text-neutral-400">No Clippers campaigns available yet.</p> : null}</section>
  </div>;
}
