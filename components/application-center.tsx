"use client";

import { useState } from "react";
import { decideApplication, updateMissionRequirements, withdrawApplication } from "@/app/actions/applicationActions";
import { MemberAction } from "@/components/member-action";
import Link from "next/link";

type Application = { id: string; status: string; note: string; passReserved: boolean; startBy: string | null; campaign: { title: string; id: string }; tester: { username: string; xpPoints: number; _count: { submissions: number } } };
type Campaign = { id: string; title: string; discoveryAllowed: boolean; discoveryMinRep: number; instructions: Array<{ id: string; instructionTitle: string; minimumRep: number }> };

export type ChargePreview = { credit: true } | { credit: false; stipendCents: number; platformFeeCents: number; totalCents: number };
export type BalancePreview = { balanceCents: number; autoReloadCents: number };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function AcceptLabel({ preview }: { preview?: ChargePreview }) {
  if (!preview) return <>Accept</>;
  if (preview.credit) return <>Accept · uses a paid place</>;
  return <>Accept · {money(preview.totalCents)} from balance</>;
}

function ChargeBreakdown({ preview, balance }: { preview?: ChargePreview; balance?: BalancePreview }) {
  if (!preview || preview.credit) return null;
  const short = balance && balance.balanceCents < preview.totalCents;
  return <p className="mt-2 font-mono text-[11px] text-neutral-500">Drawn from your prepaid balance on accept: {money(preview.stipendCents)} tester reward + {money(preview.platformFeeCents)} platform fee. Returned to your balance if the place goes unused when the cohort ends.{balance ? <> Balance: <span className={short ? "text-amber-400" : "text-neutral-300"}>{money(balance.balanceCents)}</span>.</> : null}{short ? (balance.autoReloadCents > 0 ? ` Auto-reload will add at least ${money(balance.autoReloadCents)} to your balance first.` : <> <Link href="/console?view=billing" className="text-emerald-400 underline-offset-2 hover:underline">Add funds</Link> before accepting.</>) : null}</p>;
}

export function ApplicationCenter({ developer, applications, campaigns, chargePreviews = {}, balance }: { developer: boolean; applications: Application[]; campaigns: Campaign[]; chargePreviews?: Record<string, ChargePreview>; balance?: BalancePreview }) {
  const requests = developer ? [...applications.filter((item) => item.status === "PENDING"), ...applications.filter((item) => item.status !== "PENDING")] : applications;
  return <div className="space-y-6">
    <p className="text-sm leading-6 text-neutral-400">REP unlocks permission to request entry. Developers choose who joins. Accepted testers have up to 24 hours to start; the proof timer begins only when they start. Discovery Passes bypass only developer-approved REP floors, never other task qualifications.</p>
    <h2 id="tester-requests" className="scroll-mt-20 text-xl font-bold">{developer ? "Tester requests" : "Your applications"}</h2>
    {developer ? <p className="text-sm text-emerald-300">{applications.filter((item) => item.status === "PENDING").length} pending in this list. Join requests are shown here; submitted proof is reviewed separately in Submissions.</p> : null}
    {!applications.length ? <p className="rounded-xl border border-dashed border-stroke p-6 text-neutral-400">No applications yet.</p> : null}
    {requests.map((item) => <article key={item.id} className="rounded-2xl border border-stroke bg-surface p-5">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{item.campaign.title}</h3><span className="text-xs text-amber-300">{item.status}</span></div>
      {developer ? <p className="mt-2 text-sm">{item.tester.username} / {item.tester.xpPoints} REP / {item.tester._count.submissions} submissions</p> : null}
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-neutral-400">{item.note}</p>
      {item.passReserved ? <p className="mt-2 text-xs text-violet-300">Discovery application: one pass reserved</p> : null}
      {developer && item.status === "PENDING" ? <ChargeBreakdown preview={chargePreviews[item.campaign.id]} balance={balance} /> : null}
      {item.startBy ? <p className="mt-2 text-xs text-neutral-400">Start by {new Date(item.startBy).toLocaleString()}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {developer && item.status === "PENDING" ? <><MemberAction action={() => decideApplication(item.id, "accept")}><AcceptLabel preview={chargePreviews[item.campaign.id]} /></MemberAction><MemberAction action={() => decideApplication(item.id, "decline")}>Decline</MemberAction></> : null}
        {!developer && ["PENDING", "ACCEPTED"].includes(item.status) ? <MemberAction action={() => withdrawApplication(item.id)}>Withdraw / return unused pass</MemberAction> : null}
        {!developer && item.status === "ACCEPTED" && item.startBy && new Date(item.startBy) > new Date() ? <Link href={`/dashboard?claim=${encodeURIComponent(item.campaign.id)}`} className="rounded-xl border border-stroke px-4 py-3 text-sm">Start accepted mission</Link> : null}
      </div>
    </article>)}
    {developer && campaigns.length ? <details className="rounded-xl border border-stroke p-5"><summary className="cursor-pointer font-semibold">Configure task eligibility and REP requirements</summary><div className="mt-5 space-y-5">{campaigns.map((campaign) => <Requirements key={campaign.id} campaign={campaign} />)}</div></details> : null}
  </div>;
}

function Requirements({ campaign }: { campaign: Campaign }) {
  const [tasks, setTasks] = useState(campaign.instructions);
  const [allowed, setAllowed] = useState(campaign.discoveryAllowed);
  const [floor, setFloor] = useState(campaign.discoveryMinRep);
  return <section className="rounded-2xl border border-stroke p-5"><h2 className="font-bold">{campaign.title}: task requirements</h2><p className="mt-2 text-xs leading-6 text-neutral-500">A campaign requires all its task steps, so its application threshold is the highest task REP requirement. Accepted requests keep their existing eligibility.</p><div className="mt-4 space-y-3">{tasks.map((task) => <label key={task.id} className="block text-sm">{task.instructionTitle}<input type="number" min={0} max={1000000} value={task.minimumRep} onChange={(event) => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, minimumRep: Number(event.target.value) } : item))} className="mt-2 block w-full rounded-xl border border-stroke bg-surface p-3" /></label>)}</div><label className="mt-4 flex min-h-11 items-center gap-3"><input type="checkbox" checked={allowed} onChange={(event) => setAllowed(event.target.checked)} />Allow Discovery Pass applications</label>{allowed ? <label className="mt-2 block text-sm">Lowest REP accepted with a pass<input type="number" min={0} value={floor} onChange={(event) => setFloor(Number(event.target.value))} className="mt-2 block w-full rounded-xl border border-stroke bg-surface p-3" /></label> : null}<div className="mt-4"><MemberAction action={() => updateMissionRequirements(campaign.id, tasks.map(({ id, minimumRep }) => ({ id, minimumRep })), allowed, floor)}>Save requirements</MemberAction></div></section>;
}
