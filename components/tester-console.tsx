import type { AppCampaign, Submission, TaskInstruction, User } from "@prisma/client";
import { SubmissionStatus } from "@prisma/client";
import { ArrowRight, Award, CheckCircle2, Clock3, Medal, Settings, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ProfileLink } from "@/components/profile-link";
import { FlightDeckCashout } from "@/components/flight-deck-cashout";
import { MissionExperience } from "@/components/mission-experience";
import { TesterBottomNav } from "@/components/navigation";
import { rankForXp, rankProgress, rankThresholds } from "@/lib/rank";
import { approvalRate, availableSlots, testerMilestones, testerViews, type TesterView } from "@/lib/tester-console";
import { isStoredRecording } from "@/lib/recording";
import { autoApproveDeadlineFrom as autoApproveDeadline } from "@/lib/auto-approval-window";
import { formatCents } from "@/lib/utils";
import { formatRankLevel, validatorNodeId } from "@/lib/validator-identity";

type ConsoleMission = Pick<AppCampaign, "id" | "title" | "appUrl" | "iconUrl" | "targetVibe" | "description" | "bountyPerTaskUsd" | "totalSlots" | "claimedSlots" | "completedSlots" | "platform" | "discoveryAllowed" | "discoveryMinRep" | "estimatedMinutes" | "testerPerk"> & { instructions: TaskInstruction[]; acceptedInstructionRevision?: number; directionsUpdated?: boolean; ownedByTester?: boolean };

export type TesterConsoleData = {
  activeView: TesterView;
  tester: Pick<User, "id" | "username" | "xpPoints" | "stripeConnectAccountId">;
  missions: ConsoleMission[];
  leaderboard: Array<Pick<User, "id" | "username" | "xpPoints">>;
  summary: Array<{ status: SubmissionStatus; _count: { _all: number }; _sum: { payoutCents: number | null } }>;
  recent: Array<Pick<Submission, "id" | "status" | "feedbackText" | "proofImageUrl" | "rejectionReason" | "revisionRequestedAt" | "payoutCents" | "expiresAt"> & { denialReviewPending?: boolean; campaign: { title: string } }>;
  pending: Array<Submission & { campaign: ConsoleMission; proofPreviewUrl: string | null }>;
  approvedCampaigns: Array<{ campaignId: string }>;
  pendingPayoutCents: number;
  now: Date;
  applications: Array<{ campaignId: string; status: string; startBy: string | null }>;
  questXp: number;
  discoveryPasses: number;
};

