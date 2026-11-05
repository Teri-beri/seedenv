"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { Bug, Send, X } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { submitSupportRequest } from "@/app/actions/enterpriseActions";
import { SupportChat, type SupportEscalation } from "@/components/support-chat";
import { SupportIssueForm } from "@/components/support-issue-form";
import { SupportTrigger } from "@/components/SupportTrigger";
import { supportCategories, type SupportRequest } from "@/lib/enterprise-rules";

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"));
}

export function SupportModal({ aiEnabled = false }: { aiEnabled?: boolean }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<SupportRequest["category"]>("General Support");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [emailNotified, setEmailNotified] = useState(false);
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"ai" | "human" | "issue">(aiEnabled ? "ai" : "human");
  function escalate(draft: SupportEscalation) {
    setCategory((supportCategories as readonly string[]).includes(draft.category) ? draft.category as SupportRequest["category"] : "General Support");
    setSubject(draft.subject.slice(0, 150));
    setMessage(draft.summary.slice(0, 5000));
    setTicketId("");
    setResult("");
    setTab("human");
  }
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey || event.repeat || event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      setOpen((current) => !current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  const inputClass = "mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-[#0F1117] px-3 py-2 text-white outline-none focus:border-emerald-400";
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><SupportTrigger /></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/65" /><Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l border-white/10 bg-[#12161F] p-6 text-white focus:outline-none sm:p-8">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pr-12"><Dialog.Title className="text-xl font-semibold">Help &amp; Support</Dialog.Title><span className="hidden font-mono text-[11px] text-zinc-500 sm:inline">[Press <kbd className="rounded border border-zinc-700 bg-zinc-800/80 px-1 text-zinc-300">?</kbd> to toggle]</span></div>
      <Dialog.Description className="mt-3 text-sm leading-6 text-zinc-400">{aiEnabled ? "Get instant answers from the SeedEnv assistant, or reach the team for billing, cohort disputes and technical reports." : "Billing questions, cohort disputes, and technical reports. Account identity, current route, and browser/OS context accompany signed-in requests. Do not include passwords, API keys, or payment credentials."}</Dialog.Description>
      <Dialog.Close asChild><button type="button" aria-label="Close support drawer" className="absolute right-4 top-4 grid size-11 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800"><X className="size-5" /></button></Dialog.Close>
      <Tabs.Root value={tab} onValueChange={(value) => {
        if (value === "ai" || value === "human" || value === "issue") setTab(value);
      }} className="mt-5">
        <Tabs.List aria-label="Support options" className={`grid ${aiEnabled ? "grid-cols-3" : "grid-cols-2"} rounded-lg border border-zinc-800 bg-[#0F1117] p-1`}>
          {aiEnabled ? <Tabs.Trigger value="ai" className="min-h-11 rounded-md px-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 data-[state=active]:bg-zinc-800 data-[state=active]:text-white sm:text-sm">Ask AI</Tabs.Trigger> : null}
          <Tabs.Trigger value="human" className="min-h-11 rounded-md px-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 data-[state=active]:bg-zinc-800 data-[state=active]:text-white sm:text-sm">Contact a human</Tabs.Trigger>
          <Tabs.Trigger value="issue" className="flex min-h-11 items-center justify-center gap-1 rounded-md px-1 text-xs font-medium text-zinc-400 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 data-[state=active]:bg-zinc-800 data-[state=active]:text-white sm:text-sm"><Bug className="hidden size-4 sm:block" aria-hidden="true" />Report issue</Tabs.Trigger>
        </Tabs.List>
        {aiEnabled ? <Tabs.Content value="ai" forceMount className="data-[state=inactive]:hidden"><SupportChat route={pathname} signedIn={status === "authenticated"} onEscalate={escalate} /></Tabs.Content> : null}
        <Tabs.Content value="human" forceMount className="data-[state=inactive]:hidden">
          {aiEnabled ? <p className="mt-5 text-xs leading-5 text-zinc-500">Account identity, current route, and browser/OS context accompany signed-in requests. Do not include passwords, API keys, or payment credentials.</p> : null}
          {ticketId ? <div className="mt-8 border-y border-white/10 py-6" role="status"><h3 className="text-lg font-semibold text-emerald-300">Request received</h3><p className="mt-3 break-all font-mono text-sm">{ticketId}</p><p className="mt-3 text-sm text-zinc-400">{emailNotified ? "The support request was also sent to terimus@seedenv.com." : "Your request is saved in the support queue. Email delivery is currently unavailable; you can also contact terimus@seedenv.com directly."}</p><button type="button" className="mt-5 min-h-11 rounded-lg border border-white/10 px-4 text-sm" onClick={() => { setTicketId(""); setSubject(""); setMessage(""); setResult(""); setEmailNotified(false); }}>New request</button></div> : status === "authenticated" ? (
            <form className="mt-7 space-y-5" onSubmit={(event) => { event.preventDefault(); setResult(""); startTransition(async () => { try { const response = await submitSupportRequest({ category, subject, message, route: pathname }); if (response.ok) { setEmailNotified(response.emailNotified); setTicketId(response.ticketId); } else setResult(response.message); } catch { setResult("Request not sent. Try again or contact terimus@seedenv.com."); } }); }}>
              <label className="block text-sm text-zinc-300">Category<select value={category} onChange={(event) => setCategory(event.target.value as SupportRequest["category"])} className={inputClass}>{supportCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="block text-sm text-zinc-300">Subject<input required minLength={4} maxLength={150} value={subject} onChange={(event) => setSubject(event.target.value)} className={inputClass} /></label>
              <label className="block text-sm text-zinc-300">Details<textarea required minLength={20} maxLength={5000} rows={7} value={message} onChange={(event) => setMessage(event.target.value)} className={inputClass} /></label>
              <p className="break-all font-mono text-xs text-zinc-500">Route: {pathname}</p>
              <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-50"><Send className="size-4" />{pending ? "Submitting..." : "Submit Request"}</button>
              {result ? <p role="alert" className="text-sm text-amber-300">{result}</p> : null}
            </form>
          ) : <div className="mt-7 space-y-4"><Link href={`/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950">{status === "loading" ? "Account access" : "Sign in for Support"}</Link>{subject ? <a href={`mailto:terimus@seedenv.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${message}\n\nCategory: ${category}\nPage: ${pathname}`)}`} className="ml-3 inline-flex min-h-11 items-center rounded-lg border border-white/10 px-4 text-sm text-zinc-200">Email this request</a> : null}<p className="text-sm leading-6 text-zinc-400">For access issues or security reports, email <a href="mailto:terimus@seedenv.com" className="text-emerald-300 underline">terimus@seedenv.com</a>.</p></div>}
        </Tabs.Content>
        <Tabs.Content value="issue" forceMount className="data-[state=inactive]:hidden"><SupportIssueForm route={pathname} status={status} /></Tabs.Content>
      </Tabs.Root>
      <nav aria-label="Refunds and work policies" className="mt-5 rounded-xl border border-white/10 bg-[#0F1117] p-4">
        <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Refunds &amp; policies</p>
        <ul className="mt-2 grid gap-1 text-sm">
          {[
            ["/console?view=billing", "Request a developer refund", "Billing → Receipts → Refund"],
            ["/terms#refund-policy", "Developer refund policy", "What qualifies and how refunds are paid"],
            ["/terms#tester-work-standards", "Tester work standards", "What counts as adequate work, appeals, payouts"],
          ].map(([href, label, hint]) => <li key={href}><Link href={href} onClick={() => setOpen(false)} className="flex min-h-11 flex-col justify-center rounded-lg px-2 py-1.5 transition-colors hover:bg-white/[0.04]"><span className="text-zinc-100">{label}</span><span className="text-xs text-zinc-500">{hint}</span></Link></li>)}
          {session?.user?.role === "ADMIN" ? <li><Link href="/admin/refunds" onClick={() => setOpen(false)} className="flex min-h-11 items-center rounded-lg px-2 text-amber-300 transition-colors hover:bg-white/[0.04]">Refund queue &amp; payout repair</Link></li> : null}
        </ul>
      </nav>
      {session?.user?.role === "ADMIN" ? <Link href="/admin/support" onClick={() => setOpen(false)} className="mt-4 inline-flex min-h-11 items-center text-sm text-emerald-300">Open Support Queue</Link> : null}
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}