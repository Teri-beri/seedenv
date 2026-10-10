"use client";

import { useState } from "react";
import { reportMessage } from "@/app/actions/socialActions";
import { SocialAction } from "@/components/social-controls";

export function MessageReport({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return <div className="mt-6 border-t border-white/10 pt-3"><button className="min-h-11 text-xs text-zinc-500 underline" type="button" onClick={() => setOpen(!open)}>{open ? "Cancel report" : "Report conversation"}</button>{open ? <div className="space-y-3"><label className="block text-sm">Reason<textarea className="mt-2 w-full rounded-lg border border-white/10 bg-[#0A0D12] p-3" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label><p className="text-xs text-zinc-500">A recent conversation excerpt will be shared with SeedEnv support for review.</p><SocialAction disabled={reason.trim().length < 8} action={() => reportMessage(conversationId, reason)}>Send report</SocialAction></div> : null}</div>;
}
