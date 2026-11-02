import type { AppCampaign, Submission, TaskInstruction, User } from "@prisma/client";
import { StatusPill } from "@/components/status-pill";
import { SubmissionStatus } from "@prisma/client";
import { ArrowRight, Award, CheckCircle2, Medal, Settings, ShieldCheck, Trophy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { MissionExperience } from "@/components/mission-experience";
import { LeaderboardTable } from "@/components/tester/LeaderboardTable";
import { SegmentedTabLinks } from "@/components/ui/SegmentedTabs";
import { TesterBottomNav } from "@/components/navigation";
import { rankForXp, rankProgress, rankThresholds } from "@/lib/rank";
import { approvalRate, availableSlots, testerMilestones, testerViews, type TesterView } from "@/lib/tester-console";
import { isStoredRecording } from "@/lib/recording";
import { autoApproveDeadlineFrom as autoApproveDeadline } from "@/lib/auto-approval-window";
import { formatCents } from "@/lib/utils";
import { formatRankLevel, validatorNodeId } from "@/lib/validator-identity";
import { parseRobloxSubmissionChecklist } from "@/lib/roblox-cohorts";
import { ClipperDashboard, type ClipperDashboardData } from "@/components/clipper-dashboard";
import { CommandPaletteTrigger } from "@/components/command-palette";

type ConsoleMission = Pick<AppCampaign, "id" | "title" | "appUrl" | "iconUrl" | "targetVibe" | "description" | "bountyPerTaskUsd" | "totalSlots" | "claimedSlots" | "completedSlots" | "platform" | "discoveryAllowed" | "discoveryMinRep" | "estimatedMinutes" | "testerPerk"> & { instructions: TaskInstruction[]; acceptedInstructionRevision?: number; directionsUpdated?: boolean; ownedByTester?: boolean };

export type TesterConsoleData = {
  activeView: TesterView;
  tester: Pick<User, "id" | "username" | "xpPoints" | "stripeConnectAccountId">;
  missions: ConsoleMission[];
  leaderboard: Array<Pick<User, "id" | "username" | "avatarUrl" | "xpPoints" | "rankTier"> & { submissions: Array<{ status: SubmissionStatus; submittedAt: string }> }>;
  summary: Array<{ status: SubmissionStatus; _count: { _all: number }; _sum: { payoutCents: number | null } }>;
  recent: Array<Pick<Submission, "id" | "status" | "feedbackText" | "proofImageUrl" | "rejectionReason" | "revisionRequestedAt" | "payoutCents" | "expiresAt"> & { denialReviewPending?: boolean; campaign: { title: string } }>;
  pending: Array<Submission & { campaign: ConsoleMission; proofPreviewUrl: string | null }>;
  approvedCampaigns: Array<{ campaignId: string }>;
  pendingPayoutCents: number;
  now: Date;
  applications: Array<{ campaignId: string; status: string; startBy: string | null }>;
  questXp: number;
  discoveryPasses: number;
  clippers?: ClipperDashboardData;
};

export function TesterConsole({ activeView, tester, missions, leaderboard, summary, recent, pending, approvedCampaigns, pendingPayoutCents, now, applications, questXp, discoveryPasses, clippers }: TesterConsoleData) {
  const approved = summary.find((item) => item.status === SubmissionStatus.APPROVED);
  const approvedCount = approved?._count._all || 0;
  const rejectedCount = summary.find((item) => item.status === SubmissionStatus.REJECTED)?._count._all || 0;
  const quality = approvalRate(approvedCount, rejectedCount);
  const rank = rankForXp(tester.xpPoints);
  const progress = rankProgress(rank, tester.xpPoints);
  const milestones = testerMilestones(approvedCount, tester.xpPoints);
  const inReview = pending.filter((item) => !item.revisionRequestedAt && Boolean(item.feedbackText || item.proofImageUrl));
  const auditCents = inReview.reduce((total, item) => total + item.payoutCents, 0);
  const nextRelease = inReview.filter((item) => !item.denialReviewPending).map((item) => autoApproveDeadline(item.submittedAt)).filter((date): date is Date => Boolean(date)).sort((a, b) => a.getTime() - b.getTime())[0];
  const nextReleaseHours = nextRelease ? Math.max(0, Math.ceil((nextRelease.getTime() - now.getTime()) / 3_600_000)) : null;
  const completedIds = new Set(approvedCampaigns.map((item) => item.campaignId));
  const newMissions = missions.filter((mission) => availableSlots(mission) > 0 && !completedIds.has(mission.id) && !pending.some((item) => item.campaignId === mission.id));
  const selectedView = testerViews.find((item) => item.id === activeView) || testerViews[0];
  const nodeId = validatorNodeId(tester.id);

  return (
      <main id="main-content" className="mobile-app-shell mobile-tester-console min-h-screen bg-[#0A0D12] pb-28 text-zinc-100 lg:pb-12">
        <header className="mobile-app-header sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <Link className="flex min-w-0 items-center gap-2.5" href="/">
              <span className="relative size-7 shrink-0 overflow-hidden rounded-md">
                <Image src="/seedenv-logo-v3.png" alt="SeedEnv" fill sizes="28px" className="object-contain" />
              </span>
              <span className="truncate text-sm font-semibold">Flight Deck</span>
              <span className="hidden font-mono text-[11px] text-zinc-500 sm:inline">{nodeId}</span>
            </Link>
            <div className="hidden lg:block">
              <SegmentedTabLinks
                groupId="tester-console-views"
                label="Tester console"
                activeId={activeView}
                tabs={[
                  ...testerViews.map((item) => ({ id: item.id, label: item.label, href: `/dashboard?view=${item.id}` })),
                  { id: "launch-circle" as const, label: "Launch Circle", href: "/launch-circle" },
                ]}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <CommandPaletteTrigger />
              <StatusPill compact />
              <Link className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-200 transition hover:border-emerald-400/50 hover:text-emerald-100" href="/account?tab=portfolio#stripe-setup">
                {formatCents(pendingPayoutCents)}<span className="hidden sm:inline"> Cash Out</span>
              </Link>
              <Link aria-label="Account" className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-700 hover:text-white sm:min-h-0 sm:px-3" href="/account">
                <Settings className="size-3.5" /><span className="hidden sm:inline">Account</span>
              </Link>
            </div>
          </div>
        </header>

        <div className="mobile-tester-content mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
          {activeView === "missions" ? <>
            {[...new Map([...missions, ...pending.map((item) => item.campaign)].filter((mission) => mission.directionsUpdated).map((mission) => [mission.id, mission])).values()].map((mission) => <p key={mission.id} role="status" className="rounded-lg border border-emerald-500/30 p-4 text-sm">{mission.title}: the developer updated the directions. Your assignment still uses version {mission.acceptedInstructionRevision}; follow your saved steps, not the newer requirements.</p>)}
            {pending.filter((item) => item.denialReviewPending).map((item) => <p role="status" key={item.id} className="rounded border border-amber-500/30 p-4">{item.campaign.title}: ${(item.payoutCents / 100).toFixed(2)} held for manual review. Reason: {item.rejectionReason}</p>)}
            {pending.map((item) => <details key={`directions-${item.id}`} className="rounded-lg border border-zinc-800 p-4">
              <summary className="cursor-pointer text-sm text-emerald-200">{item.campaign.title}: view accepted directions (version {item.campaign.acceptedInstructionRevision ?? "not recorded"})</summary>
              <p className="mt-3 text-xs text-zinc-400">These directions remain available during submission review and reward holds. Later edits do not apply to this work.</p>
              <ol className="mt-4 space-y-4">{item.campaign.instructions.map((step) => <li key={step.id}><h3 className="text-sm font-semibold">{step.stepNumber}. {step.instructionTitle}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{step.instructionDetail}</p><p className="mt-2 text-xs text-zinc-400">Proof: {step.proofType}</p></li>)}</ol>
            </details>)}
          </> : null}
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-emerald-400">{activeView === "reputation" ? "Validator trust profile" : `${formatRankLevel(rank)} · ${progress.label}`}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{activeView === "reputation" ? "Reputation & Clearance" : selectedView.label}</h1>
            <p className="mt-1.5 text-sm leading-6 text-zinc-400">{activeView === "reputation" ? "Track proof verification history, unlock higher-trust opportunities, and build audit credibility." : selectedView.description}</p>
          </div>

          {activeView === "discover" ? <section className="grid grid-cols-2 gap-3 max-sm:[&>*:last-child]:col-span-2 lg:grid-cols-3" aria-label="Flight deck status">
            <DeckCard label="Active in review" value={formatCents(auditCents)} detail={inReview.length ? `${inReview.length} proof${inReview.length === 1 ? "" : "s"} in review${nextReleaseHours !== null ? ` · next auto-release ${nextReleaseHours <= 1 ? "within 1h" : `in ${nextReleaseHours}h`}` : ""}` : "No proofs awaiting review"} />
            <DeckCard label="Available payout" value={formatCents(pendingPayoutCents)} detail={pendingPayoutCents > 0 ? "Approved and waiting for Stripe" : "Approved rewards land here"} />
            <DeckCard label="Lifetime earned" value={formatCents(approved?._sum.payoutCents || 0)} detail={quality === null ? `${approvedCount} approved` : `${approvedCount} approved · ${quality}% approval`} />
          </section> : null}

          {activeView === "reputation" ? <section className="grid gap-4 md:grid-cols-3" aria-label="Reputation summary">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5">
              <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Clearance tier</p>
              <p className="mt-2 text-lg font-semibold text-zinc-100">{formatRankLevel(rank)} · {progress.label}</p>
              <p className="mt-1 font-mono text-sm text-emerald-300">{tester.xpPoints.toLocaleString("en-US")} REP</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${progress.percent}%` }} /></div>
              <p className="mt-2 text-xs text-zinc-500">{progress.remainingXp ? `${progress.remainingXp.toLocaleString("en-US")} REP to ${progress.nextLabel}` : "Maximum clearance reached"}</p>
            </div>
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5">
              <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Verified audits</p>
              <p className="mt-2 text-lg font-semibold text-zinc-100">{approvedCount} approved proof{approvedCount === 1 ? "" : "s"}</p>
              <p className="mt-2 text-xs text-zinc-500">{rejectedCount} not approved · {approvedCount + rejectedCount} reviewed total</p>
            </div>
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5" title="Calculated across approved and not-approved developer reviews.">
              <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Approval ratio</p>
              <p className="mt-2 text-lg font-semibold text-zinc-100">{quality === null ? "--%" : `${quality}%`} first-run pass</p>
              <p className="mt-2 text-xs text-zinc-500">{quality === null ? "Available after your first developer review" : "Calculated across developer-reviewed proof"}</p>
            </div>
          </section> : null}

          {activeView === "clippers" ? <ClipperDashboard data={clippers || { enabled: false, profileStatus: null, reviewNote: null, paidCents: 0, agreements: [] }} now={now} /> : null}
          {(activeView === "missions" || activeView === "discover") && clippers?.enabled ? <Link href="/dashboard?view=clippers" className="block rounded-xl border border-violet-400/25 bg-violet-500/5 p-4 text-sm text-violet-200">Creator work is separate from testing. View your Clippers application, {clippers.agreements.filter((item) => item.status === "INVITED").length} invitations, and {clippers.agreements.filter((item) => item.status === "APPLIED").length} campaign applications →</Link> : null}
          {activeView === "discover" || activeView === "missions" ? <section id="active-missions" className={activeView === "missions" ? "scroll-mt-20" : "scroll-mt-20 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5 sm:p-6"}>
            {activeView === "discover" ? <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Discover missions</h2>
                <p className="mt-1 text-sm text-neutral-400">Test early builds, log reproducible bugs, and earn escrow bounties.</p>
              </div>
              <span className="rounded-md border border-zinc-800 px-2.5 py-1 font-mono text-[11px] text-zinc-400">{newMissions.length} open briefs</span>
            </div> : null}
            <MissionExperience key={activeView} mode={activeView} missions={missions} assignments={pending.map((item) => ({
              id: item.id, campaign: item.campaign, expiresAt: item.expiresAt.toISOString(), submitted: !item.revisionRequestedAt && Boolean(item.feedbackText || item.proofImageUrl),
              revisionRequested: Boolean(item.revisionRequestedAt), revisionStarted: Boolean(item.revisionStartedAt), revisionNote: item.rejectionReason,
              denialReviewPending: item.denialReviewPending,
              feedbackText: item.feedbackText, appRating: item.appRating, proofPreviewUrl: item.proofPreviewUrl, hasScreenshot: Boolean(item.proofImageUrl), hasRecording: isStoredRecording(item.recordingUrl),
              robloxUsername: item.robloxUsername, robloxChecklist: parseRobloxSubmissionChecklist(item.robloxChecklist),
              telemetry: { osBuild: item.osBuild || "", deviceModel: item.deviceModel || "", screenResolution: item.screenResolution || "", appBuildVersion: item.appBuildVersion || "", networkType: item.networkType || "", recordingUrl: isStoredRecording(item.recordingUrl) ? "" : item.recordingUrl || "", crashLogs: item.crashLogs || "", networkLogs: item.networkLogs || "" },
            }))} history={recent.map((item) => ({
              id: item.id, campaignTitle: item.campaign.title, status: item.status, payoutCents: item.payoutCents,
              rejectionReason: item.rejectionReason, expiresAt: item.expiresAt.toISOString(),
            }))} completedCampaignIds={approvedCampaigns.map((item) => item.campaignId)} initialNow={now.getTime()} applications={applications} reputation={tester.xpPoints} discoveryPasses={discoveryPasses} />
          </section> : null}

          {activeView === "reputation" ? <section id="reputation" className="grid scroll-mt-6 gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <div className="flex items-center gap-2 text-emerald-400"><Trophy className="size-5" /><h2 className="text-xs font-semibold uppercase tracking-[0.2em]">Clearance ladder</h2></div>
              <p className="mt-3 text-sm leading-6 text-neutral-400">Clearance is earned through approved contribution history, not time spent online.</p>
              <ol className="mt-6 space-y-3">
                {Object.entries(rankThresholds).map(([tier, threshold], index) => {
                  const reached = tester.xpPoints >= threshold.minXp;
                  return <li key={tier} className={`flex items-center gap-3 rounded-xl border p-4 ${rank === tier ? "border-emerald-500/25 bg-emerald-500/5" : "border-zinc-800 bg-black/10"}`}><span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${reached ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-neutral-600"}`}><ShieldCheck className="size-5" /></span><span className="flex-1 text-sm font-semibold">{formatRankLevel(tier as keyof typeof rankThresholds)} · {threshold.label}<span className="mt-1 block text-xs font-normal text-neutral-500">{index === 0 ? "Entry clearance" : index === 1 ? "Established verification record" : "Advanced validator trust"} · {threshold.minXp.toLocaleString()} REP</span></span>{rank === tier ? <span className="text-xs font-semibold text-emerald-300">Current</span> : reached ? <CheckCircle2 className="size-4 text-emerald-400" /> : null}</li>;
                })}
              </ol>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><h2 className="text-lg font-semibold tracking-tight">Verified milestones</h2><Award className="size-5 text-amber-400" /></div><Link href="/quests" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-black/15 px-3 py-2 font-mono text-[11px] text-zinc-400 transition hover:text-zinc-200"><span>{questXp.toLocaleString("en-US")} Quest XP</span><span className="text-zinc-700">·</span><span>{discoveryPasses} Discovery Pass{discoveryPasses === 1 ? "" : "es"}</span><ArrowRight className="size-3.5" /></Link></div>
              <p className="mt-2 text-sm text-neutral-400">{milestones.filter((item) => item.earned).length} of {milestones.length} earned. Built on your actual mission history.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {milestones.map((milestone) => <div key={milestone.name} className={`rounded-xl border p-4 ${milestone.earned ? "border-amber-400/25 bg-amber-500/5" : "border-zinc-800 bg-black/10"}`}><Medal className={`size-6 ${milestone.earned ? "text-amber-400" : "text-neutral-600"}`} /><h3 className="mt-3 text-sm font-semibold">{milestone.name}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-neutral-500">{milestone.description}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5"><div className={`h-full rounded-full ${milestone.earned ? "bg-amber-400" : "bg-violet-500"}`} style={{ width: `${milestone.percent}%` }} /></div><p className="mt-2 text-xs font-semibold text-neutral-400">{milestone.earned ? "Earned" : `${Math.min(milestone.current, milestone.target).toLocaleString()} / ${milestone.target.toLocaleString()}`}</p></div>)}
              </div>
            </div>
          </section> : null}

          {activeView === "leaderboard" ? <section id="leaderboard" className="scroll-mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <div className="flex items-center justify-between"><h2 className="text-lg font-semibold tracking-tight">Community standouts</h2><Trophy className="size-5 text-amber-400" /></div>
              <p className="mt-2 text-sm text-neutral-400">Top-ranked validators by approved evidence, reproducible findings, and verified REP.</p>
              <LeaderboardTable now={now} entries={leaderboard} currentUser={{ id: tester.id, username: tester.username, xpPoints: tester.xpPoints, rankTier: rank, approvedRuns: approvedCount, passRate: quality }} />
              <Link href="/dashboard?view=discover" className="mt-6 inline-flex items-center gap-2 font-mono text-xs font-semibold text-emerald-400 transition hover:text-emerald-300">Browse Open Cohorts to Earn REP <ArrowRight className="size-3.5" /></Link>
          </section> : null}
        </div>
        <TesterBottomNav />
      </main>
  );
}


function DeckCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="flex flex-col rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4"><p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">{label}</p><p className="mt-2 font-mono text-xl font-semibold text-zinc-100 sm:text-2xl">{value}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p></div>;
}
