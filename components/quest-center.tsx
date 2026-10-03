"use client";

import { useState } from "react";
import { attachReferral, claimDailyQuest, completeAcademyQuest, redeemQuestItem, selectQuestTheme } from "@/app/actions/questActions";
import { academyQuests, exchangeItems } from "@/lib/quest-rules";
import { MemberAction } from "@/components/member-action";

export function QuestCenter({ balance, lifetimeXp, passes, code, owned, completed, dailyClaimed, theme, referralStatus }: { balance: number; lifetimeXp: number; passes: number; code: string; owned: string[]; completed: string[]; dailyClaimed: boolean; theme: string; referralStatus: string }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [referral, setReferral] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [sharePending, setSharePending] = useState(false);
  async function share() {
    setSharePending(true);
    try {
      const url = new URL(`/auth/signin?ref=${encodeURIComponent(code)}`, window.location.origin).toString();
      if (navigator.share) await navigator.share({ title: "Join SeedEnv", text: `Explore apps and contribute useful testing feedback. My invite code is ${code}.`, url });
      else { await navigator.clipboard.writeText(url); setShareMessage("Invite link copied."); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setShareMessage("Sharing failed. Copy your code manually instead.");
    } finally { setSharePending(false); }
  }
  return <div className={`space-y-6 ${theme === "emerald" ? "[--aurum:#34d399]" : theme === "violet" ? "[--aurum:#a78bfa]" : ""}`}>
    <section className={`rounded-2xl border p-6 ${theme === "emerald" ? "border-emerald-400/30 bg-emerald-500/10" : theme === "violet" ? "border-violet-400/30 bg-violet-500/10" : "border-amber-400/30 bg-amber-500/10"}`}>
      <p className="text-sm text-neutral-300">Quest wallet</p><h1 className="mt-2 text-3xl font-bold">{balance.toLocaleString()} Quest XP</h1><p className="mt-2 text-sm text-neutral-400">{passes} available Discovery {passes === 1 ? "Pass" : "Passes"} / REP stays separate.</p>
      <p className="mt-3 text-sm text-neutral-300">Quest level {Math.floor(lifetimeXp / 300) + 1} / {lifetimeXp % 300} of 300 XP to the next level</p><p className="mt-1 text-xs text-neutral-500">Levels use lifetime earned XP. Spending does not lower your level.</p>
      <div className="mt-4"><MemberAction action={claimDailyQuest} disabled={dailyClaimed}>{dailyClaimed ? "Today's 5 XP collected" : "Daily check-in: +5 XP"}</MemberAction></div>
      <p className="mt-3 text-xs text-neutral-400">Daily exercises reset at midnight UTC. No lost streaks or maximum lifetime XP.</p>
    </section>
    <section className="rounded-2xl border border-stroke p-5"><h2 className="text-xl font-bold">Invite & unlock</h2><p className="mt-2 text-sm leading-6 text-neutral-400">Share your code. When a new friend verifies their email and earns their first approved task, receive 200 XP and a Discovery Pass. Your friend receives 100 XP. Up to 3 qualified rewards per UTC calendar month; excess eligible referrals remain pending.</p><p className="my-4 break-all rounded-xl bg-white/5 p-4 font-mono text-xl">{code}</p><button type="button" disabled={sharePending} className="min-h-11 rounded-xl border border-stroke px-4 py-2 disabled:opacity-50" onClick={() => void share()}>{sharePending ? "Opening..." : "Share invite"}</button>{shareMessage ? <p role="status" className="mt-2 text-sm">{shareMessage}</p> : null}<p className="mt-4 text-sm text-neutral-400">{referralStatus}</p><label className="mt-4 block text-sm">Invited by a friend?<input maxLength={32} value={referral} onChange={(event) => setReferral(event.target.value)} className="mt-2 block w-full rounded-xl border border-stroke bg-surface p-3" placeholder="Enter their code within 7 days of joining" /></label><div className="mt-3"><MemberAction action={() => attachReferral(referral)}>Save inviter code</MemberAction></div></section>
    <section><h2 className="text-xl font-bold">Always-open exchange</h2><p className="mt-2 text-sm text-neutral-400">Passes grant permission to apply, not guaranteed acceptance, payment, or a slot.</p><div className="mt-4 grid gap-4 sm:grid-cols-3">{exchangeItems.map((item) => <article key={item.id} className="rounded-2xl border border-stroke bg-surface p-5"><h3 className="font-bold">{item.name}</h3><p className="mt-2 text-sm leading-6 text-neutral-400">{item.description}</p><p className="my-3 font-mono text-amber-300">{item.cost} XP</p><MemberAction disabled={balance < item.cost || (!item.repeatable && owned.includes(item.id))} action={() => redeemQuestItem(item.id)}>{owned.includes(item.id) ? "Owned" : "Exchange XP"}</MemberAction></article>)}</div><div className="mt-4 flex flex-wrap gap-3">{["classic", ...owned].map((accent) => <MemberAction key={accent} action={() => selectQuestTheme(accent)} disabled={theme === accent}>Use {accent}</MemberAction>)}</div></section>
    <section><h2 className="text-xl font-bold">Daily testing academy</h2><p className="mt-2 text-sm text-neutral-400">12 repeatable learning exercises, 10 XP each per day. These do not award REP.</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{academyQuests.map((quest) => <article key={quest.id} className="rounded-2xl border border-stroke bg-surface p-5"><h3 className="font-bold">{quest.title}</h3><p className="mt-2 text-sm text-neutral-300">{quest.question}</p><fieldset className="my-4 space-y-2"><legend className="sr-only">{quest.question}</legend>{quest.options.map((option, index) => <label key={option} className="flex min-h-11 items-start gap-2 rounded-lg border border-stroke p-3 text-sm"><input className="mt-1" type="radio" name={quest.id} checked={answers[quest.id] === index} onChange={() => setAnswers((current) => ({ ...current, [quest.id]: index }))} />{option}</label>)}</fieldset><MemberAction action={() => completeAcademyQuest(quest.id, answers[quest.id])} disabled={completed.includes(quest.id) || answers[quest.id] === undefined}>{completed.includes(quest.id) ? "Rewarded today" : "Check answer: +10 XP"}</MemberAction></article>)}</div></section>
  </div>;
}
