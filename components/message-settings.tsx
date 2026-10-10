"use client";

import Link from "next/link";
import { useState } from "react";
import { blockMember, saveMessageSettings } from "@/app/actions/socialActions";
import { SocialAction } from "@/components/social-controls";

export function MessageSettings({ enabled, blocks }: { enabled: boolean; blocks: Array<{ id: string; username: string }> }) {
  const [requests, setRequests] = useState(enabled);
  return <section className="max-w-3xl space-y-5"><h1 className="text-2xl font-semibold">Message privacy</h1><p className="text-sm text-zinc-400">One shared inbox for your Developer and Tester workspaces. New contacts can send one request only; they cannot continue until you accept.</p><div className="space-y-4 rounded-2xl border border-white/10 bg-[#12161F] p-5"><label className="flex items-center gap-3 text-sm"><input type="checkbox" role="switch" checked={requests} onChange={e => setRequests(e.target.checked)} className="accent-emerald-400" />Allow new message requests</label><p className="text-xs text-zinc-500">Turning this off stops new conversations. Existing requests and accepted conversations remain available. Use Block to stop a particular account.</p><SocialAction action={() => saveMessageSettings(requests)}>Save message settings</SocialAction><Link href="/messages?box=requests" className="inline-flex min-h-11 items-center text-emerald-300">Review requests</Link></div><section className="rounded-2xl border border-white/10 p-5"><h2 className="font-semibold">Blocked members</h2>{!blocks.length ? <p className="mt-3 text-sm text-zinc-500">No blocked members.</p> : null}{blocks.map(member => <div key={member.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3"><span className="break-words">@{member.username}</span><SocialAction action={() => blockMember(member.id, false)}>Unblock</SocialAction></div>)}</section></section>;
}
