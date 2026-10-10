"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { blockMember, followMember, reviewRequest, sendMessage, type SocialResult } from "@/app/actions/socialActions";

export const socialButton = "inline-flex min-h-11 items-center justify-center rounded-lg border border-white/10 bg-[#171923] px-4 py-2 text-sm font-medium text-zinc-200 hover:border-emerald-400/40 focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:opacity-50";

export function BlockMemberButton({ memberId }: { memberId: string }) {
  return <SocialAction action={() => blockMember(memberId, true)}>Block member</SocialAction>;
}

export function RequestReviewButtons({ conversationId }: { conversationId: string }) {
  return <div className="mt-4 flex flex-wrap gap-3"><SocialAction action={() => reviewRequest(conversationId, "ACCEPTED")}>Accept request</SocialAction><SocialAction action={() => reviewRequest(conversationId, "DECLINED")}>Decline</SocialAction></div>;
}

export function SocialAction({ action, children, disabled = false }: { action: () => Promise<SocialResult>; children: React.ReactNode; disabled?: boolean }) {
  const [result, setResult] = useState<SocialResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <div><button type="button" disabled={pending || disabled} className={socialButton} onClick={() => startTransition(async () => {
    setResult(null);
    try {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) router.refresh();
    } catch (error) {
      console.error("SeedEnv social request transport failed:", error);
      setResult({ ok: false, message: "Could not confirm this action. Refresh to check its status before trying again." });
    }
  })}>{pending ? "Working..." : children}</button>{result ? <p role={result.ok ? "status" : "alert"} className={`mt-2 text-sm ${result.ok ? "text-emerald-300" : "text-rose-300"}`}>{result.message}</p> : null}</div>;
}

export function FollowControls({ targetId, developer, signedIn, own, following, emailUpdates, blocked = false }: { targetId: string; developer: boolean; signedIn: boolean; own: boolean; following: boolean; emailUpdates: boolean; blocked?: boolean }) {
  const [emails, setEmails] = useState(emailUpdates);
  if (own) return <Link href="/account?tab=profile" className={socialButton}>Edit profile</Link>;
  if (!signedIn) return <Link href="/auth/signin" className={socialButton}>Sign in to follow or message</Link>;
  if (blocked) return <p className="text-sm text-zinc-400">Connections are unavailable between these accounts. Manage blocks in Messages settings.</p>;
  return <div className="space-y-3">
    {developer ? <label className="flex items-start gap-2 text-sm text-zinc-400"><input className="mt-1 accent-emerald-400" type="checkbox" checked={emails} onChange={e => setEmails(e.target.checked)} />Email me about new cohorts and Launch Circle posts. Requires a verified email; turn off anytime in Connections.</label> : <p className="text-xs text-zinc-500">Follow this tester in-app. No email updates are sent for tester follows.</p>}
    <div className="flex flex-wrap gap-3">
      <SocialAction action={() => followMember(targetId, !following, emails)}>{following ? "Unfollow" : "Follow"}</SocialAction>
      {following && developer ? <SocialAction action={() => followMember(targetId, true, emails)}>Save email preference</SocialAction> : null}
      <Link href={`/messages?to=${encodeURIComponent(targetId)}`} className={socialButton}>Message</Link>
    </div>
  </div>;
}

export function MessageComposer({ recipientId, request = false }: { recipientId: string; request?: boolean }) {
  const [body, setBody] = useState("");
  const [result, setResult] = useState<SocialResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <form className="space-y-3" onSubmit={e => {
    e.preventDefault();
    startTransition(async () => {
      setResult(null);
      try {
        const outcome = await sendMessage(recipientId, body);
        setResult(outcome);
        if (outcome.ok) {
          setBody("");
          router.replace(`/messages?thread=${outcome.conversationId}`);
          router.refresh();
        }
      } catch (error) {
        console.error("SeedEnv message transport failed:", error);
        setResult({ ok: false, message: "Could not confirm delivery. Refresh the conversation before sending again." });
      }
    });
  }}><label className="block text-sm text-zinc-300">{request ? "Send one message request" : "Write a message"}<textarea required maxLength={2000} value={body} onChange={e => setBody(e.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-[#0A0D12] p-3 outline-none focus:border-emerald-400/50" placeholder={request ? "Introduce yourself and explain why you are reaching out." : "Keep the conversation constructive."} /></label>
    {request ? <p className="text-xs text-zinc-500">You can send one message. Further messages unlock only after the recipient accepts. Private messages do not change cohort terms or guarantee acceptance.</p> : null}
    <button disabled={pending || !body.trim()} className={`${socialButton} !bg-emerald-500 !text-zinc-950`}>{pending ? "Sending..." : request ? "Send request" : "Send message"}</button>
    {result ? <p role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "text-emerald-300" : "text-rose-300"}`}>{result.message}</p> : null}
  </form>;
}
