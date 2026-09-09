"use client";

import { PlatformType, TaskProofType } from "@prisma/client";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, BadgeDollarSign, Boxes, CheckCircle2, ImageIcon, Plus, Trash2, XCircle } from "lucide-react";
import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import { approveSubmission, rejectSubmission } from "@/app/actions/submissionActions";
import { createCampaignWithEscrow, type CampaignInput } from "@/app/actions/campaignActions";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";

type ReviewSubmission = {
  id: string;
  proofImageUrl: string | null;
  feedbackText: string | null;
  payoutCents: number;
  tester: { username: string; avatarUrl: string | null };
  campaign: {
    id: string;
    title: string;
    instructions: { stepNumber: number; instructionTitle: string; instructionDetail: string; proofType: string }[];
  };
};

type Asset = {
  id: string;
  proofImageUrl: string | null;
  feedbackText: string | null;
  tester: { username: string };
  campaign: { id: string; title: string };
};

const vibes = ["Social & UGC", "Fitness & Wellness", "Niche Marketplace", "Creator Tools", "Fintech Trust", "AI Workflow"];
const defaultTask = { instructionTitle: "Complete onboarding", instructionDetail: "Install the app, create an account, and capture the final onboarding screen.", proofType: TaskProofType.SCREENSHOT };

