"use client";

import { useState } from "react";
import Link from "next/link";
import { ProfileLink } from "@/components/profile-link";
import { hideCommunityContent, publishComment, publishPost, reportCommunityContent } from "@/app/actions/communityActions";
import { MemberAction } from "@/components/member-action";
import { LaunchCircleAccess } from "@/components/launch-circle-access";
import type { WorkspaceRole } from "@/app/actions/accountActions";

type Author = { id: string; username: string; role: string; xpPoints: number };
export type FeedPost = { id: string; body: string; createdAt: string; publicVisible?: boolean; author: Author; _count: { comments: number }; comments: Array<{ id: string; body: string; author: Author }> };

export function CommunityFeed({ posts, userId, developer, admin, activeRole, dualWorkspace = false, allowNewPosts = true }: { posts: FeedPost[]; userId: string; developer: boolean; admin: boolean; activeRole?: string; dualWorkspace?: boolean; allowNewPosts?: boolean }) {
  const [body, setBody] = useState("");
  const [publicVisible, setPublicVisible] = useState(true);
  const [selectedRole, setSelectedRole] = useState<WorkspaceRole | null>(activeRole === "DEVELOPER" || activeRole === "TESTER" ? activeRole : null);
  const ready = !dualWorkspace || selectedRole !== null;
  const canPost = allowNewPosts && ready && (admin || selectedRole === "DEVELOPER" || !dualWorkspace && developer);
  return <div className="space-y-5">
    <section className="border-b border-white/10 pb-5"><h2 className="text-xl font-semibold">Build in the open. Discuss with purpose.</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Public updates and their comments appear on the landing Launch Circle. Members-only updates remain private. Publishing and commenting do not earn reputation points.</p></section>
    {dualWorkspace ? <LaunchCircleAccess callbackUrl="/community" signedIn chooseWorkspace activeRole={activeRole} selectedRole={selectedRole} onChoose={setSelectedRole} /> : null}
    {canPost ? <section className="rounded-lg border border-white/10 bg-[#171923] p-5"><label className="block font-medium">Share an app update<textarea maxLength={1600} value={body} onChange={(event) => setBody(event.target.value)} className="mt-3 min-h-32 w-full rounded-lg border border-white/10 bg-[#0F1117] p-3 font-normal" placeholder="Product progress, changes, and requested validation." /></label><label className="mt-4 flex min-h-11 items-center gap-3 text-sm text-zinc-300"><input type="checkbox" checked={publicVisible} onChange={(event) => setPublicVisible(event.target.checked)} />Public update: visible on the landing Launch Circle</label><p className="my-3 text-xs leading-6 text-zinc-500">{body.length} / 1,600 characters. Comments inherit the update&apos;s visibility. Do not include credentials or private user data.</p><MemberAction disabled={body.trim().length < 12} action={async () => { const result = await publishPost(body, publicVisible); setBody(""); return result; }}>Publish update</MemberAction></section> : null}
    {!posts.length ? <p className="rounded-lg border border-dashed border-white/10 p-8 text-center text-zinc-400">No updates yet. Developers can publish the first update.</p> : null}
    {posts.map((post) => <Post key={post.id} post={post} userId={userId} admin={admin} canComment={ready} />)}
  </div>;
}

function Post({ post, userId, admin, canComment }: { post: FeedPost; userId: string; admin: boolean; canComment: boolean }) {
  const [comment, setComment] = useState("");
  return <article className="rounded-lg border border-white/10 bg-[#171923] p-5"><header className="flex flex-wrap justify-between gap-3"><div><p className="font-medium"><ProfileLink username={post.author.username} /><span className="ml-2 font-mono text-xs text-emerald-300">{post.publicVisible ? "Public update" : "Members only"}</span></p><time className="mt-1 block font-mono text-xs text-zinc-500" dateTime={post.createdAt}>{post.createdAt.slice(0, 10)}</time></div>{post.author.id === userId || admin ? <MemberAction action={() => hideCommunityContent(post.id, "post")}>Remove update</MemberAction> : null}</header><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-200">{post.body}</p><Report id={post.id} type="post" /><section className="mt-5 border-t border-white/10 pt-4" aria-label="Comments"><p className="font-mono text-xs text-zinc-500">{post._count.comments} visible comments / showing {post.comments.length}</p>{post.comments.map((item) => <div key={item.id} className="mt-3 rounded-lg bg-[#0F1117] p-3"><p className="text-xs font-medium text-zinc-300"><ProfileLink username={item.author.username} /> / {item.author.role === "TESTER" ? "Tester" : item.author.role === "ADMIN" ? "Moderator" : "Developer"}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{item.body}</p><div className="mt-2 flex flex-wrap gap-2"><Report id={item.id} type="comment" />{item.author.id === userId || admin ? <MemberAction action={() => hideCommunityContent(item.id, "comment")}>Remove comment</MemberAction> : null}</div></div>)}{post._count.comments > post.comments.length ? <Link className="mt-3 inline-flex min-h-11 items-center text-sm text-emerald-300" href={`/community/${encodeURIComponent(post.id)}`}>Read full discussion</Link> : null}{canComment ? <><label className="mt-4 block text-sm">Add constructive feedback<textarea maxLength={800} className="mt-2 min-h-20 w-full rounded-lg border border-white/10 bg-[#0F1117] p-3" value={comment} onChange={(event) => setComment(event.target.value)} /></label><div className="mt-3"><MemberAction disabled={comment.trim().length < 2} action={async () => { const result = await publishComment(post.id, comment); setComment(""); return result; }}>Comment</MemberAction></div></> : <p className="mt-4 text-sm text-zinc-400">Choose Developer or Tester above before commenting.</p>}</section></article>;
}

function Report({ id, type }: { id: string; type: "post" | "comment" }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return <div className="mt-2"><button type="button" className="min-h-11 text-xs text-zinc-500 underline" onClick={() => setOpen(!open)}>{open ? "Cancel report" : "Report"}</button>{open ? <div className="space-y-2"><label className="block text-sm">Reason for report<input maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 block w-full rounded-lg border border-white/10 bg-[#0F1117] p-3" /></label><MemberAction disabled={reason.trim().length < 8} action={() => reportCommunityContent(id, type, reason)}>Send report</MemberAction></div> : null}</div>;
}