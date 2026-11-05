"use client";

import { Bug, Send } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { submitSupportRequest } from "@/app/actions/enterpriseActions";
import { buildIssueSupportRequest, issueReportMailto, issueTypes, type IssueType } from "@/lib/support-issues";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";
type Feedback = { kind: "error" | "info"; message: string };

export function SupportIssueForm({ route, status }: { route: string; status: AuthStatus }) {
  const [type, setType] = useState<IssueType>(issueTypes[0]);
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [ticket, setTicket] = useState<{ id: string; emailNotified: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const inputClass = "mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-[#12161F] px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-400";

  function reset() {
    setType(issueTypes[0]);
    setSubject("");
    setDetails("");
    setSteps("");
    setExpected("");
    setFeedback(null);
    setTicket(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const request = buildIssueSupportRequest({
      type, subject, details, steps, expected,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }, route);
    if (!request.ok) {
      setFeedback({ kind: "error", message: request.message });
      return;
    }
    if (status === "unauthenticated") {
      try {
        window.location.href = issueReportMailto(request.data);
        setFeedback({ kind: "info", message: "Send the email draft to complete your report. If no email app opens, contact terimus@seedenv.com." });
      } catch {
        setFeedback({ kind: "error", message: "Could not open an email draft. Please email terimus@seedenv.com." });
      }
      return;
    }
    if (status !== "authenticated") {
      setFeedback({ kind: "error", message: "Account status is still loading. Please try again." });
      return;
    }
    startTransition(async () => {
      try {
        const response = await submitSupportRequest(request.data);
        if (response.ok) setTicket({ id: response.ticketId, emailNotified: response.emailNotified });
        else setFeedback({ kind: "error", message: response.message });
      } catch (error) {
        console.error("SeedEnv issue report failed:", error);
        setFeedback({ kind: "error", message: "Your report was not sent. Try again or email terimus@seedenv.com." });
      }
    });
  }

  return <section aria-labelledby="report-issue-title" className="mt-5 rounded-xl border border-emerald-500/20 bg-[#0F1117] p-4 sm:p-5">
    <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-emerald-400"><Bug className="size-4" aria-hidden="true" /> Website feedback</p>
    <h2 id="report-issue-title" className="mt-2 text-lg font-semibold text-zinc-100">Report an issue</h2>
    <p className="mt-2 text-sm leading-6 text-zinc-400">Tell us about a visual issue, broken feature, or anything else that is not working as expected.</p>
    {ticket ? <div className="mt-5 border-t border-white/10 pt-5" role="status">
      <h3 className="font-semibold text-emerald-300">Issue reported</h3>
      <p className="mt-2 text-sm text-zinc-300">Your report is saved in the support queue.</p>
      <p className="mt-2 break-all font-mono text-xs text-zinc-400">Reference: {ticket.id}</p>
      {!ticket.emailNotified ? <p className="mt-3 text-sm text-amber-300">Email notification is unavailable, but the report is saved. You can also email terimus@seedenv.com.</p> : null}
      <button type="button" onClick={reset} className="mt-4 min-h-11 rounded-lg border border-white/10 px-4 text-sm text-zinc-200 hover:bg-white/5">Report another issue</button>
    </div> : <form onSubmit={submit} className="mt-5 space-y-4">
      <label className="block text-sm text-zinc-300">Type of issue
        <select value={type} onChange={(event) => {
          const next = issueTypes.find((item) => item === event.target.value);
          if (next) setType(next);
        }} className={inputClass}>
          {issueTypes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="block text-sm text-zinc-300">Short title
        <input required minLength={4} maxLength={150} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="e.g. Button is hidden on mobile" className={inputClass} />
      </label>
      <label className="block text-sm text-zinc-300">What happened?
        <textarea required minLength={20} maxLength={2000} rows={4} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Describe the issue. Include a screenshot or recording link if you have one." className={inputClass} />
      </label>
      <label className="block text-sm text-zinc-300">Steps to reproduce <span className="text-zinc-500">(optional)</span>
        <textarea maxLength={1200} rows={3} value={steps} onChange={(event) => setSteps(event.target.value)} placeholder="What did you do before the issue appeared?" className={inputClass} />
      </label>
      <label className="block text-sm text-zinc-300">What did you expect? <span className="text-zinc-500">(optional)</span>
        <textarea maxLength={1200} rows={2} value={expected} onChange={(event) => setExpected(event.target.value)} className={inputClass} />
      </label>
      <p className="break-all font-mono text-xs text-zinc-500">Page: {route} · Query parameters are not included</p>
      <p className="text-xs leading-5 text-zinc-500">Your viewport size is included. Signed-in reports also include account identity and browser/OS. Do not include passwords, API keys, or payment details.</p>
      {status === "unauthenticated" ? <p className="text-xs leading-5 text-zinc-400">Without an account, this opens an email draft that you must send to the team. Signing in reloads the page and clears this draft.</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || status === "loading"} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-50">
          <Send className="size-4" aria-hidden="true" />{pending ? "Sending..." : status === "loading" ? "Checking account..." : status === "authenticated" ? "Send issue report" : "Open email draft"}
        </button>
        {status === "unauthenticated" ? <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(route)}`} className="inline-flex min-h-11 items-center text-sm text-zinc-300 underline underline-offset-4">Sign in to send directly</Link> : null}
      </div>
      {feedback ? <p role={feedback.kind === "error" ? "alert" : "status"} className={`text-sm ${feedback.kind === "error" ? "text-amber-300" : "text-zinc-300"}`}>{feedback.message}</p> : null}
    </form>}
  </section>;
}
