"use client";

import confetti from "canvas-confetti";
import { motion, useAnimate } from "framer-motion";
import { ArrowUpRight, CheckCircle2, Clock3, Gift, ImagePlus, Lock, Sparkles, UploadCloud, Zap } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState, useTransition } from "react";
import { claimTaskSlot, submitTaskProof } from "@/app/actions/submissionActions";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";

type Instruction = {
  id: string;
  stepNumber: number;
  instructionTitle: string;
  instructionDetail: string;
  proofType: string;
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
  instructions: Instruction[];
};

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
  if (!expiresAt) return <span>30:00</span>;
  const remaining = Math.max(0, expiresAt.getTime() - now);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return <span>{minutes}:{String(seconds).padStart(2, "0")}</span>;
}

export function MissionExperience({ missions }: { missions: Mission[] }) {
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [proofHash, setProofHash] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [scope, animate] = useAnimate();

  const payoutCents = activeMission ? Math.round(activeMission.bountyPerTaskUsd * 100) : 0;
  const xpGain = Math.max(75, Math.round((payoutCents / 100) * 32));

  const filteredMissions = useMemo(() => missions, [missions]);

  async function handleClaim(mission: Mission) {
    setMessage(null);
    startTransition(async () => {
      try {
        const submission = await claimTaskSlot(mission.id);
        setActiveMission(mission);
        setSubmissionId(submission.id);
        setExpiresAt(new Date(submission.expiresAt));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not claim this wave.");
      }
    });
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setMessage("Proof screenshots must be under 5MB.");
      return;
    }
    setSelectedFile(file);
    setPreview(await readFileAsDataUrl(file));
    setProofHash(await hashFile(file));
  }

  function celebrate() {
    confetti({ particleCount: 180, spread: 82, origin: { y: 0.68 }, colors: ["#FFD700", "#8B5CF6", "#7C3AED", "#FFF7D6"] });
    void animate(scope.current, { scale: [0.96, 1.04, 1], opacity: [0.6, 1] }, { duration: 0.7 });
  }

  async function handleSubmit() {
    if (!submissionId || !selectedFile || !preview || !proofHash) {
      setMessage("Add a proof screenshot before submitting.");
      return;
    }
    startTransition(async () => {
      try {
        await submitTaskProof(submissionId, {
          proofImageBase64: preview,
          proofImageMimeType: selectedFile.type,
          proofImageHash: proofHash,
          feedbackText: feedback,
        });
        celebrate();
        setMessage(`Proof submitted. Review pending: ${formatCents(payoutCents)} + ${xpGain} XP queued.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not submit proof.");
      }
    });
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {["All Waves", "Social & UGC", "Quick Drops (<5m)", "High Bounty ($5+)"].map((filter, index) => (
            <button key={filter} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${index === 0 ? "border-aurum bg-aurum text-obsidian" : "border-stroke bg-white/5 text-white/72"}`} type="button">
              {filter}
            </button>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {filteredMissions.map((mission, index) => {
            const spotsLeft = mission.totalSlots - mission.claimedSlots;
            const claimedPercent = (mission.claimedSlots / mission.totalSlots) * 100;
            return (
              <motion.article
                key={mission.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
                className="luxury-panel rounded-3xl p-5 ring-1 ring-white/5"
              >
                <div className="flex items-start gap-4">
                  <div className="relative size-16 overflow-hidden rounded-2xl bg-royal/20">
                    {mission.iconUrl ? <Image src={mission.iconUrl} alt="" fill sizes="64px" className="object-cover" /> : <Sparkles className="m-5 size-6 text-aurum" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="rounded-full bg-royal/18 px-3 py-1 text-xs font-bold text-violet-200">{mission.targetVibe}</span>
                    <h3 className="mt-3 text-xl font-black text-white">{mission.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-white/62">{mission.description}</p>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl border border-aurum/20 bg-aurum/8 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono text-lg font-black gold-text">{formatCents(Math.round(mission.bountyPerTaskUsd * 100))} CASH</span>
                    <span className="font-mono text-violet-200">+ {Math.max(75, Math.round(mission.bountyPerTaskUsd * 32))} XP</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${spotsLeft < 6 ? "bg-red-400" : "bg-aurum"}`} style={{ width: `${claimedPercent}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-white/50">{spotsLeft} / {mission.totalSlots} spots left</p>
                </div>
                <Button className="mt-5 w-full" onClick={() => handleClaim(mission)} disabled={isPending || spotsLeft <= 0}>
                  <Zap className="size-4" /> Catch This Wave
                </Button>
              </motion.article>
            );
          })}
        </div>
      </div>

      <aside ref={scope} className="luxury-panel sticky top-24 h-fit rounded-3xl p-5">
        {activeMission ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-aurum">Active Quest</p>
                <h2 className="mt-1 text-2xl font-black">{activeMission.title}</h2>
              </div>
              <div className="rounded-2xl border border-aurum/30 bg-aurum/10 px-3 py-2 font-mono text-aurum">
                <Clock3 className="mr-1 inline size-4" /> <Countdown expiresAt={expiresAt} />
              </div>
            </div>
            <a href={activeMission.appUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-2xl border border-royal/40 bg-royal/15 px-4 py-3 text-sm font-bold text-white">
              Open App / TestFlight <ArrowUpRight className="size-4" />
            </a>
            <ol className="space-y-3">
              {activeMission.instructions.map((instruction) => (
                <li key={instruction.id} className="rounded-2xl border border-stroke bg-white/[0.03] p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-full bg-aurum text-sm font-black text-obsidian">{instruction.stepNumber}</span>
                    <div>
                      <h3 className="font-bold text-white">{instruction.instructionTitle}</h3>
                      <p className="text-xs uppercase tracking-[0.16em] text-violet-200">{instruction.proofType.replace("_", " ")}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-white/62">{instruction.instructionDetail}</p>
                </li>
              ))}
            </ol>
            <label className="block cursor-pointer rounded-3xl border border-dashed border-aurum/38 bg-aurum/8 p-5 text-center">
              <input className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleFile(event.target.files?.[0] || null)} />
              {preview ? <Image src={preview} alt="Proof preview" width={640} height={420} className="max-h-56 w-full rounded-2xl object-cover" /> : <UploadCloud className="mx-auto size-10 text-aurum" />}
              <p className="mt-3 font-semibold text-white">Upload proof screenshot</p>
              <p className="mt-1 text-xs text-white/48">SHA-256 dedupe runs in your browser before upload.</p>
            </label>
            <textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="What felt real, confusing, slow, or surprisingly good?" className="min-h-32 w-full rounded-2xl border border-stroke bg-black/24 p-4 text-sm text-white outline-none placeholder:text-white/34 focus:border-aurum" />
            <Button className="w-full" onClick={handleSubmit} disabled={isPending}>
              <CheckCircle2 className="size-4" /> Submit Proof
            </Button>
            {message && <p className="rounded-2xl border border-aurum/20 bg-aurum/10 p-3 text-sm text-amber-100">{message}</p>}
            <div className="rounded-3xl border border-royal/30 bg-royal/10 p-4">
              <Gift className="size-6 text-aurum" />
              <p className="mt-2 text-sm font-bold">Mystery Crate armed</p>
              <p className="text-xs text-white/50">Approved quests can roll bonus XP after review.</p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[560px] flex-col items-center justify-center text-center">
            <div className="rounded-full border border-aurum/30 bg-aurum/10 p-5">
              <Lock className="size-9 text-aurum" />
            </div>
            <h2 className="mt-5 text-2xl font-black">No active quest</h2>
            <p className="mt-2 max-w-xs text-sm leading-6 text-white/56">Claim a wave to start the 30-minute execution lock, unlock the stepper, and queue a cash bounty.</p>
            <ImagePlus className="mt-8 size-14 text-royal/60" />
          </div>
        )}
      </aside>
    </section>
  );
}
