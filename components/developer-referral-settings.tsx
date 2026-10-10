"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyDeveloperReferral, generateDeveloperReferralCode } from "@/app/actions/developerReferralActions";

export function DeveloperReferralSettings({ shareCode, received, qualifiedCount, credits, initialCode }: {
  shareCode: string | null; received: boolean; qualifiedCount: number; initialCode?: string;
  credits: Array<{ code: string; state: string }>;
}) {
  const [code, setCode] = useState(initialCode || "");
  const [generated, setGenerated] = useState(shareCode);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <section className="rounded-xl border border-emerald-500/30 p-5">
    <h2 className="font-semibold">Developer referrals</h2>
    <p className="mt-2 text-sm text-zinc-400">Share your code with a new developer. They receive one account-bound 50% platform-fee credit. When they use it and actually fund a cohort, you receive a matching 50% credit for each qualifying developer. Credits never expire; stack two, or combine one with BUILD50, for a maximum 100% platform-fee discount. Tester rewards are always fully funded. No self-referrals, reciprocal referrals, duplicate accounts, or rewards for signup alone.</p>
    {generated ? <div className="mt-3"><p className="font-mono">{generated}</p><a className="break-all text-sm underline" href={`/auth/signin?role=DEVELOPER&devref=${generated}`}>{`/auth/signin?role=DEVELOPER&devref=${generated}`}</a><button className="ml-3 underline" type="button" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/auth/signin?role=DEVELOPER&devref=${generated}`).then(() => setMessage("Referral link copied.")).catch(() => setMessage("Could not copy. Select the link above to copy it manually.")); }}>Copy invite link</button></div> : <button disabled={pending} className="mt-3 underline" onClick={() => startTransition(async () => { try { setGenerated(await generateDeveloperReferralCode()); router.refresh(); } catch { setMessage("Could not generate your referral code. Try again."); } })}>Create my referral code</button>}
    <p className="mt-3 text-sm">{qualifiedCount} qualified referral{qualifiedCount === 1 ? "" : "s"}</p>
    {!received ? <form className="mt-4 flex gap-2" onSubmit={(event) => {
      event.preventDefault();
      startTransition(async () => {
        const result = await applyDeveloperReferral(code);
        if (!result.ok) { setMessage(result.error); return; }
        setMessage("Referral linked. Your non-expiring 50% credit is now available in Budget.");
        router.refresh();
      });
    }}><input aria-label="Developer referral code" maxLength={40} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="Enter an inviter's DEV_ code before your first paid cohort" className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-950 p-3" /><button disabled={pending || !code.trim()} className="rounded border border-emerald-500 p-3">Link referral</button></form> : <p className="mt-3 text-sm text-emerald-300">Your inviter is linked to your account.</p>}
    <ul className="mt-4 space-y-2">{credits.map((credit) => <li className="break-all text-sm" key={credit.code}>{credit.code} - 50% off platform fees - {credit.state} - never expires</li>)}</ul>
    {message ? <p className="mt-3 text-sm text-amber-200" role="status">{message}</p> : null}
  </section>;
}
