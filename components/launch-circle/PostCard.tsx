"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowRight, Check, Link2, MessageSquare, Zap } from "lucide-react";
import { ProfileLink } from "@/components/profile-link";
import { MemberAction } from "@/components/member-action";
import { hideCommunityContent, publishComment, reportCommunityContent, toggleHelpful } from "@/app/actions/communityActions";
import { COMMENT_TAGS, appBadgeLabel, commentTag, handleFor, pillClass, postTag, roleLabel, timeAgo, type CircleCommentTag, type CirclePost } from "@/components/launch-circle/types";

function Avatar({ username }: { username: string }) {
  return <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900 font-mono text-sm text-emerald-300">{username.trim().slice(0, 1).toUpperCase() || "S"}</span>;
}

/** Launch Circle pages render dynamically, so the server clock is current; the viewer's clock may differ by seconds. */
function TimeAgo({ iso }: { iso: string }) {
  return <time dateTime={iso} suppressHydrationWarning className="font-mono text-[11px] text-zinc-500">{timeAgo(iso)}</time>;
}

const markdownComponents = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => <a href={href} rel="nofollow ugc noopener noreferrer" target="_blank" className="text-emerald-300 underline underline-offset-2">{children}</a>,
  code: ({ children }: { children?: React.ReactNode }) => <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[12px] text-emerald-300">{children}</code>,
  pre: ({ children }: { children?: React.ReactNode }) => <pre className="my-3 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[12px] text-zinc-200">{children}</pre>,
  p: ({ children }: { children?: React.ReactNode }) => <p className="mt-3 break-words text-sm leading-7 text-zinc-200 first:mt-0">{children}</p>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-7 text-zinc-200">{children}</ul>,
  ol: ({ children }: { children?: React.ReactNode }) => <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-7 text-zinc-200">{children}</ol>,
};

