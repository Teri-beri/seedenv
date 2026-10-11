"use client";

import { MessageCircle, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export type CohortContact = {
  id: string;
  username: string;
  avatarUrl: string | null;
  campaignTitle: string;
};

export function CohortContactPicker({ contacts, compact = false }: { contacts: CohortContact[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!contacts.length) {
    return (
      <Link
        href="/applications"
        className={compact
          ? "inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-500 px-3 font-mono text-xs font-semibold text-black transition-colors hover:bg-emerald-400"
          : "mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 font-mono text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"}
      >
        <MessageCircle className="size-4" /> {compact ? "New Conversation" : "Review Cohort Testers"}
      </Link>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact
          ? "inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-500 px-3 font-mono text-xs font-semibold text-black transition-colors hover:bg-emerald-400"
          : "mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 font-mono text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/15"}
      >
        <MessageCircle className="size-4" /> {compact ? "New Conversation" : "Message Cohort Tester"}
      </button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-labelledby="cohort-contact-title" className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <button type="button" aria-label="Close contact picker" className="fixed inset-0 cursor-default" onClick={() => setOpen(false)} />
          <section className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0b0d12] p-5 text-left shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="cohort-contact-title" className="text-base font-semibold text-zinc-100">Start a cohort conversation</h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">Choose an accepted cohort contact. Message-request and block rules still apply.</p>
              </div>
              <button type="button" aria-label="Close contact picker" onClick={() => setOpen(false)} className="rounded-lg border border-zinc-800 p-2 text-zinc-400 hover:text-white"><X className="size-4" /></button>
            </div>
            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
              {contacts.map((contact) => (
                <Link key={`${contact.id}:${contact.campaignTitle}`} href={`/messages?to=${encodeURIComponent(contact.id)}`} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-zinc-200">@{contact.username}</span>
                    <span className="mt-1 block truncate font-mono text-[11px] text-zinc-500">{contact.campaignTitle}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-emerald-400">Message →</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