export function TesterConsole({ activeView, tester, missions, leaderboard, summary, recent, pending, approvedCampaigns, pendingPayoutCents, now, applications, questXp, discoveryPasses }: TesterConsoleData) {
  const approved = summary.find((item) => item.status === SubmissionStatus.APPROVED);
  const approvedCount = approved?._count._all || 0;
  const rejectedCount = summary.find((item) => item.status === SubmissionStatus.REJECTED)?._count._all || 0;
  const quality = approvalRate(approvedCount, rejectedCount);
  const rank = rankForXp(tester.xpPoints);
  const progress = rankProgress(rank, tester.xpPoints);
  const milestones = testerMilestones(approvedCount, tester.xpPoints);
  const inReview = pending.filter((item) => !item.revisionRequestedAt && Boolean(item.feedbackText || item.proofImageUrl));
  const active = pending.filter((item) => item.revisionRequestedAt || (!item.feedbackText && !item.proofImageUrl && item.expiresAt > now));
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
            <nav aria-label="Tester console" className="hidden items-center gap-1 lg:flex">
              {testerViews.map((item) => <Link key={item.id} aria-current={activeView === item.id ? "page" : undefined} className={activeView === item.id ? activeTab : inactiveTab} href={`/dashboard?view=${item.id}`}>{item.label}</Link>)}
              <Link className={inactiveTab} href="/community">Launch Circle</Link>
            </nav>
            <Link className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-700 hover:text-white" href="/account">
              <Settings className="size-3.5" /> Account
            </Link>
          </div>
        </header>

        <div className="mobile-tester-content mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
          <p className="rounded-xl border border-amber-500/30 p-4 text-sm text-amber-100">Rewards require genuine work that meets the published instructions, evidence standards, and any stated participation period (including 14 continuous days where required). If a developer denies your work, only that submission&apos;s unpaid reward is held for manual review; automatic approval pauses. An operator may approve payment or confirm the denial. Other earnings and money already paid are unaffected. <Link className="underline" href="/terms">Read the reward and review terms.</Link></p>
          <p className="text-sm text-emerald-200">Your work will be reviewed against the instructions you accepted. Later edits will not change your reward eligibility.</p>
          {[...new Map([...missions, ...pending.map((item) => item.campaign)].filter((mission) => mission.directionsUpdated).map((mission) => [mission.id, mission])).values()].map((mission) => <p key={mission.id} role="status" className="rounded-lg border border-emerald-500/30 p-4 text-sm">{mission.title}: the developer updated the directions. Your assignment still uses version {mission.acceptedInstructionRevision}; follow your saved steps, not the newer requirements.</p>)}
          {pending.filter((item) => item.denialReviewPending).map((item) => <p role="status" key={item.id} className="rounded border border-amber-500/30 p-4">{item.campaign.title}: ${(item.payoutCents / 100).toFixed(2)} held for manual review. Reason: {item.rejectionReason}</p>)}
          {pending.map((item) => <details key={`directions-${item.id}`} className="rounded-lg border border-zinc-800 p-4">
            <summary className="cursor-pointer text-sm text-emerald-200">{item.campaign.title}: view accepted directions (version {item.campaign.acceptedInstructionRevision ?? "not recorded"})</summary>
            <p className="mt-3 text-xs text-zinc-400">These directions remain available during submission review and reward holds. Later edits do not apply to this work.</p>
            <ol className="mt-4 space-y-4">{item.campaign.instructions.map((step) => <li key={step.id}><h3 className="text-sm font-semibold">{step.stepNumber}. {step.instructionTitle}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{step.instructionDetail}</p><p className="mt-2 text-xs text-zinc-400">Proof: {step.proofType}</p></li>)}</ol>
          </details>)}
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-emerald-400">{formatRankLevel(rank)} · {progress.label}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{selectedView.label}</h1>
            <p className="mt-1.5 text-sm leading-6 text-zinc-400">{selectedView.description}</p>
          </div>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Flight deck status">
            <DeckCard label="Clearance" value={formatRankLevel(rank)} detail={progress.remainingXp > 0 ? `${progress.remainingXp.toLocaleString("en-US")} REP to ${progress.nextLabel}` : "Top clearance reached"}>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-label={`Progress toward ${progress.nextLabel}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.percent)}>
                <div className="h-full rounded-full bg-emerald-400" style={{ width: `${progress.percent}%` }} />
              </div>
            </DeckCard>
            <DeckCard label="Pending audits" value={formatCents(auditCents)} detail={inReview.length ? `${inReview.length} proof${inReview.length === 1 ? "" : "s"} in review${nextReleaseHours !== null ? ` · next auto-release ${nextReleaseHours <= 1 ? "within 1h" : `in ${nextReleaseHours}h`}` : ""}` : "No proofs awaiting review"} />
            <DeckCard label="Ready for cashout" value={formatCents(pendingPayoutCents)} detail={pendingPayoutCents > 0 ? "Approved and waiting for Stripe" : "Approved rewards land here"}>
              <FlightDeckCashout readyCents={pendingPayoutCents} stripeConnected={Boolean(tester.stripeConnectAccountId)} />
            </DeckCard>
            <DeckCard label="Lifetime earned" value={formatCents(approved?._sum.payoutCents || 0)} detail={quality === null ? `${approvedCount} approved` : `${approvedCount} approved · ${quality}% approval`} />
          </section>

          {activeView === "discover" ? <>
          <nav aria-label="Tester opportunities" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link href="/dashboard?view=missions" className={shortcut}>My missions<span className={shortcutDetail}>{active.length} in progress · {inReview.length} in review</span></Link>
            <Link href="/applications" className={shortcut}>Applications<span className={shortcutDetail}>Requests & accepted missions</span></Link>
            <Link href="/messages" className={shortcut}>Messages<span className={shortcutDetail}>Private inbox & message requests</span></Link>
            <Link href="/quests" className={shortcut}>{questXp.toLocaleString("en-US")} Quest XP<span className={shortcutDetail}>{discoveryPasses} passes · daily quests</span></Link>
            <Link href="/clippers" className={shortcut}>Clippers<span className={shortcutDetail}>Creator briefs & paid videos</span></Link>
          </nav>
          </> : null}

          {activeView === "reputation" ? <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Tester statistics">
            <DeckCard label="Reputation" value={`${tester.xpPoints.toLocaleString("en-US")} REP`} detail="Earned from approved proofs" />
            <DeckCard label="Missions approved" value={String(approvedCount)} detail="Your contribution to real launches" />
            <DeckCard label="Approval rate" value={quality === null ? "--" : `${quality}%`} detail={quality === null ? "Appears after your first review" : `${approvedCount + rejectedCount} developer reviews`} />
            <DeckCard label="Open missions" value={String(newMissions.length)} detail="Missions you haven't claimed" />
          </section>
          <Link href="/quests" className="inline-flex items-center gap-2 font-mono text-xs text-zinc-400 hover:text-zinc-200">{questXp.toLocaleString("en-US")} Quest XP · {discoveryPasses} Discovery Passes · Open quests <ArrowRight className="size-3.5 shrink-0" /></Link>
          </> : null}

          {activeView === "discover" || activeView === "missions" ? <section id="active-missions" className="scroll-mt-20 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5 sm:p-6">
            {activeView === "missions" ? <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">Your mission desk</h2>
              <span className="rounded-md border border-zinc-800 px-2.5 py-1 font-mono text-[11px] text-zinc-400">{active.length} in progress · {inReview.length} in review</span>
            </div>
            <Link href="/applications" className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200">Manage applications & accepted invitations <ArrowRight className="size-3.5" /></Link>
            </> : null}
            <MissionExperience key={activeView} mode={activeView} missions={missions} assignments={pending.map((item) => ({
              id: item.id, campaign: item.campaign, expiresAt: item.expiresAt.toISOString(), submitted: !item.revisionRequestedAt && Boolean(item.feedbackText || item.proofImageUrl),
              revisionRequested: Boolean(item.revisionRequestedAt), revisionStarted: Boolean(item.revisionStartedAt), revisionNote: item.rejectionReason,
              denialReviewPending: item.denialReviewPending,
              feedbackText: item.feedbackText, proofPreviewUrl: item.proofPreviewUrl, hasScreenshot: Boolean(item.proofImageUrl), hasRecording: isStoredRecording(item.recordingUrl),
              telemetry: { osBuild: item.osBuild || "", deviceModel: item.deviceModel || "", screenResolution: item.screenResolution || "", appBuildVersion: item.appBuildVersion || "", networkType: item.networkType || "", recordingUrl: isStoredRecording(item.recordingUrl) ? "" : item.recordingUrl || "", crashLogs: item.crashLogs || "", networkLogs: item.networkLogs || "" },
            }))} completedCampaignIds={approvedCampaigns.map((item) => item.campaignId)} initialNow={now.getTime()} applications={applications} reputation={tester.xpPoints} discoveryPasses={discoveryPasses} />
          </section> : null}

          {activeView === "reputation" ? <section id="reputation" className="grid scroll-mt-6 gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <div className="flex items-center gap-2 text-emerald-400"><Trophy className="size-5" /><p className="text-xs font-semibold uppercase tracking-[0.2em]">The reputation journey</p></div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight">Small signals. Lasting credibility.</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-400">Your rank reflects approved contributions, not time spent online. No mystery rewards, no points for empty activity.</p>
              <ol className="mt-6 space-y-3">
                {Object.entries(rankThresholds).map(([tier, threshold]) => {
                  const reached = tester.xpPoints >= threshold.minXp;
                  return <li key={tier} className={`flex items-center gap-3 rounded-xl border p-4 ${rank === tier ? "border-emerald-500/25 bg-emerald-500/5" : "border-zinc-800 bg-black/10"}`}><span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${reached ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-neutral-600"}`}><ShieldCheck className="size-5" /></span><span className="flex-1 text-sm font-semibold">{threshold.label}<span className="mt-1 block text-xs font-normal text-neutral-500">{threshold.minXp.toLocaleString()} REP</span></span>{rank === tier ? <span className="text-xs font-semibold text-emerald-300">Current</span> : reached ? <CheckCircle2 className="size-4 text-emerald-400" /> : null}</li>;
                })}
              </ol>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold tracking-tight">Milestones worth earning</h2><Award className="size-5 text-amber-400" /></div>
              <p className="mt-2 text-sm text-neutral-400">{milestones.filter((item) => item.earned).length} of {milestones.length} earned. Built on your actual mission history.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {milestones.map((milestone) => <div key={milestone.name} className={`rounded-xl border p-4 ${milestone.earned ? "border-amber-400/25 bg-amber-500/5" : "border-zinc-800 bg-black/10"}`}><Medal className={`size-6 ${milestone.earned ? "text-amber-400" : "text-neutral-600"}`} /><h3 className="mt-3 text-sm font-semibold">{milestone.name}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-neutral-500">{milestone.description}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5"><div className={`h-full rounded-full ${milestone.earned ? "bg-amber-400" : "bg-violet-500"}`} style={{ width: `${milestone.percent}%` }} /></div><p className="mt-2 text-xs font-semibold text-neutral-400">{milestone.earned ? "Earned" : `${Math.min(milestone.current, milestone.target).toLocaleString()} / ${milestone.target.toLocaleString()}`}</p></div>)}
              </div>
            </div>
          </section> : null}

          {activeView === "missions" ? <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <h2 className="text-lg font-semibold tracking-tight">Your recent activity</h2>
              <p className="mt-2 text-sm text-neutral-400">A clear record of your work and developer decisions.</p>
              <div className="mt-5 space-y-3">
                {recent.length ? recent.map((item) => {
                  const submitted = Boolean(item.feedbackText || item.proofImageUrl);
                  const status = item.status === "APPROVED" ? "Approved" : item.status === "REJECTED" ? "Not approved" : item.denialReviewPending ? "Held for manual review" : item.revisionRequestedAt ? "Revision requested" : item.status === "EXPIRED" || (!submitted && item.expiresAt <= now) ? "Expired" : submitted ? "In review" : "In progress";
                  return <div className="flex gap-3 rounded-xl border border-zinc-800 p-4" key={item.id}><span className={`mt-0.5 ${item.status === "APPROVED" ? "text-emerald-400" : "text-neutral-500"}`}>{item.status === "APPROVED" ? <CheckCircle2 className="size-4" /> : <Clock3 className="size-4" />}</span><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{item.campaign.title}</p><p className="mt-1 text-xs text-neutral-500">{status}{item.status === "APPROVED" ? ` / ${formatCents(item.payoutCents)} earned` : ""}</p>{item.rejectionReason ? <p className="mt-2 break-words text-xs leading-5 text-rose-300">{item.rejectionReason}</p> : null}</div></div>;
                }) : <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center"><Sparkles className="mx-auto size-6 text-emerald-400" /><p className="mt-3 text-sm font-semibold">Your first contribution belongs here.</p><p className="mt-2 text-xs leading-5 text-neutral-500">Explore a mission, follow the brief, and submit your own proof.</p></div>}
              </div>
          </section> : null}
          {activeView === "leaderboard" ? <section id="leaderboard" className="scroll-mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
              <div className="flex items-center justify-between"><h2 className="text-lg font-semibold tracking-tight">Community standouts</h2><Trophy className="size-5 text-amber-400" /></div>
              <p className="mt-2 text-sm text-neutral-400">Top contributors by lifetime reputation.</p>
              <ol className="mt-5 space-y-2">
                {leaderboard.map((user, index) => <li key={user.id} className={`flex items-center gap-3 rounded-xl p-3 ${user.id === tester.id ? "border border-emerald-500/25 bg-emerald-500/5" : "bg-black/10"}`}><span className={`w-6 text-center font-mono text-sm font-bold ${index === 0 ? "text-amber-400" : "text-neutral-500"}`}>{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-semibold"><ProfileLink username={user.username} />{user.id === tester.id ? <span className="ml-2 text-xs font-normal text-emerald-400">You</span> : null}</span><span className="font-mono text-xs text-amber-300">{user.xpPoints.toLocaleString()} REP</span></li>)}
              </ol>
              {!leaderboard.length ? <p className="mt-6 text-sm text-neutral-500">The leaderboard starts with the first approved mission. Help set the pace.</p> : null}
              <div className="mt-6 rounded-xl border border-zinc-800 p-4"><p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-emerald-400" /> Quality over quantity</p><p className="mt-2 text-xs leading-6 text-neutral-500">Describe what you tried, what you expected, and what happened. Original screenshots and reproducible feedback help developers make better products.</p></div>
              <Link href="/account?tab=portfolio" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-zinc-300 hover:text-white">View rewards & payout setup <ArrowRight className="size-4" /></Link>
          </section> : null}
        </div>
        <TesterBottomNav />
      </main>
  );
}

const activeTab = "rounded-md bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-white";
const inactiveTab = "rounded-md px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200";
const shortcut = "rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm font-semibold transition-colors hover:border-zinc-700";
const shortcutDetail = "mt-1 block text-xs font-normal text-zinc-500";

function DeckCard({ label, value, detail, children }: { label: string; value: string; detail: string; children?: React.ReactNode }) {
  return <div className="flex flex-col rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4"><p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">{label}</p><p className="mt-2 font-mono text-xl font-semibold text-zinc-100 sm:text-2xl">{value}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>{children}</div>;
}
