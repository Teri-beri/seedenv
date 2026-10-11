"use client";

import Link from "next/link";
import { useState } from "react";
import { Settings2 } from "lucide-react";
import { MemberAction } from "@/components/member-action";
import { ClaimTimer } from "@/components/applications/ClaimTimer";
import { decideApplication } from "@/app/actions/applicationActions";

export type QueueApplication = {
  id: string;
  status: string;
  note: string;
  passReserved: boolean;
  startBy: string | null;
  completed: boolean;
  campaign: { id: string; title: string };
  tester: { username: string; avatarUrl: string | null; xpPoints: number; rankLabel: string; submissionCount: number; deviceModel: string | null; osBuild: string | null };
};

export type ChargePreview = { credit: true } | { credit: false; stipendCents: number; platformFeeCents: number; totalCents: number };
export type BalancePreview = { balanceCents: number; autoReloadCents: number };

type QueueTab = "pending" | "active" | "completed" | "declined" | "withdrawn";

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function bucketOf(application: QueueApplication): QueueTab {
  if (application.status === "PENDING") return "pending";
  if (application.status === "DECLINED") return "declined";
  if (application.status === "WITHDRAWN") return "withdrawn";
  return application.completed ? "completed" : "active";
}

const tabLabels: ReadonlyArray<{ value: QueueTab; label: string }> = [
  { value: "pending", label: "Pending Review" },
  { value: "active", label: "Active in Test" },
  { value: "completed", label: "Completed" },
  { value: "declined", label: "Declined" },
  { value: "withdrawn", label: "Withdrawn" },
];

const emptyCopy: Record<QueueTab, { heading: string; detail: string }> = {
  pending: { heading: "No pending tester applications", detail: "Validators who meet your minimum REP and device criteria will appear here for review." },
  active: { heading: "No testers in flight", detail: "Accepted validators appear here while their claim window and proof timer run." },
  completed: { heading: "No completed runs yet", detail: "Testers move here once you approve their submitted proof." },
  declined: { heading: "No declined requests", detail: "Requests you turn down are kept here for your records." },
  withdrawn: { heading: "No withdrawn requests", detail: "Requests testers pull back, or that expire unstarted, are kept here." },
};

const statusTone: Record<string, string> = {
  PENDING: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  ACCEPTED: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  STARTED: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  DECLINED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  WITHDRAWN: "border-zinc-700 bg-zinc-900/60 text-zinc-400",
};

function ChargeBreakdown({ preview, balance }: { preview?: ChargePreview; balance?: BalancePreview }) {
  if (!preview || preview.credit) return null;
  const short = balance && balance.balanceCents < preview.totalCents;
  return <p className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-[11px] leading-5 text-zinc-400">Drawn from your prepaid balance on accept: {money(preview.stipendCents)} tester reward + {money(preview.platformFeeCents)} platform fee. Returned to your balance if the place goes unused when the cohort ends.{balance ? <> Balance: <span className={short ? "text-amber-400" : "text-zinc-200"}>{money(balance.balanceCents)}</span>.</> : null}{short ? (balance.autoReloadCents > 0 ? ` Auto-reload will add at least ${money(balance.autoReloadCents)} to your balance first.` : <> <Link href="/console?view=billing" className="text-emerald-400 underline-offset-2 hover:underline">Add funds</Link> before accepting.</>) : null}</p>;
}

function AcceptLabel({ preview }: { preview?: ChargePreview }) {
  if (!preview) return <>Accept &amp; Issue Build</>;
  if (preview.credit) return <>Accept &amp; Issue Build · uses a paid place</>;
  return <>Accept &amp; Issue Build · {money(preview.totalCents)}</>;
}

function Avatar({ username, avatarUrl }: { username: string; avatarUrl: string | null }) {
  const initial = username.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 bg-cover bg-center font-mono text-xs font-semibold text-zinc-300"
      style={avatarUrl ? { backgroundImage: `url(${JSON.stringify(avatarUrl)})` } : undefined}
    >
      {avatarUrl ? null : initial}
    </span>
  );
}

function ApplicantCard({ application, preview, balance, renderedAt }: { application: QueueApplication; preview?: ChargePreview; balance?: BalancePreview; renderedAt: number }) {
  const device = application.tester.deviceModel || application.tester.osBuild
    ? [application.tester.deviceModel, application.tester.osBuild].filter(Boolean).join(" · ")
    : null;
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 transition-colors hover:border-zinc-700">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar username={application.tester.username} avatarUrl={application.tester.avatarUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-100">@{application.tester.username}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md border border-emerald-500/25 bg-emerald-500/5 px-2 py-0.5 font-mono text-[11px] text-emerald-300">REP {application.tester.xpPoints.toLocaleString()} · {application.tester.rankLabel}</span>
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] ${device ? "border-zinc-800 bg-zinc-900/60 text-zinc-300" : "border-zinc-800 bg-zinc-900/60 text-zinc-500"}`}>{device || "Device not reported yet"}</span>
            </div>
          </div>
        </div>
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${statusTone[application.status] || statusTone.WITHDRAWN}`}>{application.completed ? "Completed" : application.status}</span>
      </div>
      <p className="mt-3 font-mono text-[11px] text-zinc-500">{application.campaign.title} · {application.tester.submissionCount.toLocaleString()} lifetime submissions</p>
      {application.note ? <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-400">{application.note}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {application.startBy && (application.status === "ACCEPTED" || application.status === "STARTED") ? <ClaimTimer startBy={application.startBy} renderedAt={renderedAt} /> : null}
        {application.passReserved ? <span className="inline-flex items-center rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 font-mono text-[11px] text-violet-300">Discovery pass reserved</span> : null}
      </div>
      {application.status === "PENDING" ? <ChargeBreakdown preview={preview} balance={balance} /> : null}
      {application.status === "PENDING" ? (
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <MemberAction tone="emerald" action={() => decideApplication(application.id, "accept")}><AcceptLabel preview={preview} /></MemberAction>
          <MemberAction tone="ghost" action={() => decideApplication(application.id, "decline")}>Decline</MemberAction>
        </div>
      ) : null}
    </article>
  );
}

