"use client";

import confetti from "canvas-confetti";
import { motion, useAnimate, useReducedMotion } from "framer-motion";
import { ArrowUpRight, CheckCircle2, Clock3, Compass, Search, ShieldCheck, Sparkles, UploadCloud, X } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { claimTaskSlot, startSubmissionRevision, submitTaskProof } from "@/app/actions/submissionActions";
import { collectHardwareSignals } from "@/lib/hardware-integrity";
import { Button } from "@/components/ui/button";
import { xpForBounty } from "@/lib/rank";
import { availableSlots, discoverMissions, type MissionFilter, type MissionSort } from "@/lib/tester-console";
import { formatCents } from "@/lib/utils";
import { requestMission } from "@/app/actions/applicationActions";
import { MemberAction } from "@/components/member-action";
import { applicationEligibility } from "@/lib/quest-rules";
import Link from "next/link";

type Instruction = {
  id: string;
  stepNumber: number;
  instructionTitle: string;
  instructionDetail: string;
  proofType: string;
  minimumRep?: number;
};

type Mission = {
  id: string;
  title: string;
  appUrl: string;
  iconUrl: string | null;
  targetVibe: string;
  description: string;
  bountyPerTaskUsd: number;
  totalSlots: number;
  claimedSlots: number;
  completedSlots: number;
  platform: string;
  discoveryAllowed?: boolean;
  discoveryMinRep?: number;
  estimatedMinutes?: number | null;
  testerPerk?: string | null;
  instructions: Instruction[];
};

type ProofTelemetry = { osBuild: string; deviceModel: string; screenResolution: string; appBuildVersion: string; networkType: string; recordingUrl: string; crashLogs: string; networkLogs: string };
type Assignment = { id: string; campaign: Mission; expiresAt: string; submitted: boolean; revisionRequested?: boolean; revisionStarted?: boolean; revisionNote?: string | null; feedbackText?: string | null; proofPreviewUrl?: string | null; hasScreenshot?: boolean; hasRecording?: boolean; telemetry?: ProofTelemetry };

const noAssignments: Assignment[] = [];
const noCompletedCampaigns: string[] = [];

const filters: Array<{ id: MissionFilter; label: string }> = [
  { id: "all", label: "All missions" },
  { id: "WEB_STAGING", label: "Web apps" },
  { id: "TESTFLIGHT", label: "iOS / TestFlight" },
  { id: "PLAY_STORE", label: "Android" },
  { id: "high-bounty", label: "$5+ rewards" },
];

const platformLabels: Record<string, string> = { WEB_STAGING: "Web · PWA", TESTFLIGHT: "iOS · TestFlight", PLAY_STORE: "Android · Play" };
const recordingTypes = ["video/mp4", "video/quicktime", "video/webm"];
const maxRecordingBytes = 50 * 1024 * 1024;

function hourlyEquivalent(bountyUsd: number, minutes: number) {
  return formatCents(Math.round((bountyUsd / minutes) * 60 * 100));
}

async function hashFile(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function Countdown({ expiresAt }: { expiresAt: Date | null }) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timeout = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);
  if (!expiresAt || now === 0) return <span>--:--</span>;
  const remaining = Math.max(0, expiresAt.getTime() - now);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return <span>{minutes}:{String(seconds).padStart(2, "0")}</span>;
}

