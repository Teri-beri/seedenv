import type { AppCampaign, Submission, TaskInstruction, User } from "@prisma/client";
import { SubmissionStatus } from "@prisma/client";
import { ArrowRight, Award, CheckCircle2, CircleDot, Clock3, Compass, Medal, Settings, ShieldCheck, Sparkles, Trophy, WalletCards } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { MissionExperience } from "@/components/mission-experience";
import { TesterBottomNav } from "@/components/navigation";
import { rankForXp, rankProgress, rankThresholds } from "@/lib/rank";
import { approvalRate, availableSlots, testerMilestones, testerViews, type TesterView } from "@/lib/tester-console";
import { formatCents } from "@/lib/utils";

type ConsoleMission = Pick<AppCampaign, "id" | "title" | "appUrl" | "iconUrl" | "targetVibe" | "description" | "bountyPerTaskUsd" | "totalSlots" | "claimedSlots" | "completedSlots" | "platform" | "discoveryAllowed" | "discoveryMinRep"> & { instructions: TaskInstruction[] };

export type TesterConsoleData = {
  activeView: TesterView;
  tester: Pick<User, "id" | "username" | "xpPoints">;
  missions: ConsoleMission[];
  leaderboard: Array<Pick<User, "id" | "username" | "xpPoints">>;
  summary: Array<{ status: SubmissionStatus; _count: { _all: number }; _sum: { payoutCents: number | null } }>;
  recent: Array<Pick<Submission, "id" | "status" | "feedbackText" | "proofImageUrl" | "rejectionReason" | "revisionRequestedAt" | "payoutCents" | "expiresAt"> & { campaign: { title: string } }>;
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
  const completedIds = new Set(approvedCampaigns.map((item) => item.campaignId));
  const newMissions = missions.filter((mission) => availableSlots(mission) > 0 && !completedIds.has(mission.id) && !pending.some((item) => item.campaignId === mission.id));
  const selectedView = testerViews.find((item) => item.id === activeView) || testerViews[0];

  return (
      <main id="main-content" className="mobile-app-shell mobile-tester-console terminal-grid min-h-screen bg-[radial-gradient(ellipse_at_top_left,rgba(109,40,217,0.16),transparent_40%),linear-gradient(180deg,#090A0F,#10131C_45%,#090A0F)] pb-28 text-white lg:pb-12">
        <header className="mobile-app-header border-b border-[#1F2430] bg-[#090A0F]/85">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
            <Link className="flex items-center gap-3" href="/">
              <span className="relative size-10 overflow-hidden rounded-xl border border-[#1F2430]">
                <Image src="/seedenv-logo-v3.png" alt="SeedEnv" fill sizes="40px" className="object-contain" />
              </span>
              <span><span className="block text-xs font-semibold uppercase tracking-[0.25em] text-amber-500">SeedEnv</span><span className="block text-sm font-semibold text-neutral-200">Tester Console</span></span>
            </Link>
            <nav aria-label="Tester console" className="hidden items-center gap-6 text-sm text-neutral-400 lg:flex">
              {testerViews.map((item) => <Link key={item.id} aria-current={activeView === item.id ? "page" : undefined} className={activeView === item.id ? "font-semibold text-violet-200" : "hover:text-white"} href={`/dashboard?view=${item.id}`}>{item.label}</Link>)}
            </nav>
            <Link className="inline-flex items-center gap-2 rounded-xl border border-[#2A2F3D] px-3 py-2 text-sm font-semibold text-neutral-300 hover:border-amber-500/40 hover:text-white" href="/account">
              <Settings className="size-4" /> Settings
            </Link>
          </div>
        </header>

        <div className="mobile-tester-content mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">Tester workspace</p>
            <h1 className="mt-2 text-3xl font-black">{selectedView.label}</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-400">{selectedView.description}</p>
          </div>
          {activeView === "discover" ? <>
          <nav aria-label="Tester opportunities" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Link href="/quests" className="rounded-xl border border-violet-400/25 bg-violet-500/5 p-4 text-sm font-semibold">{questXp.toLocaleString()} Quest XP<span className="mt-1 block text-xs font-normal text-neutral-400">{discoveryPasses} passes / Daily quests & exchange</span></Link>
            <Link href="/applications" className="rounded-xl border border-stroke p-4 text-sm font-semibold">Applications<span className="mt-1 block text-xs font-normal text-neutral-400">Requests & accepted missions</span></Link>
            <Link href="/clippers" className="rounded-xl border border-violet-400/25 p-4 text-sm font-semibold">Clippers<span className="mt-1 block text-xs font-normal text-neutral-400">Creator briefs & paid videos</span></Link>
            <Link href="/community" className="rounded-xl border border-stroke p-4 text-sm font-semibold">Launch Circle<span className="mt-1 block text-xs font-normal text-neutral-400">App updates & conversations</span></Link>
          </nav>
          <section className="mobile-tester-welcome">
            <div className="flex flex-col justify-center">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400"><CircleDot className="size-4" /> Your next great discovery starts here</p>
              <h2 className="mt-4 break-words text-2xl font-black tracking-tight">Welcome back, <span className="text-amber-300">{tester.username}</span>.</h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-neutral-400">Find promising apps. Share feedback that matters. Build a reputation developers can trust.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link className="inline-flex items-center gap-2 rounded-xl border border-[#2A2F3D] px-5 py-3 text-sm font-semibold text-neutral-300 hover:text-white" href="/dashboard?view=missions">My missions <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-violet-200">{active.length + inReview.length}</span><ArrowRight className="size-4" /></Link>
              </div>
            </div>
          </section>
          </> : null}
          {activeView === "reputation" ? <>
            <section className="luxury-panel relative overflow-hidden rounded-2xl p-6" aria-label="Reputation overview">
              <div className="relative flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-200"><ShieldCheck className="size-4" /> {progress.label}</span>
                <span className="text-xs text-neutral-500">Your reputation</span>
              </div>
              <p className="mt-5 font-mono text-4xl font-black">{tester.xpPoints.toLocaleString()} <span className="text-lg font-semibold text-amber-400">REP</span></p>
              <p className="mt-2 text-sm text-neutral-400">{progress.remainingXp > 0 ? `${progress.remainingXp.toLocaleString()} points to ${progress.nextLabel}` : "Apex achieved. Keep setting the standard."}</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-label={`Progress toward ${progress.nextLabel}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.percent)}>
                <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-amber-400" style={{ width: `${progress.percent}%` }} />
              </div>
              <p className="mt-3 text-xs leading-5 text-neutral-500">Earn REP when a developer approves your proof. Clear, useful feedback is your strongest signal.</p>
            </section>

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Tester statistics">
            <Stat icon={<WalletCards className="size-4" />} label="Lifetime earned" value={formatCents(approved?._sum.payoutCents || 0)} detail={`${formatCents(pendingPayoutCents)} awaiting payout`} />
            <Stat icon={<CheckCircle2 className="size-4" />} label="Missions approved" value={String(approvedCount)} detail="Your contribution to real launches" />
            <Stat icon={<ShieldCheck className="size-4" />} label="Approval rate" value={quality === null ? "--" : `${quality}%`} detail={quality === null ? "Appears after your first review" : `${approvedCount + rejectedCount} developer reviews`} />
            <Stat icon={<Compass className="size-4" />} label="New opportunities" value={String(newMissions.length)} detail="Open missions you haven't claimed" />
          </section>
          <Link href="/quests" className="inline-flex items-center gap-2 rounded-xl border border-violet-400/25 p-4 text-sm font-semibold text-violet-200">{questXp.toLocaleString()} Quest XP / {discoveryPasses} Discovery Passes / Open quests & exchange <ArrowRight className="size-4 shrink-0" /></Link>
          <Link href="/account?tab=portfolio" className="inline-flex items-center gap-2 text-sm font-semibold text-amber-300">Manage rewards & payout setup <ArrowRight className="size-4" /></Link>
          </> : null}

          {activeView === "discover" || activeView === "missions" ? <section id="active-missions" className="scroll-mt-6 rounded-2xl border border-[#1F2430] bg-[#0E1017]/70 p-5 sm:p-6">
            {activeView === "missions" ? <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-500">Stay in the flow</p><h2 className="mt-2 text-xl font-bold">Your mission desk</h2></div>
              <span className="rounded-full border border-[#2A2F3D] px-3 py-1 text-xs text-neutral-400">{active.length} in progress / {inReview.length} in review</span>
            </div>
            <Link href="/applications" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-violet-200">Manage applications & accepted invitations <ArrowRight className="size-4" /></Link>
            </> : null}
            <MissionExperience key={activeView} mode={activeView} missions={missions} assignments={pending.map((item) => ({
              id: item.id, campaign: item.campaign, expiresAt: item.expiresAt.toISOString(), submitted: !item.revisionRequestedAt && Boolean(item.feedbackText || item.proofImageUrl),
              revisionRequested: Boolean(item.revisionRequestedAt), revisionStarted: Boolean(item.revisionStartedAt), revisionNote: item.rejectionReason,
              feedbackText: item.feedbackText, proofPreviewUrl: item.proofPreviewUrl, hasScreenshot: Boolean(item.proofImageUrl),
              telemetry: { osBuild: item.osBuild || "", deviceModel: item.deviceModel || "", screenResolution: item.screenResolution || "", appBuildVersion: item.appBuildVersion || "", networkType: item.networkType || "", recordingUrl: item.recordingUrl || "", crashLogs: item.crashLogs || "", networkLogs: item.networkLogs || "" },
            }))} completedCampaignIds={approvedCampaigns.map((item) => item.campaignId)} initialNow={now.getTime()} applications={applications} reputation={tester.xpPoints} discoveryPasses={discoveryPasses} />
          </section> : null}

          {activeView === "reputation" ? <section id="reputation" className="grid scroll-mt-6 gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div className="luxury-panel rounded-2xl p-6">
              <div className="flex items-center gap-2 text-violet-300"><Trophy className="size-5" /><p className="text-xs font-semibold uppercase tracking-[0.2em]">The reputation journey</p></div>
              <h2 className="mt-3 text-2xl font-bold">Small signals. Lasting credibility.</h2>
              <p className="mt-2 text-sm leading-6 text-neutral-400">Your rank reflects approved contributions, not time spent online. No mystery rewards, no points for empty activity.</p>
              <ol className="mt-6 space-y-3">
                {Object.entries(rankThresholds).map(([tier, threshold]) => {
                  const reached = tester.xpPoints >= threshold.minXp;
                  return <li key={tier} className={`flex items-center gap-3 rounded-xl border p-4 ${rank === tier ? "border-violet-400/30 bg-violet-500/10" : "border-[#1F2430] bg-black/10"}`}><span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${reached ? "bg-violet-500/20 text-violet-200" : "bg-white/5 text-neutral-600"}`}><ShieldCheck className="size-5" /></span><span className="flex-1 text-sm font-semibold">{threshold.label}<span className="mt-1 block text-xs font-normal text-neutral-500">{threshold.minXp.toLocaleString()} REP</span></span>{rank === tier ? <span className="text-xs font-semibold text-violet-200">Current</span> : reached ? <CheckCircle2 className="size-4 text-emerald-400" /> : null}</li>;
                })}
              </ol>
            </div>
            <div className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/70 p-6">
              <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">Milestones worth earning</h2><Award className="size-5 text-amber-400" /></div>
              <p className="mt-2 text-sm text-neutral-400">{milestones.filter((item) => item.earned).length} of {milestones.length} earned. Built on your actual mission history.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {milestones.map((milestone) => <div key={milestone.name} className={`rounded-xl border p-4 ${milestone.earned ? "border-amber-400/25 bg-amber-500/5" : "border-[#1F2430] bg-black/10"}`}><Medal className={`size-6 ${milestone.earned ? "text-amber-400" : "text-neutral-600"}`} /><h3 className="mt-3 text-sm font-semibold">{milestone.name}</h3><p className="mt-1 min-h-10 text-xs leading-5 text-neutral-500">{milestone.description}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5"><div className={`h-full rounded-full ${milestone.earned ? "bg-amber-400" : "bg-violet-500"}`} style={{ width: `${milestone.percent}%` }} /></div><p className="mt-2 text-xs font-semibold text-neutral-400">{milestone.earned ? "Earned" : `${Math.min(milestone.current, milestone.target).toLocaleString()} / ${milestone.target.toLocaleString()}`}</p></div>)}
              </div>
            </div>
          </section> : null}

          {activeView === "missions" ? <section className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/70 p-6">
              <h2 className="text-xl font-bold">Your recent activity</h2>
              <p className="mt-2 text-sm text-neutral-400">A clear record of your work and developer decisions.</p>
              <div className="mt-5 space-y-3">
                {recent.length ? recent.map((item) => {
                  const submitted = Boolean(item.feedbackText || item.proofImageUrl);
                  const status = item.status === "APPROVED" ? "Approved" : item.status === "REJECTED" ? "Not approved" : item.revisionRequestedAt ? "Revision requested" : item.status === "EXPIRED" || (!submitted && item.expiresAt <= now) ? "Expired" : submitted ? "In review" : "In progress";
                  return <div className="flex gap-3 rounded-xl border border-[#1F2430] p-4" key={item.id}><span className={`mt-0.5 ${item.status === "APPROVED" ? "text-emerald-400" : "text-neutral-500"}`}>{item.status === "APPROVED" ? <CheckCircle2 className="size-4" /> : <Clock3 className="size-4" />}</span><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{item.campaign.title}</p><p className="mt-1 text-xs text-neutral-500">{status}{item.status === "APPROVED" ? ` / ${formatCents(item.payoutCents)} earned` : ""}</p>{item.rejectionReason ? <p className="mt-2 break-words text-xs leading-5 text-rose-300">{item.rejectionReason}</p> : null}</div></div>;
                }) : <div className="rounded-xl border border-dashed border-[#2A2F3D] p-6 text-center"><Sparkles className="mx-auto size-6 text-violet-300" /><p className="mt-3 text-sm font-semibold">Your first contribution belongs here.</p><p className="mt-2 text-xs leading-5 text-neutral-500">Explore a mission, follow the brief, and submit your own proof.</p></div>}
              </div>
          </section> : null}
          {activeView === "leaderboard" ? <section id="leaderboard" className="scroll-mt-6 rounded-2xl border border-[#1F2430] bg-[#0E1017]/70 p-6">
              <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Community standouts</h2><Trophy className="size-5 text-amber-400" /></div>
              <p className="mt-2 text-sm text-neutral-400">Top contributors by lifetime reputation.</p>
              <ol className="mt-5 space-y-2">
                {leaderboard.map((user, index) => <li key={user.id} className={`flex items-center gap-3 rounded-xl p-3 ${user.id === tester.id ? "border border-violet-400/25 bg-violet-500/10" : "bg-black/10"}`}><span className={`w-6 text-center font-mono text-sm font-bold ${index === 0 ? "text-amber-400" : "text-neutral-500"}`}>{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-semibold">{user.username}{user.id === tester.id ? <span className="ml-2 text-xs font-normal text-violet-300">You</span> : null}</span><span className="font-mono text-xs text-amber-300">{user.xpPoints.toLocaleString()} REP</span></li>)}
              </ol>
              {!leaderboard.length ? <p className="mt-6 text-sm text-neutral-500">The leaderboard starts with the first approved mission. Help set the pace.</p> : null}
              <div className="mt-6 rounded-xl border border-[#1F2430] p-4"><p className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="size-4 text-emerald-400" /> Quality over quantity</p><p className="mt-2 text-xs leading-6 text-neutral-500">Describe what you tried, what you expected, and what happened. Original screenshots and reproducible feedback help developers make better products.</p></div>
              <Link href="/account?tab=portfolio" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-amber-300 hover:text-amber-200">View rewards & payout setup <ArrowRight className="size-4" /></Link>
          </section> : null}
        </div>
        <TesterBottomNav />
      </main>
  );
}

function Stat({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/70 p-4 sm:p-5"><p className="flex items-center gap-2 text-xs text-neutral-400"><span className="text-violet-300">{icon}</span>{label}</p><p className="mt-3 font-mono text-2xl font-bold sm:text-3xl">{value}</p><p className="mt-2 text-xs leading-5 text-neutral-500">{detail}</p></div>;
}
