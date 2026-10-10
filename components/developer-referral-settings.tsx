"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyDeveloperReferral, generateDeveloperReferralCode } from "@/app/actions/developerReferralActions";

export function DeveloperReferralSettings({ shareCode, received, qualifiedCount, credits, initialCode, feeCredits = [] }: {
  shareCode: string | null; received: boolean; qualifiedCount: number; initialCode?: string;
  credits: Array<{ code: string; state: string }>;
  feeCredits?: Array<{ id: string; status: string; expiresAt: string | null; reserved: boolean }>;
}) {
  const [code, setCode] = useState(initialCode || "");
  const [generated, setGenerated] = useState(shareCode);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <section className="rounded-xl border border-emerald-500/30 p-5">
    <h2 className="font-semibold">Developer referrals</h2>
    <p className="mt-2 text-sm text-zinc-400">Share your code with a new developer before their first funded cohort. Your link is permanent. Their first cohort receives a one-time full platform-fee waiver. You receive a pending 50% fee credit only when at least $50 is actually reserved for their testers; a balance top-up alone does not qualify. It vests when at least half the cohort has genuinely started or submitted testing, expires 90 days after vesting, and is applied automatically to a later cohort. Two new credits give 75% off, not 100%; unused extras stay on your account. Cancellation, refunds or disputes revoke the source credit, and savings already used are recovered from your balance. Tester rewards stay intact. No self-referrals, circular referrals, duplicate accounts or fabricated work.</p>
    <p className="mt-2 text-xs text-zinc-400">Already-issued legacy codes retain their original non-expiring, up-to-100% stacking terms. New referral credits follow the policy above.</p>
    {generated ? <div className="mt-3"><p className="font-mono">{generated}</p><a className="break-all text-sm underline" href={`/auth/signin?role=DEVELOPER&devref=${generated}`}>{`/auth/signin?role=DEVELOPER&devref=${generated}`}</a><button className="ml-3 underline" type="button" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/auth/signin?role=DEVELOPER&devref=${generated}`).then(() => setMessage("Referral link copied.")).catch(() => setMessage("Could not copy. Select the link above to copy it manually.")); }}>Copy invite link</button></div> : <button disabled={pending} className="mt-3 underline" onClick={() => startTransition(async () => { try { setGenerated(await generateDeveloperReferralCode()); router.refresh(); } catch { setMessage("Could not generate your referral code. Try again."); } })}>Create my referral code</button>}
    <p className="mt-3 text-sm">{qualifiedCount} qualified referral{qualifiedCount === 1 ? "" : "s"}</p>
    {!received ? <form className="mt-4 flex gap-2" onSubmit={(event) => {
      event.preventDefault();
      startTransition(async () => {
        const result = await applyDeveloperReferral(code);
        if (!result.ok) { setMessage(result.error); return; }
        setMessage("Referral permanently linked. Your inviter's credit will unlock only after qualifying funded testing activity.");
        router.refresh();
      });
    }}><input aria-label="Developer referral code" maxLength={40} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Enter an inviter's DEV_ code before your first paid cohort" className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 p-3" /><button disabled={pending || !code.trim()} className="rounded border border-emerald-500 p-3">Link referral</button></form> : <p className="mt-3 text-sm text-emerald-300">Your inviter is linked to your account.</p>}
    <ul className="mt-4 space-y-2">{credits.map((credit) => <li className="break-all text-sm" key={credit.code}>{credit.code} - 50% off platform fees - {credit.state} - never expires</li>)}</ul>
    <ul className="mt-4 space-y-2" aria-label="New referral fee credits">{feeCredits.map(credit => {
      const expired = credit.status === "VESTED" && !credit.reserved && credit.expiresAt && new Date(credit.expiresAt) <= new Date();
      return <li key={credit.id} className="rounded-lg border border-zinc-800 p-3 text-sm">50% platform-fee credit - {expired ? "EXPIRED" : credit.reserved && credit.status === "VESTED" ? "Reserved for checkout" : credit.status}{credit.expiresAt ? ` - expires ${credit.expiresAt.slice(0, 10)} UTC` : credit.status === "PENDING" ? " - awaiting qualifying activity" : ""}</li>;
    })}</ul>
    {message ? <p className="mt-3 text-sm text-amber-200" role="status">{message}</p> : null}
  </section>;
}
