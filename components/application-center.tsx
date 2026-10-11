"use client";

import { useState } from "react";
import { updateMissionRequirements, withdrawApplication } from "@/app/actions/applicationActions";
import { MemberAction } from "@/components/member-action";
import { TesterRequests, type BalancePreview, type ChargePreview, type QueueApplication } from "@/components/applications/TesterRequests";
import Link from "next/link";

type Application = { id: string; status: string; note: string; passReserved: boolean; startBy: string | null; campaign: { title: string; id: string }; tester: { username: string; xpPoints: number; _count: { submissions: number } } };
type Campaign = { id: string; title: string; status: string; discoveryAllowed: boolean; discoveryMinRep: number; hardwareStrict: boolean; instructions: Array<{ id: string; instructionTitle: string; minimumRep: number }> };

export type { ChargePreview, BalancePreview };

export function ApplicationCenter({ developer, applications, campaigns, chargePreviews = {}, balance, queue = [], renderedAt = 0, shareCohort = null }: { developer: boolean; applications: Application[]; campaigns: Campaign[]; chargePreviews?: Record<string, ChargePreview>; balance?: BalancePreview; queue?: QueueApplication[]; renderedAt?: number; shareCohort?: { id: string; title: string } | null }) {
  if (developer) {
    const primaryCampaign = campaigns.find((campaign) => campaign.status === "ACTIVE") || campaigns[0] || null;
    return <TesterRequests
      applications={queue}
      chargePreviews={chargePreviews}
      balance={balance}
      renderedAt={renderedAt}
      shareCohort={shareCohort}
      rulesSummary={primaryCampaign ? {
        campaignTitle: primaryCampaign.title,
        minimumRep: Math.max(0, ...primaryCampaign.instructions.map((task) => task.minimumRep)),
        discoveryAllowed: primaryCampaign.discoveryAllowed,
        discoveryMinRep: primaryCampaign.discoveryMinRep,
        hardwareStrict: primaryCampaign.hardwareStrict,
      } : null}
      rulesPanel={campaigns.length ? <div className="space-y-4">{campaigns.map((campaign) => <Requirements key={campaign.id} campaign={campaign} />)}</div> : null}
    />;
  }
  return <div className="space-y-6">
    <p className="text-sm leading-6 text-zinc-400">REP unlocks permission to request entry. Developers choose who joins. Accepted testers have up to 24 hours to start; the proof timer begins only when they start. Discovery Passes bypass only developer-approved REP floors, never other task qualifications.</p>
    <h2 id="tester-requests" className="scroll-mt-20 text-xl font-bold">Your applications</h2>
    {!applications.length ? <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-zinc-400">No applications yet.</p> : null}
    {applications.map((item) => <article key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{item.campaign.title}</h3><span className="font-mono text-xs uppercase tracking-wider text-zinc-400">{item.status}</span></div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-400">{item.note}</p>
      {item.passReserved ? <p className="mt-2 text-xs text-violet-300">Discovery application: one pass reserved</p> : null}
      {item.startBy ? <p className="mt-2 text-xs text-zinc-400">Start by {new Date(item.startBy).toLocaleString()}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        {["PENDING", "ACCEPTED"].includes(item.status) ? <MemberAction action={() => withdrawApplication(item.id)}>Withdraw / return unused pass</MemberAction> : null}
        {item.status === "ACCEPTED" && item.startBy && new Date(item.startBy) > new Date() ? <Link href={`/dashboard?claim=${encodeURIComponent(item.campaign.id)}`} className="inline-flex min-h-11 items-center rounded-xl border border-zinc-800 px-4 py-3 text-sm">Start accepted mission</Link> : null}
      </div>
    </article>)}
  </div>;
}

function Requirements({ campaign }: { campaign: Campaign }) {
  const [tasks, setTasks] = useState(campaign.instructions);
  const [allowed, setAllowed] = useState(campaign.discoveryAllowed);
  const [floor, setFloor] = useState(campaign.discoveryMinRep);
  return <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"><h2 className="text-sm font-semibold text-zinc-100">{campaign.title}</h2><p className="mt-2 text-xs leading-5 text-zinc-500">A campaign requires all its task steps, so its application threshold is the highest task REP requirement. Accepted requests keep their existing eligibility.</p><div className="mt-4 space-y-3">{tasks.map((task) => <label key={task.id} className="block text-xs text-zinc-300">{task.instructionTitle}<input type="number" min={0} max={1000000} value={task.minimumRep} onChange={(event) => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, minimumRep: Number(event.target.value) } : item))} className="mt-2 block w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-2 font-mono text-xs" /></label>)}</div><label className="mt-4 flex min-h-11 items-center gap-3 text-xs text-zinc-300"><input type="checkbox" checked={allowed} onChange={(event) => setAllowed(event.target.checked)} />Allow Discovery Pass applications</label>{allowed ? <label className="mt-2 block text-xs text-zinc-300">Lowest REP accepted with a pass<input type="number" min={0} value={floor} onChange={(event) => setFloor(Number(event.target.value))} className="mt-2 block w-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-2 font-mono text-xs" /></label> : null}<div className="mt-4"><MemberAction tone="emerald" action={() => updateMissionRequirements(campaign.id, tasks.map(({ id, minimumRep }) => ({ id, minimumRep })), allowed, floor)}>Save requirements</MemberAction></div></section>;
}
