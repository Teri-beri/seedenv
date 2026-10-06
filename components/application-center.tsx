"use client";

import { useState } from "react";
import { decideApplication, updateMissionRequirements, withdrawApplication } from "@/app/actions/applicationActions";
import { MemberAction } from "@/components/member-action";
import Link from "next/link";

type Application = { id: string; status: string; note: string; passReserved: boolean; startBy: string | null; campaign: { title: string; id: string }; tester: { username: string; xpPoints: number; _count: { submissions: number } } };
type Campaign = { id: string; title: string; discoveryAllowed: boolean; discoveryMinRep: number; instructions: Array<{ id: string; instructionTitle: string; minimumRep: number }> };

export type ChargePreview = { credit: true } | { credit: false; stipendCents: number; platformFeeCents: number; processingFeeCents: number; totalCents: number };

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function AcceptLabel({ preview }: { preview?: ChargePreview }) {
  if (!preview) return <>Accept</>;
  if (preview.credit) return <>Accept · uses a paid slot, no charge</>;
  return <>Accept & charge {money(preview.totalCents)}</>;
}

function ChargeBreakdown({ preview }: { preview?: ChargePreview }) {
  if (!preview || preview.credit) return null;
  return <p className="mt-2 font-mono text-[11px] text-neutral-500">Charged to your saved card on accept: {money(preview.stipendCents)} tester stipend + {money(preview.platformFeeCents)} platform fee + {money(preview.processingFeeCents)} card processing. Refunded (except processing) if the slot goes unused when the cohort ends.</p>;
}

export function ApplicationCenter({ developer, applications, campaigns, chargePreviews = {} }: { developer: boolean; applications: Application[]; campaigns: Campaign[]; chargePreviews?: Record<string, ChargePreview> }) {
  return <div className="space-y-6"><p className="text-sm leading-6 text-neutral-400">REP unlocks permission to request entry. Developers choose who joins. Accepted testers have up to 24 hours to start; the proof timer begins only when they start. Discovery Passes bypass only developer-approved REP floors, never other task qualifications.</p>{developer ? campaigns.map((campaign) => <Requirements key={campaign.id} campaign={campaign} />) : null}<h2 className="text-xl font-bold">{developer ? "Tester requests" : "Your applications"}</h2>{!applications.length ? <p className="rounded-xl border border-dashed border-stroke p-6 text-neutral-400">No applications yet.</p> : null}{applications.map((item) => <article key={item.id} className="rounded-2xl border border-stroke bg-surface p-5"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{item.campaign.title}</h3><span className="text-xs text-amber-300">{item.status}</span></div>{developer ? <p className="mt-2 text-sm">{item.tester.username} / {item.tester.xpPoints} REP / {item.tester._count.submissions} submissions</p> : null}<p className="mt-3 whitespace-pre-wrap break-words text-sm text-neutral-400">{item.note}</p>{item.passReserved ? <p className="mt-2 text-xs text-violet-300">Discovery application: one pass reserved</p> : null}{developer && item.status === "PENDING" ? <ChargeBreakdown preview={chargePreviews[item.campaign.id]} /> : null}{item.startBy ? <p className="mt-2 text-xs text-neutral-400">Start by {new Date(item.startBy).toLocaleString()}</p> : null}<div className="mt-4 flex flex-wrap gap-3">{developer && item.status === "PENDING" ? <><MemberAction action={() => decideApplication(item.id, "accept")}><AcceptLabel preview={chargePreviews[item.campaign.id]} /></MemberAction><MemberAction action={() => decideApplication(item.id, "decline")}>Decline</MemberAction></> : null}{!developer && ["PENDING", "ACCEPTED"].includes(item.status) ? <MemberAction action={() => withdrawApplication(item.id)}>Withdraw / return unused pass</MemberAction> : null}{!developer && item.status === "ACCEPTED" && item.startBy && new Date(item.startBy) > new Date() ? <Link href={`/dashboard?claim=${encodeURIComponent(item.campaign.id)}`} className="rounded-xl border border-stroke px-4 py-3 text-sm">Start accepted mission</Link> : null}</div></article>)}</div>;
}

function Requirements({ campaign }: { campaign: Campaign }) {
  const [tasks, setTasks] = useState(campaign.instructions);
  const [allowed, setAllowed] = useState(campaign.discoveryAllowed);
  const [floor, setFloor] = useState(campaign.discoveryMinRep);
  return <section className="rounded-2xl border border-stroke p-5"><h2 className="font-bold">{campaign.title}: task requirements</h2><p className="mt-2 text-xs leading-6 text-neutral-500">A campaign requires all its task steps, so its application threshold is the highest task REP requirement. Accepted requests keep their existing eligibility.</p><div className="mt-4 space-y-3">{tasks.map((task) => <label key={task.id} className="block text-sm">{task.instructionTitle}<input type="number" min={0} max={1000000} value={task.minimumRep} onChange={(event) => setTasks((current) => current.map((item) => item.id === task.id ? { ...item, minimumRep: Number(event.target.value) } : item))} className="mt-2 block w-full rounded-xl border border-stroke bg-surface p-3" /></label>)}</div><label className="mt-4 flex min-h-11 items-center gap-3"><input type="checkbox" checked={allowed} onChange={(event) => setAllowed(event.target.checked)} />Allow Discovery Pass applications</label>{allowed ? <label className="mt-2 block text-sm">Lowest REP accepted with a pass<input type="number" min={0} value={floor} onChange={(event) => setFloor(Number(event.target.value))} className="mt-2 block w-full rounded-xl border border-stroke bg-surface p-3" /></label> : null}<div className="mt-4"><MemberAction action={() => updateMissionRequirements(campaign.id, tasks.map(({ id, minimumRep }) => ({ id, minimumRep })), allowed, floor)}>Save requirements</MemberAction></div></section>;
}
