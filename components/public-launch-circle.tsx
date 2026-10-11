import { FeedList } from "@/components/launch-circle/FeedList";
import { LaunchCircleAccess } from "@/components/launch-circle-access";
import type { CirclePost } from "@/components/launch-circle/types";

export function PublicLaunchCircle({ posts, signedIn, unavailable = false, showSamples = true, showDiscussionLink = true, emptyMessage }: { posts: CirclePost[]; signedIn: boolean; unavailable?: boolean; showSamples?: boolean; showDiscussionLink?: boolean; emptyMessage?: string }) {
  return <section className="space-y-5" aria-label="Public Launch Circle">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <p className="font-mono text-xs leading-5 text-zinc-400">Read public developer updates and validator conversations. Sign in to comment or publish.</p>
      <LaunchCircleAccess callbackUrl="/launch-circle" signedIn={signedIn} />
    </div>
    {unavailable ? <p role="status" className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-400">Launch Circle is temporarily unavailable. Please check back shortly.</p> : <FeedList posts={posts} interactive={false} showSamples={showSamples} showDiscussionLink={showDiscussionLink} emptyMessage={emptyMessage ?? "No public launch updates yet. Developers can publish an update from Launch Circle."} />}
  </section>;
}
