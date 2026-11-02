"use client";

import { moderateClipProfile } from "@/app/actions/clipperActions";
import { ClipperForm, clipInputClass } from "@/components/clipper-controls";
import { clipProfileStatusLabel, type ClipProfileView } from "@/lib/clipper-rules";
import Link from "next/link";

export function ClipperAdminReview({ profiles }: { profiles: Array<ClipProfileView & { userId: string; username: string; emailVerified: boolean; submittedAt: string | null; agreements: Array<{ id: string; status: string; campaignId: string; campaign: { title: string } }> }> }) {
  return <section className="space-y-4"><h2 className="text-xl font-bold">Creator applications & marketplace moderation</h2><p className="text-sm leading-6 text-neutral-400">Review genres, audience, samples, and the actual social profiles. Approval means the profile was reviewed, not that reach or sales are guaranteed. Suspensions block new applications and funding, but do not hide existing funded work or remove dispute evidence.</p>
    {profiles.map((profile) => <article key={`${profile.userId}-${profile.revision}-${profile.status}`} className="space-y-4 rounded-2xl border border-stroke p-5">
      <div><h3 className="font-bold">{profile.username} / {clipProfileStatusLabel(profile.status)}</h3><p className="mt-2 text-xs text-neutral-400">Version {profile.revision} / Email {profile.emailVerified ? "verified" : "not verified"}{profile.submittedAt ? ` / Submitted ${new Date(profile.submittedAt).toLocaleDateString()}` : ""}</p></div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{profile.bio}</p><p className="text-sm text-violet-200">{profile.genres.join(" / ")}</p><p className="break-words text-sm text-neutral-400">{profile.specialties}</p>
      <div className="flex flex-wrap gap-2">{[["Portfolio", profile.portfolioUrl], ["Primary social", profile.socialUrl], ["TikTok", profile.tiktokUrl], ["Instagram", profile.instagramUrl], ["YouTube", profile.youtubeUrl]].filter(([, url]) => url).map(([label, url]) => <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-stroke p-3 text-sm">{label}</a>)}</div>
      {profile.reviewNote ? <p className="text-sm text-neutral-400">Last review: {profile.reviewNote}</p> : null}
      {profile.agreements.length ? <details><summary className="min-h-11 cursor-pointer py-3 text-sm text-violet-200">Review this creator&apos;s active agreements (latest 10)</summary>{profile.agreements.map((item) => <Link key={item.id} href={`/clippers/${item.campaignId}?agreement=${item.id}`} className="mt-2 block min-h-11 rounded-xl border border-stroke p-3 text-sm">{item.campaign.title} / {item.status.toLowerCase().replaceAll("_", " ")}</Link>)}</details> : null}
      <ClipperForm label="Record profile review" action={async (data) => moderateClipProfile(profile.userId, profile.revision, profile.status === "APPROVED" ? "SUSPENDED" : profile.status === "SUSPENDED" ? "REJECTED" : data.get("decision") === "APPROVED" ? "APPROVED" : "REJECTED", String(data.get("note")), data.get("confirmed") === "on")}>
        {profile.status === "PENDING_REVIEW" ? <label className="block text-sm">Decision<select name="decision" className={clipInputClass}><option value="REJECTED">Request changes — do not list yet</option><option value="APPROVED">Approve marketplace listing</option></select></label> : <p className="text-sm text-amber-200">{profile.status === "APPROVED" ? "This review suspends the listing and new hiring." : "This review permits the creator to make changes and resubmit; it does not restore approval automatically."}</p>}
        <label className="block text-sm">Reason / feedback to creator<textarea required name="note" minLength={12} maxLength={1500} rows={3} className={clipInputClass} /></label>
        <label className="flex items-start gap-3 text-sm leading-6"><input required type="checkbox" name="confirmed" className="mt-1 size-5 shrink-0" /><span>I reviewed the submitted genres, audience description, samples, and social profile links. My decision does not promise views or sales.</span></label>
      </ClipperForm>
    </article>)}
    {!profiles.length ? <p className="rounded-xl border border-dashed border-stroke p-5 text-sm text-neutral-400">No profiles in this review filter.</p> : null}
  </section>;
}
