"use client";

import type { RankTier, SubmissionStatus } from "@prisma/client";
import { useMemo, useState } from "react";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import Image from "next/image";
import Link from "next/link";
import { rankThresholds } from "@/lib/rank";

type LeaderboardEntry = {
  id: string;
  username: string;
  avatarUrl: string | null;
  xpPoints: number;
  rankTier: RankTier;
  submissions: Array<{ status: SubmissionStatus; submittedAt: string }>;
};

type CurrentUser = {
  id: string;
  username: string;
  xpPoints: number;
  rankTier: RankTier;
  approvedRuns: number;
  passRate: number | null;
};

type BoardMode = "all-time" | "season" | "pass-rate";
type BoardRow = { id: string; username: string; avatarUrl: string | null; xpPoints: number; rankTier: RankTier; approvedRuns: number; seasonRuns: number; passRate: number | null; sample?: boolean };

const benchmarkRows: BoardRow[] = [
  { id: "sample-apex", username: "sample_apex", avatarUrl: null, xpPoints: 6800, rankTier: "APEX_ARCHITECT", approvedRuns: 54, seasonRuns: 8, passRate: 98, sample: true },
  { id: "sample-mobile", username: "sample_mobile", avatarUrl: null, xpPoints: 3200, rankTier: "CORE_VALIDATOR", approvedRuns: 31, seasonRuns: 5, passRate: 96, sample: true },
  { id: "sample-builds", username: "sample_builds", avatarUrl: null, xpPoints: 1850, rankTier: "CORE_VALIDATOR", approvedRuns: 24, seasonRuns: 3, passRate: 92, sample: true },
  { id: "sample-signal", username: "sample_signal", avatarUrl: null, xpPoints: 900, rankTier: "ALPHA_SEEDER", approvedRuns: 14, seasonRuns: 2, passRate: 88, sample: true },
];

const boardTabs: Array<{ id: BoardMode; label: string }> = [
  { id: "all-time", label: "All-Time REP" },
  { id: "season", label: "Current Month" },
  { id: "pass-rate", label: "Highest Pass Rate" },
];

function monthStart(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).getTime();
}

function toBoardRow(entry: LeaderboardEntry, seasonStart: number): BoardRow {
  const reviewed = entry.submissions.length;
  const approved = entry.submissions.filter((submission) => submission.status === "APPROVED");
  return {
    id: entry.id,
    username: entry.username,
    avatarUrl: entry.avatarUrl,
    xpPoints: entry.xpPoints,
    rankTier: entry.rankTier,
    approvedRuns: approved.length,
    seasonRuns: approved.filter((submission) => new Date(submission.submittedAt).getTime() >= seasonStart).length,
    passRate: reviewed ? Math.round((approved.length / reviewed) * 100) : null,
  };
}

function rankRows(rows: BoardRow[], mode: BoardMode) {
  return [...rows].sort((a, b) => {
    if (mode === "season") return b.seasonRuns - a.seasonRuns || b.xpPoints - a.xpPoints;
    if (mode === "pass-rate") return (b.passRate ?? -1) - (a.passRate ?? -1) || b.approvedRuns - a.approvedRuns;
    return b.xpPoints - a.xpPoints;
  });
}