export function MissionExperience({ mode, missions, assignments = noAssignments, completedCampaignIds = noCompletedCampaigns, initialNow = 0, applications = [], reputation = 0, discoveryPasses = 0 }: { mode: "discover" | "missions"; missions: Mission[]; assignments?: Assignment[]; completedCampaignIds?: string[]; initialNow?: number; applications?: Array<{ campaignId: string; status: string; startBy: string | null }>; reputation?: number; discoveryPasses?: number }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MissionFilter>("all");
  const [sort, setSort] = useState<MissionSort>("reward");
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [proofHash, setProofHash] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [proofSubmitted, setProofSubmitted] = useState(false);
  const [revisionNote, setRevisionNote] = useState<string | null>(null);
  const [retainedScreenshot, setRetainedScreenshot] = useState(false);
  const [storedRecording, setStoredRecording] = useState(false);
  const [recordingUpload, setRecordingUpload] = useState<{ state: "idle" | "uploading" | "error"; name?: string; message?: string }>({ state: "idle" });
  const [now, setNow] = useState(initialNow);
  const [telemetry, setTelemetry] = useState({ osBuild: "", deviceModel: "", screenResolution: "", appBuildVersion: "", networkType: "", recordingUrl: "", crashLogs: "", networkLogs: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [scope, animate] = useAnimate();
  const autoClaimedMission = useRef<string | null>(null);
  const fileVersion = useRef(0);

  const payoutCents = activeMission ? Math.round(activeMission.bountyPerTaskUsd * 100) : 0;
  const xpGain = xpForBounty(payoutCents);

  const filteredMissions = useMemo(() => discoverMissions(missions, query, filter, sort), [missions, query, filter, sort]);
  const activeAssignments = assignments.filter((item) => !item.submitted && (item.revisionRequested || new Date(item.expiresAt).getTime() > now));
  const expired = Boolean(expiresAt && now > 0 && expiresAt.getTime() <= now);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timeout = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(timeout); window.clearInterval(interval); };
  }, []);

  const resetProof = useCallback(() => {
    fileVersion.current += 1;
    setSelectedFile(null);
    setPreview(null);
    setProofHash(null);
    setFeedback("");
    setTelemetry({ osBuild: "", deviceModel: "", screenResolution: "", appBuildVersion: "", networkType: "", recordingUrl: "", crashLogs: "", networkLogs: "" });
    setProofSubmitted(false);
    setRevisionNote(null);
    setRetainedScreenshot(false);
    setStoredRecording(false);
    setRecordingUpload({ state: "idle" });
  }, []);

  const openAssignment = useCallback((assignment: Assignment) => {
    if (assignment.revisionRequested && (!assignment.revisionStarted || new Date(assignment.expiresAt).getTime() <= Date.now())) {
      startTransition(async () => {
        try {
          const updated = await startSubmissionRevision(assignment.id);
          resetProof();
          setActiveMission(assignment.campaign);
          setSubmissionId(assignment.id);
          setExpiresAt(new Date(updated.expiresAt));
          setFeedback(updated.feedbackText || "");
          setPreview(assignment.proofPreviewUrl || null);
          setRetainedScreenshot(Boolean(updated.proofImageUrl));
          setStoredRecording(Boolean(assignment.hasRecording));
          setRevisionNote(updated.rejectionReason);
          if (assignment.telemetry) setTelemetry(assignment.telemetry);
          setMessage("Revision started. You have 30 minutes to update and submit your feedback.");
          router.refresh();
        } catch (error) { setMessage(error instanceof Error ? error.message : "Could not start this revision."); }
      });
      return;
    }
    resetProof();
    setMessage(null);
    setActiveMission(assignment.campaign);
    setSubmissionId(assignment.id);
    setExpiresAt(new Date(assignment.expiresAt));
    setProofSubmitted(assignment.submitted);
    if (assignment.revisionRequested) {
      setRevisionNote(assignment.revisionNote || null);
      setRetainedScreenshot(Boolean(assignment.hasScreenshot));
      setStoredRecording(Boolean(assignment.hasRecording));
      setFeedback(assignment.feedbackText || "");
      setPreview(assignment.proofPreviewUrl || null);
      if (assignment.telemetry) setTelemetry(assignment.telemetry);
    }
  }, [resetProof, router]);

  const handleClaim = useCallback(async (mission: Mission) => {
    if (mode === "discover") {
      router.push(`/dashboard?view=missions&claim=${encodeURIComponent(mission.id)}`);
      return;
    }
    const assignment = assignments.find((item) => item.campaign.id === mission.id);
    if (assignment) {
      openAssignment(assignment);
      return;
    }
    setMessage(null);
    startTransition(async () => {
      try {
        const submission = await claimTaskSlot(mission.id);
        resetProof();
        setActiveMission(mission);
        setSubmissionId(submission.id);
        setExpiresAt(new Date(submission.expiresAt));
        setProofSubmitted(Boolean(submission.feedbackText || submission.proofImageUrl));
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not claim this mission.");
      }
    });
  }, [mode, assignments, openAssignment, resetProof, router]);

  useEffect(() => {
    if (!activeMission) return;
    scope.current?.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "nearest" });
  }, [activeMission, reducedMotion, scope]);

  useEffect(() => {
    const claimId = searchParams.get("claim");
    if (!claimId || autoClaimedMission.current === claimId) return;
    const mission = missions.find((item) => item.id === claimId) || assignments.find((item) => item.campaign.id === claimId)?.campaign;
    if (!mission) return;
    if (completedCampaignIds.includes(mission.id)) return;
    const timeout = window.setTimeout(() => {
      autoClaimedMission.current = claimId;
      void handleClaim(mission);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [missions, assignments, searchParams, completedCampaignIds, handleClaim]);

  async function handleFile(file: File | null) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessage("Choose a PNG, JPEG, or WebP screenshot.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("Proof screenshots must be under 5MB.");
      return;
    }
    const version = ++fileVersion.current;
    try {
      const [dataUrl, hash] = await Promise.all([readFileAsDataUrl(file), hashFile(file)]);
      if (version !== fileVersion.current) return;
      setSelectedFile(file);
      setPreview(dataUrl);
      setProofHash(hash);
      setMessage(null);
    } catch (error) {
      console.error("SeedEnv proof screenshot preparation failed:", error);
      if (version === fileVersion.current) setMessage("Could not read that screenshot. Please choose it again.");
    }
  }

  async function handleRecording(file: File | null) {
    if (!file || !submissionId) return;
    if (!recordingTypes.includes(file.type)) {
      setRecordingUpload({ state: "error", message: "Choose an MP4, MOV, or WebM screen recording." });
      return;
    }
    if (file.size > maxRecordingBytes) {
      setRecordingUpload({ state: "error", message: "Recordings must be 50MB or smaller. Trim it or paste a share link instead." });
      return;
    }
    setRecordingUpload({ state: "uploading", name: file.name });
    try {
      const response = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/recording`, { method: "POST", headers: { "Content-Type": file.type }, body: file });
      const result = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Upload failed. Try again or paste a share link instead.");
      setStoredRecording(true);
      setTelemetry((current) => ({ ...current, recordingUrl: "" }));
      setRecordingUpload({ state: "idle", name: file.name });
    } catch (error) {
      setRecordingUpload({ state: "error", message: error instanceof Error ? error.message : "Upload failed." });
    }
  }

  function celebrate() {
    if (reducedMotion) return;
    confetti({ particleCount: 180, spread: 82, origin: { y: 0.68 }, colors: ["#10B981", "#34D399", "#A7F3D0", "#F4F4F5"] });
    void animate(scope.current, { scale: [0.96, 1.04, 1], opacity: [0.6, 1] }, { duration: 0.7 });
  }

  async function handleSubmit() {
    if (proofSubmitted || expired) return;
    if (!submissionId || (!retainedScreenshot && (!selectedFile || !preview || !proofHash))) {
      setMessage("Add a proof screenshot before submitting.");
      return;
    }
    startTransition(async () => {
      try {
        const hardware = await collectHardwareSignals().catch(() => null);
        await submitTaskProof(submissionId, {
          hardware,
          ...(selectedFile && preview && proofHash ? { proofImageBase64: preview, proofImageMimeType: selectedFile.type, proofImageHash: proofHash } : {}),
          feedbackText: feedback,
          ...telemetry,
        });
        celebrate();
        setProofSubmitted(true);
        setMessage(`Proof submitted. ${formatCents(payoutCents)} and ${xpGain} REP are earned on approval. If the developer doesn't review it within 48 hours, it's approved automatically.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not submit proof.");
      }
    });
  }

  return (
    <div className="mt-5 space-y-6">
      {mode === "missions" ? <div className="grid gap-3 sm:grid-cols-2">
        {assignments.filter((item) => item.submitted || activeAssignments.some((active) => active.id === item.id)).map((assignment) => (
          <button key={assignment.id} type="button" disabled={isPending} onClick={() => openAssignment(assignment)} className="flex min-w-0 w-full items-center gap-3 rounded-xl border border-zinc-800 bg-black/15 p-4 text-left transition hover:border-zinc-700 disabled:opacity-50">
            {assignment.submitted ? <CheckCircle2 className="size-5 shrink-0 text-emerald-400" /> : <Clock3 className="size-5 shrink-0 text-amber-400" />}
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{assignment.campaign.title}</span><span className="mt-1 block text-xs text-neutral-500">{assignment.revisionRequested ? assignment.revisionStarted && new Date(assignment.expiresAt).getTime() > now ? "Resume requested revision" : "Start revision / fresh 30-minute window" : assignment.submitted ? "Proof received / awaiting developer review" : "Resume your claimed mission"}</span></span>
            {!assignment.submitted && (!assignment.revisionRequested || (assignment.revisionStarted && new Date(assignment.expiresAt).getTime() > now)) ? <span className="font-mono text-xs text-amber-300"><Countdown expiresAt={new Date(assignment.expiresAt)} /></span> : null}
          </button>
        ))}
        {!activeAssignments.length && !assignments.some((item) => item.submitted) ? <div className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm leading-6 text-neutral-500 sm:col-span-2"><p>No missions in progress yet.</p><Link href="/dashboard?view=discover" className="mt-2 inline-block font-semibold text-emerald-300">Discover your next mission</Link></div> : null}
      </div> : null}
      <section id="tester-hub" className="scroll-mt-6" aria-label={mode === "discover" ? "Mission discovery" : "Mission proof workspace"}>
      {mode === "discover" ? <div className="min-w-0 space-y-4">
        <div><h2 className="text-lg font-semibold tracking-tight">Find your next mission</h2><p className="mt-1 text-sm text-neutral-400">Choose your platform, follow the brief, make an impact.</p></div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-zinc-800 bg-black/15 px-3"><Search className="size-4 shrink-0 text-neutral-500" /><span className="sr-only">Search missions</span><input className="min-w-0 w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-neutral-500" placeholder="Search apps, briefs, or interests..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label className="shrink-0"><span className="sr-only">Sort missions</span><select value={sort} onChange={(event) => setSort(event.target.value === "slots" ? "slots" : "reward")} className="w-full rounded-xl border border-zinc-800 bg-[#0E1017] px-3 py-3 text-sm text-neutral-300"><option value="reward">Highest reward</option><option value="slots">Most open spots</option></select></label>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {filters.map((item) => (
            <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold transition ${filter === item.id ? "border-zinc-600 bg-zinc-800/80 text-emerald-300" : "border-stroke bg-white/5 text-neutral-400 hover:text-white"}`} type="button">
              {item.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-500" role="status">{filteredMissions.length} {filteredMissions.length === 1 ? "mission" : "missions"} matching your interests</p>
        {!filteredMissions.length ? <div className="rounded-2xl border border-dashed border-zinc-800 px-5 py-10 text-center"><Compass className="mx-auto size-8 text-emerald-400" /><h3 className="mt-3 font-semibold">{missions.length ? "No matches just yet" : "New missions are on the way"}</h3><p className="mt-2 text-sm text-neutral-500">{missions.length ? "Try another platform or broaden your search." : "Check back for your next opportunity to help a developer launch."}</p>{missions.length ? <button type="button" onClick={() => { setFilter("all"); setQuery(""); }} className="mt-4 text-sm font-semibold text-zinc-300 hover:text-white">Clear filters</button> : null}</div> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredMissions.map((mission, index) => {
            const spotsLeft = availableSlots(mission);
            const claimedPercent = mission.totalSlots > 0 ? Math.min(100, Math.max(0, mission.claimedSlots / mission.totalSlots * 100)) : 0;
            const assignment = assignments.find((item) => item.campaign.id === mission.id);
            const completed = completedCampaignIds.includes(mission.id);
            const resumable = assignment && !assignment.submitted && (assignment.revisionRequested || new Date(assignment.expiresAt).getTime() > now);
            const application = applications.find((item) => item.campaignId === mission.id);
            const accepted = application?.status === "ACCEPTED" && application.startBy && new Date(application.startBy).getTime() > now;
            const requiredRep = Math.max(0, ...mission.instructions.map((item) => item.minimumRep || 0));
            const eligibility = applicationEligibility(reputation, requiredRep, mission.discoveryAllowed || false, mission.discoveryMinRep || 0);
            return (
              <motion.article
                key={mission.id}
                initial={reducedMotion ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index, 6) * 0.04 }}
                className="border border-zinc-800 bg-zinc-900/40 rounded-2xl bg-[#0E1017]/80 p-5 backdrop-blur-md transition-all hover:border-zinc-700"
              >
                <div className="flex items-start gap-4">
                  <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-800">
                    {mission.iconUrl ? <Image src={mission.iconUrl} alt="" fill sizes="48px" className="object-cover" unoptimized /> : <Sparkles className="size-5 text-emerald-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="inline-block max-w-full break-words font-mono text-[11px] tracking-wider text-zinc-400">[{platformLabels[mission.platform] || mission.platform}]</span>
                    <h3 className="mt-1.5 break-words text-lg font-semibold tracking-tight text-zinc-100">{mission.title}</h3>
                    {mission.testerPerk ? <span className="mt-2 inline-block max-w-full break-words rounded-md border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 font-mono text-[11px] text-amber-200">[ ★ UNLOCKS: {mission.testerPerk} ]</span> : null}
                    <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-zinc-400"><span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Objective · </span>{mission.description}</p>
                    <p className="mt-2 text-xs text-zinc-500">{mission.targetVibe} · {mission.instructions.length} {mission.instructions.length === 1 ? "step" : "steps"}</p>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl border border-zinc-800 bg-[#090A0F]/45 p-4 backdrop-blur-md transition-all hover:border-zinc-700">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-lg font-semibold text-zinc-100">{formatCents(Math.round(mission.bountyPerTaskUsd * 100))}</span>
                    <span className="font-mono text-sm text-emerald-300">+{xpForBounty(Math.round(mission.bountyPerTaskUsd * 100))} REP</span>
                  </div>
                  {mission.estimatedMinutes ? <p className="mt-1 font-mono text-xs text-zinc-400">~{mission.estimatedMinutes} min · {hourlyEquivalent(mission.bountyPerTaskUsd, mission.estimatedMinutes)}/hr equiv.</p> : null}
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${spotsLeft < 6 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${claimedPercent}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-white/50">{spotsLeft} / {mission.totalSlots} spots left</p>
                  <p className="mt-2 text-xs text-neutral-400">{requiredRep.toLocaleString()} REP to apply{eligibility === "pass" ? " / Discovery Pass eligible" : ""}</p>
                </div>
                <p className="mt-3 flex gap-2 text-[11px] leading-5 text-zinc-500"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" /><span><span className="text-zinc-300">Escrow funded.</span> Developers have 48h to review your proof, or the reward auto-releases to you.</span></p>
                {!completed && !assignment && !accepted ? (
                  application && !["DECLINED", "WITHDRAWN", "STARTED"].includes(application.status) ? <Link className="mt-4 block min-h-11 rounded-xl border border-stroke p-3 text-center text-sm text-emerald-300" href="/applications">Application: {application.status.toLowerCase()} / View</Link> : <MissionRequest missionId={mission.id} eligibility={eligibility} passes={discoveryPasses} />
                ) : <Button className="mt-5 w-full" onClick={() => handleClaim(mission)} disabled={isPending || completed || Boolean(assignment && !resumable) || (!resumable && spotsLeft <= 0)}>
                  {completed ? "Completed" : assignment?.submitted ? "In review" : resumable ? "Resume mission" : assignment ? "Claim expired" : spotsLeft <= 0 ? "Fully claimed" : "Claim Slot (30m Reserve) →"}
                </Button>}
              </motion.article>
            );
          })}
        </div>
      </div> : null}

      {mode === "missions" ? <aside ref={scope} id="mission-workspace" className="border border-zinc-800 bg-zinc-900/40 min-w-0 h-fit scroll-mt-6 rounded-2xl p-5" aria-label="Mission workspace">
        {activeMission ? (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-emerald-400">Active Mission</p>
                <h2 className="mt-1 break-words text-xl font-semibold tracking-tight">{activeMission.title}</h2>
              </div>
              <button type="button" disabled={isPending} aria-label="Close mission workspace" onClick={() => { setActiveMission(null); setMessage(null); resetProof(); }} className="rounded-lg p-2 text-neutral-500 hover:bg-white/5 hover:text-white disabled:opacity-50"><X className="size-4" /></button>
            </div>
            {proofSubmitted ? (
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-5"><CheckCircle2 className="size-8 text-emerald-400" /><h3 className="mt-3 text-lg font-bold">Your feedback is with the developer.</h3><p className="mt-2 text-sm leading-6 text-neutral-400">If approved, you will earn {formatCents(payoutCents)} and {xpGain} REP. You can explore another mission while this one is reviewed.</p></div>
            ) : expired ? (
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/5 p-4 text-sm leading-6 text-rose-200">{revisionNote ? "The revision editing window expired. Close this workspace and choose Start revision again. Your existing proof is preserved." : "This claim has expired. The mission can be claimed again after the expired slot is released."}</div>
            ) : (
            <>
              {revisionNote ? <p className="whitespace-pre-wrap break-words rounded-xl border border-amber-400/25 p-4 text-sm leading-6 text-amber-200">{revisionNote}</p> : null}
              <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 font-mono text-xs text-emerald-300" role="timer">
                <Clock3 className="size-3.5" /> Slot Reserved: <Countdown expiresAt={expiresAt} /> remaining
              </div>
            <a href={activeMission.appUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-[#0E1017]/80 px-4 py-3 text-sm font-bold text-white backdrop-blur-md transition-all hover:border-zinc-700">
              Open App / TestFlight <ArrowUpRight className="size-4" />
            </a>
            <ol className="space-y-3">
              {activeMission.instructions.map((instruction) => (
                <li key={instruction.id} className="rounded-2xl border border-zinc-800 bg-[#0E1017]/80 p-4 backdrop-blur-md transition-all hover:border-zinc-700">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-100">{instruction.stepNumber}</span>
                    <div>
                      <h3 className="font-bold text-white">{instruction.instructionTitle}</h3>
                      <p className="text-xs uppercase tracking-[0.16em] text-emerald-300">{instruction.proofType.replace("_", " ")}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/62">{instruction.instructionDetail}</p>
                </li>
              ))}
            </ol>
            <label className="block cursor-pointer rounded-2xl border border-dashed border-zinc-700 bg-[#0A0D12] p-5 text-center backdrop-blur-md transition-all hover:border-zinc-700 focus-within:ring-2 focus-within:ring-emerald-400/40">
              <input className="sr-only" aria-label="Choose proof screenshot" type="file" disabled={isPending} accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleFile(event.target.files?.[0] || null)} />
              {preview ? <Image src={preview} unoptimized alt="Proof preview" width={640} height={420} className="max-h-56 w-full rounded-2xl object-cover" /> : <UploadCloud className="mx-auto size-10 text-emerald-400" />}
              <p className="mt-3 font-semibold text-white">Upload proof screenshot</p>
              <p className="mt-1 text-xs text-white/48">{retainedScreenshot && !selectedFile ? "Existing screenshot retained. Choose a file only if you need to replace it." : "PNG, JPEG, WebP up to 5MB. Screenshot hashes are verified on upload."}</p>
            </label>
            <div className="grid gap-3 rounded-2xl border border-stroke bg-black/24 p-4 sm:grid-cols-2">
              {([["osBuild", "OS & build", "iOS 18.2"], ["deviceModel", "Device model", "iPhone 15 Pro"], ["screenResolution", "Screen resolution", "1179 x 2556"], ["appBuildVersion", "App build", "1.4.0 (82)"], ["networkType", "Network type", "Wi-Fi / 5G"]] as const).map(([key, label, placeholder]) => <label className="text-xs font-mono uppercase tracking-[0.12em] text-white/48" key={key}>{label}<input className="mt-1.5 w-full rounded-lg border border-stroke bg-[#0E1017] px-3 py-2 text-sm font-sans normal-case tracking-normal text-white outline-none focus:border-emerald-500/60" onChange={(event) => setTelemetry((current) => ({ ...current, [key]: event.target.value }))} placeholder={placeholder} value={telemetry[key]} /></label>)}
              <div className="sm:col-span-2">
                <p className="text-xs font-mono uppercase tracking-[0.12em] text-white/48">Screen recording <span className="normal-case tracking-normal text-zinc-600">(optional)</span></p>
                <label className={`mt-1.5 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2.5 text-sm transition focus-within:ring-2 focus-within:ring-emerald-400/40 ${storedRecording ? "border-emerald-500/30 bg-emerald-500/5" : "border-zinc-700 hover:border-zinc-500"}`}>
                  <input className="sr-only" aria-label="Upload screen recording" type="file" accept={recordingTypes.join(",")} disabled={isPending || recordingUpload.state === "uploading"} onChange={(event) => { void handleRecording(event.target.files?.[0] || null); event.target.value = ""; }} />
                  <span className="min-w-0 truncate text-zinc-300">{recordingUpload.state === "uploading" ? `Uploading ${recordingUpload.name}…` : storedRecording ? `Recording attached${recordingUpload.name ? ` · ${recordingUpload.name}` : ""}` : "Upload MP4, MOV, or WebM (max 50MB)"}</span>
                  <span className="shrink-0 font-mono text-[11px] text-zinc-500">{storedRecording ? "Replace" : "Choose"}</span>
                </label>
                {recordingUpload.state === "error" ? <p className="mt-1 text-xs text-rose-300" role="alert">{recordingUpload.message}</p> : null}
              </div>
              <label className="text-xs font-mono uppercase tracking-[0.12em] text-white/48 sm:col-span-2">{storedRecording ? "Or replace with a share link" : "Or paste a recording link"} <input className="mt-1.5 w-full rounded-lg border border-stroke bg-[#0E1017] px-3 py-2 text-sm font-sans normal-case tracking-normal text-white outline-none focus:border-emerald-500/60" onChange={(event) => setTelemetry((current) => ({ ...current, recordingUrl: event.target.value }))} placeholder="https://.../recording.mp4" type="url" value={telemetry.recordingUrl} /></label>
            </div>
            <label className="block text-sm font-semibold">Your feedback<textarea value={feedback} maxLength={2000} minLength={12} onChange={(event) => setFeedback(event.target.value)} placeholder="What did you try? What did you expect? What actually happened? Include steps to reproduce a bug." className="mt-2 min-h-32 w-full rounded-2xl border border-stroke bg-black/24 p-4 text-sm font-normal text-white outline-none placeholder:text-white/34 focus:border-emerald-500/60" /><span className="mt-1 block text-xs font-normal text-neutral-500">At least 12 characters / {feedback.length} of 2,000</span></label>
            <div className="grid gap-3 sm:grid-cols-2"><textarea value={telemetry.crashLogs} onChange={(event) => setTelemetry((current) => ({ ...current, crashLogs: event.target.value }))} placeholder="Crash logs (optional)" className="min-h-24 w-full rounded-xl border border-stroke bg-[#0E1017] p-3 font-mono text-xs text-emerald-300 outline-none focus:border-emerald-500/60" /><textarea value={telemetry.networkLogs} onChange={(event) => setTelemetry((current) => ({ ...current, networkLogs: event.target.value }))} placeholder="Network logs (optional)" className="min-h-24 w-full rounded-xl border border-stroke bg-[#0E1017] p-3 font-mono text-xs text-emerald-300 outline-none focus:border-emerald-500/60" /></div>
            <Button className="w-full" onClick={handleSubmit} disabled={isPending || (!proofHash && !retainedScreenshot) || feedback.trim().length < 12}>
              <CheckCircle2 className="size-4" /> {isPending ? "Submitting..." : "Submit for review"}
            </Button>
            </>
            )}
            {message && <p role="status" className="rounded-2xl border border-zinc-700 bg-zinc-800/60 p-3 text-sm text-zinc-200">{message}</p>}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <ShieldCheck className="size-5 text-emerald-400" />
              <p className="mt-2 text-sm font-bold">Make your feedback count</p>
              <p className="mt-1 text-xs leading-6 text-neutral-400">Use original proof, follow every step, and be specific. Cash and reputation are awarded only after approval.</p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
            <div className="rounded-full border border-zinc-800 bg-zinc-900/60 p-5">
              <Compass className="size-9 text-emerald-400" />
            </div>
            <h2 className="mt-5 text-lg font-semibold tracking-tight">Your next contribution</h2>
            <p className="mt-2 max-w-xs text-sm leading-6 text-neutral-400">Start a mission to open the brief and reserve a spot for 30 minutes. Your work is saved to your mission desk when you submit proof.</p>
            {message ? <p role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/5 p-3 text-sm text-rose-200">{message}</p> : null}
          </div>
        )}
      </aside> : null}
      </section>
    </div>
  );
}

function MissionRequest({ missionId, eligibility, passes }: { missionId: string; eligibility: "standard" | "pass" | "locked"; passes: number }) {
  const [note, setNote] = useState("");
  if (eligibility === "locked") return <p className="mt-4 text-sm text-neutral-500">Build more REP through approved work to qualify.</p>;
  if (eligibility === "pass" && passes < 1) return <Link className="mt-4 block rounded-xl border border-zinc-800 p-3 text-sm text-emerald-300" href="/quests">Earn a Discovery Pass in Quest Center</Link>;
  return <details className="mt-4 rounded-xl border border-stroke p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold text-amber-300">{eligibility === "pass" ? "Request with Discovery Pass" : "Request to join"}</summary><label className="mt-3 block text-xs text-neutral-400">Why are you a good fit? Include relevant devices and experience.<textarea maxLength={600} value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 min-h-20 w-full rounded-lg border border-stroke bg-background p-2 text-sm text-white" /></label><p className="my-2 text-xs leading-5 text-neutral-500">{eligibility === "pass" ? "Reserves one pass. Returned if declined, withdrawn, or expired." : "The developer reviews your request. No timer starts yet."}</p><MemberAction disabled={note.trim().length < 12} action={() => requestMission(missionId, note)}>Send request</MemberAction></details>;
}