export function DeveloperStudio({ submissions, assets }: { submissions: ReviewSubmission[]; assets: Asset[] }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<CampaignInput>({
    title: "",
    platform: PlatformType.TESTFLIGHT,
    appUrl: "",
    iconUrl: "",
    targetVibe: vibes[0],
    description: "",
    totalSlots: 25,
    bountyPerTaskUsd: 4,
    instructions: [defaultTask],
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const payoutPool = useMemo(() => form.totalSlots * form.bountyPerTaskUsd, [form.totalSlots, form.bountyPerTaskUsd]);
  const platformFee = useMemo(() => payoutPool * 0.2, [payoutPool]);
  const totalEscrow = payoutPool + platformFee;

  function updateTask(index: number, patch: Partial<CampaignInput["instructions"][number]>) {
    setForm((current) => ({
      ...current,
      instructions: current.instructions.map((task, taskIndex) => (taskIndex === index ? { ...task, ...patch } : task)),
    }));
  }

  function moveTask(index: number, direction: -1 | 1) {
    setForm((current) => {
      const next = [...current.instructions];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, instructions: next };
    });
  }

  function launchCampaign() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await createCampaignWithEscrow(form);
        setMessage(result.checkoutUrl ? `Escrow session ready: ${result.checkoutUrl}` : "Campaign saved for escrow.");
        if (result.checkoutUrl?.startsWith("http")) window.location.href = result.checkoutUrl;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not create campaign.");
      }
    });
  }

  function review(submissionId: string, action: "approve" | "reject", reason?: string) {
    startTransition(async () => {
      try {
        if (action === "approve") {
          const result = await approveSubmission(submissionId);
          setMessage(`Approved: ${formatCents(result.payoutCents)} and ${result.xpGain} XP released.`);
        } else {
          await rejectSubmission(submissionId, reason || "Low Effort");
          setMessage("Submission rejected and slot returned.");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Review action failed.");
      }
    });
  }

  return (
    <section className="space-y-8">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="luxury-panel rounded-2xl p-6 transition-all hover:border-violet-500/30">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-aurum">New Drop / Campaign</p>
              <h2 className="mt-2 text-3xl font-black">Launch Wizard</h2>
            </div>
            <div className="flex rounded-full border border-[#1F2430] bg-[#0E1017]/80 p-1 backdrop-blur-md">
              {[1, 2, 3].map((item) => (
                <button key={item} className={`size-9 rounded-full font-mono text-sm font-black transition-all ${step === item ? "bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 shadow-lg shadow-amber-500/10" : "text-white/48"}`} onClick={() => setStep(item)} type="button">
                  {item}
                </button>
              ))}
            </div>
          </div>

          {step === 1 && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="App title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} />
              <label className="space-y-2 text-sm font-semibold text-white/72">
                Platform
                <select value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value as PlatformType })} className="w-full rounded-2xl border border-stroke bg-black/28 px-4 py-3 text-white outline-none focus:border-aurum">
                  <option value={PlatformType.TESTFLIGHT}>TestFlight</option>
                  <option value={PlatformType.WEB_STAGING}>Web URL</option>
                  <option value={PlatformType.PLAY_STORE}>Staging APK / Play Store</option>
                </select>
              </label>
              <Field label="App / TestFlight URL" value={form.appUrl} onChange={(value) => setForm({ ...form, appUrl: value })} />
              <Field label="App icon URL" value={form.iconUrl || ""} onChange={(value) => setForm({ ...form, iconUrl: value })} />
              <label className="space-y-2 text-sm font-semibold text-white/72">
                Target audience / vibe
                <select value={form.targetVibe} onChange={(event) => setForm({ ...form, targetVibe: event.target.value })} className="w-full rounded-2xl border border-stroke bg-black/28 px-4 py-3 text-white outline-none focus:border-aurum">
                  {vibes.map((vibe) => <option key={vibe}>{vibe}</option>)}
                </select>
              </label>
              <label className="space-y-2 text-sm font-semibold text-white/72 md:col-span-2">
                Mission brief
                <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-28 w-full rounded-2xl border border-stroke bg-black/28 px-4 py-3 text-white outline-none focus:border-aurum" />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="mt-6 space-y-3">
              {form.instructions.map((task, index) => (
                <motion.div key={index} layout className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-4 backdrop-blur-md transition-all hover:border-violet-500/30">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-mono text-sm text-aurum">STEP {index + 1}</span>
                    <div className="flex gap-2">
                      <IconButton label="Move up" onClick={() => moveTask(index, -1)} icon={<ArrowUp className="size-4" />} />
                      <IconButton label="Move down" onClick={() => moveTask(index, 1)} icon={<ArrowDown className="size-4" />} />
                      <IconButton label="Delete" onClick={() => setForm((current) => ({ ...current, instructions: current.instructions.filter((_, taskIndex) => taskIndex !== index) }))} icon={<Trash2 className="size-4" />} />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Instruction title" value={task.instructionTitle} onChange={(value) => updateTask(index, { instructionTitle: value })} />
                    <label className="space-y-2 text-sm font-semibold text-white/72">
                      Proof type
                      <select value={task.proofType} onChange={(event) => updateTask(index, { proofType: event.target.value as TaskProofType })} className="w-full rounded-2xl border border-stroke bg-black/28 px-4 py-3 text-white outline-none focus:border-aurum">
                        <option value={TaskProofType.SCREENSHOT}>Screenshot</option>
                        <option value={TaskProofType.TEXT_FEEDBACK}>Text feedback</option>
                        <option value={TaskProofType.ACTION_LINK}>Action link</option>
                      </select>
                    </label>
                    <label className="space-y-2 text-sm font-semibold text-white/72 md:col-span-2">
                      Instruction detail
                      <textarea value={task.instructionDetail} onChange={(event) => updateTask(index, { instructionDetail: event.target.value })} className="min-h-24 w-full rounded-2xl border border-stroke bg-black/28 px-4 py-3 text-white outline-none focus:border-aurum" />
                    </label>
                  </div>
                </motion.div>
              ))}
              <Button variant="ghost" onClick={() => setForm((current) => ({ ...current, instructions: [...current.instructions, defaultTask] }))}>
                <Plus className="size-4" /> Add step
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="mt-6 space-y-5">
              <Slider label="Number of testers" min={5} max={250} value={form.totalSlots} onChange={(value) => setForm({ ...form, totalSlots: value })} />
              <Slider label="Bounty per tester ($)" min={1} max={25} value={form.bountyPerTaskUsd} step={0.5} onChange={(value) => setForm({ ...form, bountyPerTaskUsd: value })} />
              <div className="grid gap-3 md:grid-cols-3">
                <Metric label="Tester payout pool" value={`$${payoutPool.toFixed(2)}`} />
                <Metric label="20% platform fee" value={`$${platformFee.toFixed(2)}`} />
                <Metric label="Total escrow" value={`$${totalEscrow.toFixed(2)}`} gold />
              </div>
              <Button size="lg" className="w-full" onClick={launchCampaign} disabled={isPending}>
                <BadgeDollarSign className="size-5" /> Deposit Escrow & Launch
              </Button>
            </div>
          )}
          {message && <p className="mt-5 rounded-2xl border border-aurum/20 bg-aurum/10 p-3 text-sm text-amber-100">{message}</p>}
        </div>

        <ReviewDeck submissions={submissions} onReview={review} isPending={isPending} />
      </div>
      <AssetVault assets={assets} />
    </section>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="space-y-2 text-sm font-semibold text-white/72">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-stroke bg-black/28 px-4 py-3 text-white outline-none placeholder:text-white/32 focus:border-aurum" />
    </label>
  );
}