export function LeaderboardTable({ entries, currentUser, now }: { entries: LeaderboardEntry[]; currentUser: CurrentUser; now: Date }) {
  const seasonStart = monthStart(now);
  const [mode, setMode] = useState<BoardMode>("all-time");
  const realRows = useMemo(() => entries.map((entry) => toBoardRow(entry, seasonStart)), [entries, seasonStart]);
  const hasCompetitors = realRows.some((entry) => entry.id !== currentUser.id);
  const rows = useMemo(() => rankRows(hasCompetitors ? realRows : benchmarkRows, mode), [hasCompetitors, mode, realRows]);
  const currentRank = hasCompetitors ? rankRows(realRows, mode).findIndex((entry) => entry.id === currentUser.id) + 1 : 0;
  const currentData = realRows.find((entry) => entry.id === currentUser.id);
  const currentPassRate = currentData?.passRate ?? currentUser.passRate;

  const displayRows = [
    ...rows.filter((row) => row.id !== currentUser.id).slice(0, 5).map((row, index) => ({
      key: row.id,
      rank: `#${String(index + 1).padStart(2, "0")}`,
      username: row.username,
      avatarUrl: row.avatarUrl,
      sample: Boolean(row.sample),
      tierLabel: rankThresholds[row.rankTier].label,
      runs: mode === "season" ? row.seasonRuns : row.approvedRuns,
      metric: mode === "pass-rate" ? (row.passRate === null ? "--" : `${row.passRate}%`) : `${row.xpPoints.toLocaleString()} REP`,
      isCurrent: false,
    })),
    {
      key: currentUser.id,
      rank: currentRank ? `#${String(currentRank).padStart(2, "0")}` : "#--",
      username: currentUser.username,
      avatarUrl: null,
      sample: true,
      tierLabel: rankThresholds[currentUser.rankTier].label,
      runs: mode === "season" ? currentData?.seasonRuns ?? 0 : currentUser.approvedRuns,
      metric: mode === "pass-rate" ? (currentPassRate === null ? "--" : `${currentPassRate}%`) : `${currentUser.xpPoints.toLocaleString()} REP`,
      isCurrent: true,
    },
  ];
  const runsLabel = mode === "season" ? "approved" : "missions";

  return (
    <div className="mt-5">
      <SegmentedTabs groupId="leaderboard-mode" label="Leaderboard ranking" activeId={mode} tabs={boardTabs} onChange={setMode} />
      {!hasCompetitors ? <p className="mt-3 rounded-lg border border-dashed border-zinc-800 px-3 py-2 text-xs text-zinc-500"><span className="font-semibold text-zinc-300">Benchmark examples</span> · These rows illustrate competitive targets and are not live SeedEnv activity.</p> : null}

      {/* Phones get stacked cards so the board never needs a sideways swipe. */}
      <ul className="mt-4 space-y-2 sm:hidden" aria-label="Leaderboard standings">
        {displayRows.map((row) => (
          <li key={row.key} className={`flex items-center gap-3 rounded-xl px-3 py-3 ${row.isCurrent ? "border border-emerald-500/20 bg-emerald-500/5" : "bg-black/15"}`}>
            <span className={`w-9 shrink-0 font-mono text-sm font-semibold ${row.isCurrent ? "text-emerald-400" : "text-zinc-500"}`}>{row.rank}</span>
            <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 text-xs uppercase text-zinc-400">
              {row.avatarUrl ? <Image src={row.avatarUrl} alt="" fill sizes="36px" className="object-cover" /> : row.username.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5 text-sm font-semibold text-zinc-100">
                <span className="truncate">{row.sample ? `@${row.username}` : <Link className="hover:text-emerald-300" href={`/u/${encodeURIComponent(row.username)}`}>@{row.username}</Link>}</span>
                {row.isCurrent ? <span className="shrink-0 text-xs font-normal text-emerald-400">You</span> : null}
              </span>
              <span className="mt-0.5 block truncate text-xs text-zinc-500">{row.tierLabel} · {row.runs} {runsLabel}</span>
            </span>
            <span className="shrink-0 font-mono text-sm text-amber-300">{row.metric}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[680px] border-separate border-spacing-y-2 text-left">
          <thead className="font-mono text-[10px] uppercase tracking-wider text-zinc-600"><tr><th className="px-3 py-2">Rank</th><th className="px-3 py-2">Validator</th><th className="px-3 py-2">Tier</th><th className="px-3 py-2">{mode === "season" ? "This month" : "Approved runs"}</th><th className="px-3 py-2">{mode === "pass-rate" ? "Pass rate" : "Reputation"}</th></tr></thead>
          <tbody>
            {rows.filter((row) => row.id !== currentUser.id).slice(0, 5).map((row, index) => (
              <tr key={row.id} className="bg-black/15 text-sm">
                <td className="rounded-l-xl px-3 py-3 font-mono font-semibold text-zinc-500">#{String(index + 1).padStart(2, "0")}</td>
                <td className="px-3 py-3 font-semibold text-zinc-200"><span className="flex items-center gap-2"><span className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 text-[10px] uppercase text-zinc-400">{row.avatarUrl ? <Image src={row.avatarUrl} alt="" fill sizes="28px" className="object-cover" /> : row.username.slice(0, 1)}</span>{row.sample ? <span>@{row.username}</span> : <Link className="hover:text-emerald-300" href={`/u/${encodeURIComponent(row.username)}`}>@{row.username}</Link>}</span></td>
                <td className="px-3 py-3 text-xs text-zinc-400">{rankThresholds[row.rankTier].label}</td>
                <td className="px-3 py-3 text-zinc-400">{mode === "season" ? row.seasonRuns : row.approvedRuns} {mode === "season" ? "approved" : "missions"}</td>
                <td className="rounded-r-xl px-3 py-3 font-mono text-amber-300">{mode === "pass-rate" ? row.passRate === null ? "--" : `${row.passRate}%` : `${row.xpPoints.toLocaleString()} REP`}</td>
              </tr>
            ))}
            <tr className="bg-emerald-500/5 text-sm">
              <td className="rounded-l-xl border-y border-l border-emerald-500/20 px-3 py-3 font-mono font-semibold text-emerald-400">{currentRank ? `#${String(currentRank).padStart(2, "0")}` : "#--"}</td>
              <td className="border-y border-emerald-500/20 px-3 py-3 font-semibold text-zinc-100">@{currentUser.username} <span className="ml-1 text-xs font-normal text-emerald-400">You</span></td>
              <td className="border-y border-emerald-500/20 px-3 py-3 text-xs text-zinc-400">{rankThresholds[currentUser.rankTier].label}</td>
              <td className="border-y border-emerald-500/20 px-3 py-3 text-zinc-400">{mode === "season" ? currentData?.seasonRuns ?? 0 : currentUser.approvedRuns} {mode === "season" ? "approved" : "missions"}</td>
              <td className="rounded-r-xl border-y border-r border-emerald-500/20 px-3 py-3 font-mono text-amber-300">{mode === "pass-rate" ? (currentData?.passRate ?? currentUser.passRate) === null ? "--" : `${currentData?.passRate ?? currentUser.passRate}%` : `${currentUser.xpPoints.toLocaleString()} REP`}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