export function PostCard({ post, userId, admin = false, interactive = true, canComment = true, sample = false, showDiscussionLink = true }: { post: CirclePost; userId?: string; admin?: boolean; interactive?: boolean; canComment?: boolean; sample?: boolean; showDiscussionLink?: boolean }) {
  const tag = postTag(post.tag);
  const appBadge = appBadgeLabel(post.campaign, post.buildLabel);
  const discussionHref = `/launch-circle/${encodeURIComponent(post.id)}`;
  const ownContent = Boolean(userId && post.author.id === userId);

  return <article className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
    <header className="flex gap-3">
      <Avatar username={post.author.username} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-zinc-100"><ProfileLink username={post.author.username} /></span>
          <span className="font-mono text-[11px] text-zinc-500">{handleFor(post.author.username)}</span>
          <span className="text-zinc-700" aria-hidden="true">·</span>
          <TimeAgo iso={post.createdAt} />
          {sample ? <span className={`${pillClass} border-zinc-800 bg-zinc-900/60 text-zinc-400`}>Sample</span> : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={`${pillClass} ${tag.className}`}>[{tag.label}]</span>
          {appBadge ? <span className={`${pillClass} border-zinc-800 bg-zinc-900/60 text-zinc-300`}>{appBadge}</span> : null}
          {post.publicVisible === false ? <span className={`${pillClass} border-zinc-800 bg-zinc-900/60 text-zinc-400`}>Cohort testers only</span> : null}
        </div>
      </div>
      {interactive && (ownContent || admin) ? <MemberAction tone="emerald" action={() => hideCommunityContent(post.id, "post")}>Remove</MemberAction> : null}
    </header>

    <div className="mt-4">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{post.body}</ReactMarkdown>
    </div>

    {post.campaign && !sample ? <Link href={`/cohorts/${encodeURIComponent(post.campaign.id)}`} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg border border-emerald-900 bg-emerald-950/30 px-3 py-1.5 font-mono text-[11px] text-emerald-300 transition-colors hover:border-emerald-600">[ View Cohort Drop <ArrowRight className="size-3.5" aria-hidden="true" /> ]</Link> : null}

    <PostFooter post={post} interactive={interactive && !sample} discussionHref={discussionHref} />

    <section className="mt-4 space-y-3 border-t border-zinc-800 pt-4" aria-label="Comments">
      {post.comments.map((item) => {
        const itemTag = commentTag(item.tag);
        return <div key={item.id} className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs font-medium text-zinc-200"><ProfileLink username={item.author.username} /></span>
            <span className="font-mono text-[11px] text-zinc-500">{roleLabel(item.author.role)}</span>
            {item.deviceLabel ? <span className={`${pillClass} border-zinc-800 bg-zinc-950 text-zinc-400`}>{item.deviceLabel}</span> : null}
            <span className={`${pillClass} ${itemTag.className}`}>{itemTag.label}</span>
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{item.body}</p>
          {interactive && !sample ? <div className="mt-2 flex flex-wrap items-center gap-3">
            <Report id={item.id} type="comment" />
            {item.author.id === userId || admin ? <MemberAction tone="emerald" action={() => hideCommunityContent(item.id, "comment")}>Remove comment</MemberAction> : null}
          </div> : null}
        </div>;
      })}
      {showDiscussionLink && post._count.comments > post.comments.length && !sample ? <Link className="inline-flex min-h-9 items-center font-mono text-[11px] text-emerald-300 hover:text-emerald-200" href={discussionHref}>Read full discussion ({post._count.comments} comments)</Link> : null}
      {interactive && !sample ? canComment ? <CommentComposer postId={post.id} /> : <p className="font-mono text-[11px] text-zinc-500">Choose a workspace above before commenting.</p> : null}
      {interactive && !sample ? <Report id={post.id} type="post" /> : null}
    </section>
  </article>;
}

function PostFooter({ post, interactive, discussionHref }: { post: CirclePost; interactive: boolean; discussionHref: string }) {
  const [helpful, setHelpful] = useState(Boolean(post.viewerFoundHelpful));
  const [count, setCount] = useState(post.helpfulCount ?? 0);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const footerButton = "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 font-mono text-[11px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200";

  return <div className="mt-4 flex flex-wrap items-center gap-2">
    <Link href={discussionHref} className={footerButton} aria-label={`${post._count.comments} comments`}><MessageSquare className="size-3.5" aria-hidden="true" />{post._count.comments}</Link>
    <button type="button" disabled={!interactive || pending} aria-pressed={helpful} className={`${footerButton} ${helpful ? "border-emerald-800 text-emerald-300" : ""} disabled:opacity-60`} onClick={() => startTransition(async () => {
      const next = !helpful;
      setHelpful(next);
      setCount((value) => Math.max(0, value + (next ? 1 : -1)));
      try { await toggleHelpful(post.id); router.refresh(); }
      catch { setHelpful(!next); setCount((value) => Math.max(0, value + (next ? -1 : 1))); }
    })}><Zap className="size-3.5" aria-hidden="true" />Helpful {count}</button>
    <button type="button" className={footerButton} onClick={() => {
      const url = `${window.location.origin}${discussionHref}`;
      navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => setCopied(false));
    }}>{copied ? <Check className="size-3.5" aria-hidden="true" /> : <Link2 className="size-3.5" aria-hidden="true" />}{copied ? "Link copied" : "Share"}</button>
  </div>;
}

function CommentComposer({ postId }: { postId: string }) {
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<CircleCommentTag>("GENERAL_FEEDBACK");
  const [device, setDevice] = useState("");
  return <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
    <label className="block font-mono text-[11px] uppercase text-zinc-500" htmlFor={`comment-${postId}`}>Add validator feedback</label>
    <textarea id={`comment-${postId}`} maxLength={800} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Repro steps, device behaviour, or confirmation of the fix." className="mt-2 min-h-20 w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm leading-6 text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none" />
    <div className="mt-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Comment type">
      {COMMENT_TAGS.map((item) => <button key={item.value} type="button" role="radio" aria-checked={tag === item.value} onClick={() => setTag(item.value)} className={`${pillClass} transition-colors ${tag === item.value ? item.className : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-white"}`}>[{item.label}]</button>)}
      <label className="font-mono text-[11px] text-zinc-500">Device
        <input value={device} maxLength={60} onChange={(event) => setDevice(event.target.value)} placeholder="iPhone 15 Pro · iOS 18.2" className="ml-2 w-52 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none" />
      </label>
    </div>
    <div className="mt-3">
      <MemberAction tone="emerald" disabled={body.trim().length < 2} action={async () => {
        const result = await publishComment(postId, body, { tag, deviceLabel: device.trim() || null });
        setBody("");
        return result;
      }}>Post comment</MemberAction>
    </div>
  </div>;
}

function Report({ id, type }: { id: string; type: "post" | "comment" }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return <div><button type="button" className="min-h-9 font-mono text-[11px] text-zinc-500 underline underline-offset-2 hover:text-zinc-300" onClick={() => setOpen(!open)}>{open ? "Cancel report" : "Report"}</button>{open ? <div className="mt-2 space-y-2"><label className="block font-mono text-[11px] uppercase text-zinc-500">Reason for report<input maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 block w-full rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-100" /></label><MemberAction tone="emerald" disabled={reason.trim().length < 8} action={() => reportCommunityContent(id, type, reason)}>Send report</MemberAction></div> : null}</div>;
}
