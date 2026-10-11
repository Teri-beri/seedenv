"use client";

import { FeedComposer } from "@/components/launch-circle/FeedComposer";
import { FeedList } from "@/components/launch-circle/FeedList";
import type { CircleCampaign, CirclePost } from "@/components/launch-circle/types";

export function CommunityFeed({ posts, userId, username = "SeedEnv Member", developer, admin, apps = [], allowNewPosts = true, showSamples = true, canSwitchToDeveloper = false, showDiscussionLink = true, emptyMessage }: { posts: CirclePost[]; userId: string; username?: string; developer: boolean; admin: boolean; apps?: CircleCampaign[]; allowNewPosts?: boolean; showSamples?: boolean; canSwitchToDeveloper?: boolean; showDiscussionLink?: boolean; emptyMessage?: string }) {
  return <div className="space-y-5">
    {allowNewPosts ? <FeedComposer canPost={developer || admin} username={username} apps={apps} canSwitchToDeveloper={canSwitchToDeveloper} /> : null}
    <FeedList posts={posts} userId={userId} admin={admin} emptyMessage={emptyMessage} showSamples={showSamples} showDiscussionLink={showDiscussionLink} />
  </div>;
}