function Slider({ label, min, max, step = 1, value, onChange }: { label: string; min: number; max: number; step?: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-4 backdrop-blur-md transition-all hover:border-violet-500/30">
      <div className="mb-3 flex items-center justify-between text-sm font-bold">
        <span className="text-white/72">{label}</span>
        <span className="font-mono text-aurum">{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-aurum" />
    </label>
  );
}

function Metric({ label, value, gold = false }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-4 backdrop-blur-md transition-all hover:border-violet-500/30">
      <p className="text-xs uppercase tracking-[0.18em] text-white/42">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-black ${gold ? "gold-text" : "text-white"}`}>{value}</p>
    </div>
  );
}

function IconButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return <button aria-label={label} type="button" onClick={onClick} className="rounded-xl border border-[#1F2430] bg-[#0E1017]/80 p-2 text-white/72 backdrop-blur-md transition-all hover:border-violet-500/30 hover:text-white">{icon}</button>;
}

function ReviewDeck({ submissions, onReview, isPending }: { submissions: ReviewSubmission[]; onReview: (id: string, action: "approve" | "reject", reason?: string) => void; isPending: boolean }) {
  const active = submissions[0];
  return (
    <div className="luxury-panel rounded-2xl p-6 transition-all hover:border-violet-500/30">
      <p className="text-xs uppercase tracking-[0.28em] text-aurum">Review Deck</p>
      <h2 className="mt-2 text-3xl font-black">Proof grading</h2>
      {active ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-xl font-bold">{active.campaign.title}</h3>
            {active.campaign.instructions.map((item) => (
              <div key={item.stepNumber} className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-3 backdrop-blur-md transition-all hover:border-violet-500/30">
                <p className="font-semibold">{item.stepNumber}. {item.instructionTitle}</p>
                <p className="mt-1 text-sm text-white/54">{item.instructionDetail}</p>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <div className="relative min-h-72 overflow-hidden rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 backdrop-blur-md transition-all hover:border-violet-500/30">
              {active.proofImageUrl ? <Image src={active.proofImageUrl} alt="Tester proof" fill sizes="(min-width: 1536px) 50vw, (min-width: 1024px) 100vw, 100vw" className="object-cover" /> : <ImageIcon className="m-16 size-16 text-white/20" />}
            </div>
            <div className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-4 backdrop-blur-md transition-all hover:border-violet-500/30">
              <p className="text-sm font-bold text-violet-200">{active.tester.username}</p>
              <p className="mt-2 text-sm leading-6 text-white/62">{active.feedbackText || "No feedback submitted yet."}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={() => onReview(active.id, "approve")} disabled={isPending}><CheckCircle2 className="size-4" /> Approve & Pay</Button>
              <Button variant="danger" onClick={() => onReview(active.id, "reject", "Low Effort")} disabled={isPending}><XCircle className="size-4" /> Reject</Button>
            </div>
          </div>
        </div>
      ) : <p className="mt-8 rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-8 text-center text-white/54 backdrop-blur-md transition-all hover:border-violet-500/30">No pending submissions in the deck.</p>}
    </div>
  );
}

function AssetVault({ assets }: { assets: Asset[] }) {
  return (
    <div className="luxury-panel rounded-2xl p-6 transition-all hover:border-violet-500/30">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-aurum">Asset Vault</p>
          <h2 className="mt-2 text-3xl font-black">Approved proof media</h2>
        </div>
        {assets[0] && <Button asChild variant="ghost"><a href={`/api/assets/download?campaignId=${assets[0].campaign.id}`}><Boxes className="size-4" /> Download All Assets (.zip)</a></Button>}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {assets.map((asset) => (
          <article key={asset.id} className="overflow-hidden rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 backdrop-blur-md transition-all hover:border-violet-500/30">
            <div className="relative h-44 bg-black/28">{asset.proofImageUrl && <Image src={asset.proofImageUrl} alt="Approved asset" fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />}</div>
            <div className="p-4">
              <p className="font-bold">{asset.campaign.title}</p>
              <p className="mt-1 text-sm text-white/50">{asset.tester.username}</p>
            </div>
          </article>
        ))}
        {assets.length === 0 && <p className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-8 text-white/54 backdrop-blur-md transition-all hover:border-violet-500/30">Approved screenshots will appear here.</p>}
      </div>
    </div>
  );
}
