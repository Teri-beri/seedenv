"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bold, Code2, Loader2 } from "lucide-react";
import { activateAccountWorkspace } from "@/app/actions/accountActions";
import { publishPost } from "@/app/actions/communityActions";
import { POST_TAGS, PLATFORM_LABELS, pillClass, type CircleCampaign, type CirclePostTag } from "@/components/launch-circle/types";

const MAX_BODY = 1600;

export function ValidatorNotice({ canSwitchToDeveloper = false }: { canSwitchToDeveloper?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const { update } = useSession();
  const router = useRouter();
  return <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 font-mono text-xs text-zinc-400">
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
      <span>Validator Mode: Review developer releases and comment with repro logs below.</span>
    </div>
    {canSwitchToDeveloper ? <button type="button" disabled={pending} className="min-h-9 rounded-md border border-zinc-800 px-3 text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-50" onClick={() => startTransition(async () => {
      setMessage("");
      const result = await activateAccountWorkspace("DEVELOPER");
      if (!result.ok) { setMessage(result.message ?? "Workspace could not be switched."); return; }
      await update();
      router.refresh();
    })}>{pending ? "Switching..." : "Switch to developer workspace"}</button> : <span className="text-zinc-500">Posting reserved for verified developers</span>}
    {message ? <span role="alert" className="w-full text-amber-300">{message}</span> : null}
  </div>;
}

export function FeedComposer({ canPost, username, apps = [], canSwitchToDeveloper = false }: { canPost: boolean; username: string; apps?: CircleCampaign[]; canSwitchToDeveloper?: boolean }) {
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<CirclePostTag>("CHANGELOG");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [buildLabel, setBuildLabel] = useState("");
  const [publicVisible, setPublicVisible] = useState(true);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  if (!canPost) return <ValidatorNotice canSwitchToDeveloper={canSwitchToDeveloper} />;

  const remaining = MAX_BODY - body.length;
  const ready = body.trim().length >= 12 && remaining >= 0;

  function wrap(token: string) {
    const field = textarea.current;
    if (!field) return;
    const { selectionStart: start, selectionEnd: end } = field;
    const selected = body.slice(start, end) || (token === "`" ? "code" : "text");
    const next = `${body.slice(0, start)}${token}${selected}${token}${body.slice(end)}`.slice(0, MAX_BODY);
    setBody(next);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + token.length, start + token.length + selected.length);
    });
  }

  function submit() {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await publishPost(body, publicVisible, { tag, campaignId, buildLabel: buildLabel.trim() || null });
        setBody("");
        setBuildLabel("");
        setMessage(result);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "The update could not be published. Please try again.");
      }
    });
  }

  const toolButton = "grid size-9 place-items-center rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:border-emerald-500/40 hover:text-emerald-300";
  const segment = (active: boolean) => `min-h-9 rounded-md px-3 font-mono text-[11px] transition-colors ${active ? "bg-emerald-500/15 text-emerald-300" : "text-zinc-400 hover:text-white"}`;

  return <section className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4" aria-label="Publish an app update">
    <div className="flex gap-3">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900 font-mono text-sm text-emerald-300">{username.trim().slice(0, 1).toUpperCase() || "D"}</span>
      <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor="launch-circle-body">Share an app update</label>
        <textarea id="launch-circle-body" ref={textarea} maxLength={MAX_BODY} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Shipped build 1.0.4 to TestFlight. What changed, and what needs validation?" className="min-h-28 w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm leading-6 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/50 focus:outline-none" />

        {apps.length ? <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase text-zinc-500">App</span>
          {apps.map((app) => {
            const active = campaignId === app.id;
            return <button key={app.id} type="button" aria-pressed={active} onClick={() => setCampaignId(active ? null : app.id)} className={`${pillClass} transition-colors ${active ? "border-emerald-700 bg-emerald-950/40 text-emerald-300" : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-white"}`}>
              {app.title} <span className="text-zinc-500">[{PLATFORM_LABELS[app.platform] ?? app.platform}]</span>
            </button>;
          })}
          {campaignId ? <label className="font-mono text-[11px] text-zinc-500">Build
            <input value={buildLabel} maxLength={40} onChange={(event) => setBuildLabel(event.target.value)} placeholder="1.0.4" className="ml-2 w-24 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none" />
          </label> : null}
        </div> : null}

        <div className="mt-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Update type">
          {POST_TAGS.map((item) => <button key={item.value} type="button" role="radio" aria-checked={tag === item.value} onClick={() => setTag(item.value)} className={`${pillClass} transition-colors ${tag === item.value ? item.className : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-white"}`}>[{item.label}]</button>)}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3">
          <div className="flex items-center gap-2">
            <button type="button" className={toolButton} onClick={() => wrap("**")} aria-label="Bold selection"><Bold className="size-4" aria-hidden="true" /></button>
            <button type="button" className={toolButton} onClick={() => wrap("`")} aria-label="Format as code"><Code2 className="size-4" aria-hidden="true" /></button>
            <div role="radiogroup" aria-label="Update visibility" className="inline-flex rounded-lg border border-zinc-800 p-0.5">
              <button type="button" role="radio" aria-checked={publicVisible} className={segment(publicVisible)} onClick={() => setPublicVisible(true)}>Public</button>
              <button type="button" role="radio" aria-checked={!publicVisible} className={segment(!publicVisible)} onClick={() => setPublicVisible(false)}>Cohort Testers Only</button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`font-mono text-[11px] ${remaining < 100 ? "text-amber-300" : "text-zinc-500"}`}>{body.length} / {MAX_BODY}</span>
            <button type="button" disabled={!ready || pending} onClick={submit} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-black transition-colors hover:bg-emerald-400 disabled:opacity-50">
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}{pending ? "Publishing" : "Publish update"}
            </button>
          </div>
        </div>
        <p className="mt-3 font-mono text-[11px] leading-5 text-zinc-500">Markdown supported. Comments inherit the update&apos;s visibility. Never include credentials or private user data.</p>
        {message ? <p role="status" className="mt-2 text-sm text-zinc-300">{message}</p> : null}
      </div>
    </div>
  </section>;
}
