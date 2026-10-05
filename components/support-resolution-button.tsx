"use client";

import { CheckCircle2 } from "lucide-react";
import { useState, useTransition } from "react";
import { resolveSupportTicket } from "@/app/actions/enterpriseActions";

export function SupportResolutionButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  return <div><button type="button" disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/10 px-3 text-sm disabled:opacity-50" onClick={() => startTransition(async () => { const result = await resolveSupportTicket(id); setMessage(result.ok ? "Resolved" : result.message); })}><CheckCircle2 className="size-4" />{pending ? "Updating..." : "Resolve request"}</button>{message ? <p role="status" className="mt-2 text-xs text-zinc-400">{message}</p> : null}</div>;
}