function ShareCohortButton({ cohort }: { cohort: { id: string; title: string } }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={async () => {
          const href = `${window.location.origin}/cohorts/${cohort.id}`;
          try {
            await navigator.clipboard.writeText(href);
            setCopied(true);
          } catch {
            window.open(href, "_blank", "noopener");
          }
        }}
        className="rounded-lg bg-emerald-500 px-3 py-2 font-mono text-xs font-semibold text-black transition-colors hover:bg-emerald-400"
      >
        {copied ? "Link copied" : "Share Cohort Link"}
      </button>
      <Link href={`/cohorts/${cohort.id}`} className="rounded-lg border border-zinc-800 px-3 py-2 font-mono text-xs text-zinc-400 transition-colors hover:text-white">Open public brief</Link>
    </div>
  );
}

export function TesterRequests({ applications, chargePreviews = {}, balance, renderedAt, shareCohort, rulesPanel, note }: {
  applications: QueueApplication[];
  chargePreviews?: Record<string, ChargePreview>;
  balance?: BalancePreview;
  renderedAt: number;
  shareCohort: { id: string; title: string } | null;
  rulesPanel: React.ReactNode;
  note: string;
}) {
  const [tab, setTab] = useState<QueueTab>("pending");
  const [rulesOpen, setRulesOpen] = useState(false);
  const counts = Object.fromEntries(tabLabels.map((item) => [item.value, applications.filter((application) => bucketOf(application) === item.value).length])) as Record<QueueTab, number>;
  const visible = applications.filter((application) => bucketOf(application) === tab);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div role="tablist" aria-label="Application status" className="flex flex-wrap gap-2">
          {tabLabels.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              onClick={() => setTab(item.value)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${tab === item.value ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"}`}
            >
              {item.label} ({counts[item.value]})
            </button>
          ))}
        </div>
        {rulesPanel ? (
          <button
            type="button"
            aria-expanded={rulesOpen}
            aria-controls="rep-device-rules"
            onClick={() => setRulesOpen((open) => !open)}
            className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 font-mono text-xs text-zinc-300 transition-colors hover:text-white"
          >
            <Settings2 aria-hidden="true" className="size-3.5" /> REP &amp; Device Rules
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {visible.length ? (
            visible.map((application) => (
              <ApplicantCard key={application.id} application={application} preview={chargePreviews[application.campaign.id]} balance={balance} renderedAt={renderedAt} />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 p-12 text-center">
              <div className="mb-3 rounded-full border border-zinc-800 bg-zinc-900 p-3 font-mono text-sm text-emerald-400">{counts[tab]}/{applications.length}</div>
              <h3 className="text-sm font-medium text-zinc-200">{emptyCopy[tab].heading}</h3>
              <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">{emptyCopy[tab].detail}</p>
              {tab === "pending" && shareCohort ? <ShareCohortButton cohort={shareCohort} /> : null}
              {tab === "pending" && !shareCohort ? <Link href="/console?view=new-drop" className="mt-4 rounded-lg bg-emerald-500 px-3 py-2 font-mono text-xs font-semibold text-black transition-colors hover:bg-emerald-400">Deploy a cohort</Link> : null}
            </div>
          )}
          <p className="font-mono text-[11px] text-zinc-500">{note}</p>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
            <h2 className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Queue summary</h2>
            <dl className="mt-3 space-y-2 text-xs">
              {tabLabels.map((item) => (
                <div key={item.value} className="flex items-center justify-between gap-3">
                  <dt className="text-zinc-400">{item.label}</dt>
                  <dd className="font-mono text-zinc-200">{counts[item.value]}</dd>
                </div>
              ))}
            </dl>
            {balance ? <p className="mt-4 border-t border-zinc-800 pt-3 font-mono text-[11px] text-zinc-400">Prepaid balance <span className="text-zinc-200">{money(balance.balanceCents)}</span>. Accepting a tester draws their reward and the platform fee from it.</p> : null}
          </div>
          <p className="text-xs leading-5 text-zinc-500">REP unlocks permission to request entry. Developers choose who joins. Accepted testers have up to 24 hours to start; the proof timer begins only when they start. Discovery Passes bypass only developer-approved REP floors, never other task qualifications. Submitted proof is reviewed separately in Submissions.</p>
          {rulesPanel ? <div id="rep-device-rules" hidden={!rulesOpen}>{rulesPanel}</div> : null}
        </aside>
      </div>
    </div>
  );
}
