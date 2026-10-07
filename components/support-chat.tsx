"use client";

import { ArrowUp, LifeBuoy, Sparkles } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

type ChatMessage = { role: "user" | "assistant"; text: string };
export type SupportEscalation = { category: string; subject: string; summary: string };

const starters = ["How does pricing work?", "How do testers get paid?", "Why was I charged?", "How do I get 12 Play testers?"];

// Turns in-app paths like /console?view=billing into links; everything else stays plain text.
function linkify(text: string): ReactNode[] {
  return text.split(/(\s|^)(\/[a-z][\w\-/]*(?:\?[\w=&-]+)?)/gi).map((part, index) => /^\/[a-z]/i.test(part) ? <Link key={index} href={part.replace(/[.,)]+$/, "")} className="text-emerald-300 underline underline-offset-2">{part}</Link> : <Fragment key={index}>{part}</Fragment>);
}

export function SupportChat({ route, signedIn, onEscalate }: { route: string; signedIn: boolean; onEscalate: (draft: SupportEscalation) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [escalation, setEscalation] = useState<SupportEscalation | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const next = [...messages, { role: "user" as const, text: question.slice(0, 2000) }].slice(-20);
    setMessages(next);
    setDraft("");
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/support/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next, route }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setError(data.error || "The assistant couldn't answer just now.");
      else {
        setMessages((current) => [...current, { role: "assistant", text: String(data.reply).slice(0, 2000) }]);
        if (data.escalation) setEscalation(data.escalation);
      }
    } catch {
      setError("Network error. Try again, or contact a human.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  return <div className="mt-6 flex min-h-[420px] flex-col">
    <div className="flex-1 space-y-4" aria-live="polite">
      {messages.length === 0 ? <div className="rounded-lg border border-zinc-800 bg-[#0F1117] p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-white"><Sparkles className="size-4 text-emerald-400" />Ask about pricing, cohorts, payouts or your account.</p>
        <p className="mt-2 text-xs leading-5 text-zinc-500">{signedIn ? "Answers can use your SeedEnv account data (read-only)." : "Sign in for answers about your own account."} AI answers can be wrong; a human can review anything important. Don&apos;t share passwords or card numbers.</p>
        <div className="mt-4 flex flex-wrap gap-2">{starters.map((item) => <button key={item} type="button" onClick={() => void send(item)} className="min-h-9 rounded-full border border-zinc-800 px-3 text-xs text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300">{item}</button>)}</div>
      </div> : null}
      {messages.map((message, index) => <div key={index} className={message.role === "user" ? "ml-10 rounded-lg bg-zinc-800/70 px-4 py-3 text-sm text-white" : "mr-6 whitespace-pre-wrap text-sm leading-6 text-zinc-300"}>{message.role === "assistant" ? linkify(message.text) : message.text}</div>)}
      {busy ? <p className="font-mono text-xs text-zinc-500">Thinking…</p> : null}
      {error ? <p role="alert" className="text-sm text-amber-300">{error}</p> : null}
      {escalation ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
        <p className="text-sm font-medium text-emerald-300">Ticket draft ready</p>
        <p className="mt-1 text-xs text-zinc-400">{escalation.subject}</p>
        <button type="button" onClick={() => onEscalate(escalation)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-zinc-100 px-3 text-sm font-medium text-zinc-950"><LifeBuoy className="size-4" />Review &amp; send to a human</button>
      </div> : null}
      <div ref={endRef} />
    </div>
    <form onSubmit={onSubmit} className="sticky bottom-0 mt-4 flex items-end gap-2 bg-[#12161F] pt-2">
      <label className="sr-only" htmlFor="support-chat-input">Ask the SeedEnv assistant</label>
      <textarea id="support-chat-input" rows={2} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(draft); } }} placeholder="Ask a question…" className="min-h-11 flex-1 resize-none rounded-lg border border-white/10 bg-[#0F1117] px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" />
      <button type="submit" disabled={busy || !draft.trim()} aria-label="Send question" className="grid size-11 place-items-center rounded-lg bg-emerald-500 text-zinc-950 disabled:opacity-40"><ArrowUp className="size-5" /></button>
    </form>
  </div>;
}
