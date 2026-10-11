import { PostCard } from "@/components/launch-circle/PostCard";
import type { CirclePost } from "@/components/launch-circle/types";

/**
 * Illustrative updates shown alongside a quiet feed. They are always rendered in a
 * separate, explicitly labelled "Sample" section so visitors never mistake them for
 * real developer activity.
 */
export const SAMPLE_POSTS: CirclePost[] = [
  {
    id: "sample-goddesses-104",
    body: "Pushed Build 1.0.4 to TestFlight. We reworked the payment sheet and fixed the 3DS timeout bug reported earlier.\n\nLooking for 3 testers on iOS 18 to confirm the role-selection onboarding flow doesn't stutter.\n\n- `PaymentSheet` now retries the 3DS challenge once before surfacing an error\n- Onboarding role picker moved off the main thread",
    createdAt: "2026-10-20T09:00:00.000Z",
    publicVisible: true,
    tag: "NEED_VALIDATION",
    buildLabel: "1.0.4",
    campaign: { id: "sample-cohort", title: "Goddesses", platform: "TESTFLIGHT" },
    author: { id: "sample-tereza", username: "Tereza (TERIMUS LLC)", role: "DEVELOPER", xpPoints: 0 },
    helpfulCount: 0,
    _count: { comments: 2 },
    comments: [
      { id: "sample-comment-1", body: "Verified on iPhone 15 Pro, smooth 60fps through the whole payment sheet. 3DS challenge returned in under 2s.", author: { id: "sample-validator-1", username: "validator_mori", role: "TESTER", xpPoints: 0 }, tag: "DEVICE_CONFIRMED", deviceLabel: "iPhone 15 Pro · iOS 18.2" },
      { id: "sample-comment-2", body: "Found an edge case on iPad mini: rotating to landscape mid-checkout re-mounts the sheet and clears the saved card.", author: { id: "sample-validator-2", username: "qa_halden", role: "TESTER", xpPoints: 0 }, tag: "REPRO_LOG", deviceLabel: "iPad mini 6 · iPadOS 18.1" },
    ],
  },
  {
    id: "sample-seedenv-changelog",
    body: "Launch Circle v1.2 is live. Testers can now leave direct verification notes on active developer builds.",
    createdAt: "2026-10-19T12:00:00.000Z",
    publicVisible: true,
    tag: "CHANGELOG",
    author: { id: "sample-seedenv", username: "SeedEnv Core", role: "ADMIN", xpPoints: 0 },
    helpfulCount: 0,
    _count: { comments: 0 },
    comments: [],
  },
  {
    id: "sample-bugfix",
    body: "Patched the Play Console closed-track crash on cold start. Root cause was an `NullPointerException` in the deep-link handler when the app resumed from a notification.\n\nNo action needed from validators — reporting it here so the thread stays complete.",
    createdAt: "2026-10-18T16:30:00.000Z",
    publicVisible: true,
    tag: "BUG_FIX",
    author: { id: "sample-dev-2", username: "Northwind Labs", role: "DEVELOPER", xpPoints: 0 },
    helpfulCount: 0,
    _count: { comments: 0 },
    comments: [],
  },
];

export function FeedList({ posts, userId, admin = false, interactive = true, canComment = true, emptyMessage, showSamples = true, showDiscussionLink = true }: { posts: CirclePost[]; userId?: string; admin?: boolean; interactive?: boolean; canComment?: boolean; emptyMessage?: string; showSamples?: boolean; showDiscussionLink?: boolean }) {
  const samples = showSamples && posts.length < SAMPLE_POSTS.length;
  return <div className="space-y-4">
    {!posts.length ? <p role="status" className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-400">{emptyMessage ?? "No updates match this view yet."}</p> : null}
    {posts.map((post) => <PostCard key={post.id} post={post} userId={userId} admin={admin} interactive={interactive} canComment={canComment} showDiscussionLink={showDiscussionLink} />)}
    {samples ? <section aria-label="Sample Launch Circle updates" className="space-y-4 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 pt-5">
        <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">Sample updates</h2>
        <p className="font-mono text-[11px] text-zinc-500">Illustrative examples of a high-signal release note. Not real activity.</p>
      </div>
      {SAMPLE_POSTS.map((post) => <PostCard key={post.id} post={post} interactive={false} sample />)}
    </section> : null}
  </div>;
}
