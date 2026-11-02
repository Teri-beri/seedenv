"use client";

import Link from "next/link";
import { useState } from "react";
import { saveClipProfile, setClipAvailability, submitClipProfile } from "@/app/actions/clipperActions";
import { ClipperForm, clipInputClass } from "@/components/clipper-controls";
import { MemberAction } from "@/components/member-action";
import { clipGenres, clipProfileSchema, clipProfileStatusLabel, type ClipProfileView } from "@/lib/clipper-rules";

export function ClipperProfileEditor({ profile, emailVerified }: { profile: ClipProfileView | null; emailVerified: boolean }) {
  const [dirty, setDirty] = useState(false);
  return <section id="creator-profile" className="scroll-mt-24 space-y-5">
    <div className="rounded-xl border border-violet-400/30 bg-violet-500/5 p-4">
      <h3 className="font-semibold">{profile ? clipProfileStatusLabel(profile.status) : "Apply to become a Clipper"}</h3>
      <p className="mt-2 text-sm leading-6 text-neutral-400">Save your real genres, audience, social accounts, and samples, then submit for SeedEnv review. Only approved profiles appear in the marketplace. Approval is not a guarantee of reach, sales, or social account ownership.</p>
      {profile?.status === "PENDING_REVIEW" ? <p className="mt-2 text-sm text-amber-200">Your application is in the admin queue. Editing it withdraws that version; submit the new version again.</p> : null}
      {profile?.status === "APPROVED" ? <div className="mt-3 space-y-3"><p className="text-sm text-emerald-200">{profile.available ? "Your profile is listed and open to invitations." : "Your approved listing is paused; you will not receive new marketplace invitations."} Editing profile content requires re-review; existing funded work stays available.</p><MemberAction action={() => setClipAvailability(!profile.available)}>{profile.available ? "Pause listing & new invitations" : "Resume approved listing"}</MemberAction></div> : null}
      {profile?.reviewNote ? <p className="mt-3 whitespace-pre-wrap break-words text-sm text-violet-200">SeedEnv review: {profile.reviewNote}</p> : null}
      {!emailVerified ? <p role="alert" className="mt-3 text-sm text-amber-200">Verify your email before submitting your creator application.</p> : null}
    </div>
    <ClipperForm label="Save profile draft" disabled={profile?.status === "SUSPENDED"} onChange={() => setDirty(true)} action={async (data) => {
      const message = await saveClipProfile(clipProfileSchema.parse({
      bio: String(data.get("bio") || ""), portfolioUrl: String(data.get("portfolioUrl") || ""),
      socialUrl: String(data.get("socialUrl") || ""), specialties: String(data.get("specialties") || ""),
      genres: data.getAll("genres"), tiktokUrl: String(data.get("tiktokUrl") || ""),
      instagramUrl: String(data.get("instagramUrl") || ""), youtubeUrl: String(data.get("youtubeUrl") || ""),
      }), profile?.revision ?? null);
      setDirty(false);
      return message;
    }}>
      <label className="block text-sm">Creator introduction<textarea required name="bio" minLength={20} maxLength={1000} rows={4} defaultValue={profile?.bio} className={clipInputClass} placeholder="Your style, experience, and what makes your videos distinct." /></label>
      <fieldset><legend className="text-sm">Your usual content genres (choose 1-5)</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{clipGenres.map((genre) => <label key={genre} className="flex min-h-11 items-center gap-3 rounded-xl border border-stroke p-3 text-sm"><input type="checkbox" name="genres" value={genre} defaultChecked={profile?.genres.includes(genre)} className="size-5" />{genre}</label>)}</div></fieldset>
      <label className="block text-sm">Audience & typical content<input required name="specialties" minLength={3} maxLength={200} defaultValue={profile?.specialties} placeholder="Who watches you, languages, recurring topics, and video formats." className={clipInputClass} /></label>
      <label className="block text-sm">Portfolio / sample videos<input required type="url" name="portfolioUrl" defaultValue={profile?.portfolioUrl} placeholder="https://your-portfolio.com" className={clipInputClass} /></label>
      <label className="block text-sm">Primary social profile<input required type="url" name="socialUrl" defaultValue={profile?.socialUrl} placeholder="https://www.tiktok.com/@yourname" className={clipInputClass} /></label>
      <div className="grid gap-4 sm:grid-cols-3">{([["tiktokUrl", "TikTok"], ["instagramUrl", "Instagram"], ["youtubeUrl", "YouTube"]] as const).map(([name, label]) => <label key={name} className="block text-sm">{label} profile (optional)<input type="url" name={name} defaultValue={profile?.[name]} className={clipInputClass} /></label>)}</div>
      <p className="text-xs leading-6 text-neutral-500">Link actual social profiles, not individual posts. You need an approved account link for the campaign&apos;s publication platform. Social links are self-reported unless separately connected through TikTok.</p>
    </ClipperForm>
    {dirty ? <p role="status" className="text-sm text-amber-200">You have unsaved changes. Save your draft before submitting it for review.</p> : null}
    {profile && ["DRAFT", "REJECTED"].includes(profile.status) ? <MemberAction action={() => submitClipProfile(profile.revision)} disabled={!emailVerified || dirty}>Submit creator application for review</MemberAction> : null}
    {profile?.status === "SUSPENDED" ? <p className="text-sm text-amber-200">New applications and invitations are paused. <Link href="/contact" className="underline">Contact SeedEnv</Link> to resolve the review; existing funded agreements remain accessible.</p> : null}
    <Link href="/account?tab=portfolio#stripe-setup" className="inline-flex min-h-11 items-center text-sm text-violet-200">Set up creator payouts in Account</Link>
  </section>;
}
