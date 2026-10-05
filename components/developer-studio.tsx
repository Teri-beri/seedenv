"use client";

import { PlatformType, TaskProofType } from "@prisma/client";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, BadgeDollarSign, Boxes, CheckCircle2, Download, ExternalLink, ImageIcon, ImagePlus, LoaderCircle, Plus, Trash2, XCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { approveSubmission, rejectSubmission, requestSubmissionRevision } from "@/app/actions/submissionActions";
import { createCampaignWithEscrow, saveTestCampaignDraft, type CampaignInput } from "@/app/actions/campaignActions";
import { Button } from "@/components/ui/button";
import { DeveloperInsights, type InsightSubmission } from "@/components/developer-insights";
import { formatCents } from "@/lib/utils";
import { microTaskTemplates } from "@/lib/micro-task-templates";
import { quoteCampaignFunding, SEEDENV_PLATFORM_FEE_PERCENT } from "@/lib/pricing";

type ReviewSubmission = {
  revisionRequestedAt?: Date | null;
  rejectionReason?: string | null;
  id: string;
  proofImageUrl: string | null;
  recordingUrl: string | null;
  feedbackText: string | null;
  osBuild: string | null;
  deviceModel: string | null;
  screenResolution: string | null;
  appBuildVersion: string | null;
  networkType: string | null;
  crashLogs: string | null;
  networkLogs: string | null;
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

type CampaignDraft = {
  id: string;
  title: string;
  platform: PlatformType;
  appUrl: string;
  iconUrl: string | null;
  targetVibe: string;
  description: string;
  totalSlots: number;
  bountyPerTaskUsd: number;
  discoveryAllowed: boolean;
  discoveryMinRep: number;
  instructions: Array<{ stepNumber: number; instructionTitle: string; instructionDetail: string; proofType: TaskProofType; minimumRep: number }>;
};

function parseHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

const vibes = ["Social & UGC", "Fitness & Wellness", "Niche Marketplace", "Creator Tools", "Fintech Trust", "AI Workflow"];
const defaultTask = { instructionTitle: "Complete onboarding", instructionDetail: "Install the app, create an account, and capture the final onboarding screen.", proofType: TaskProofType.SCREENSHOT, minimumRep: 0 };
const selectClass = "w-full rounded-2xl border border-stroke bg-black/28 px-4 py-3 text-white outline-none focus:border-aurum [color-scheme:dark]";
const optionStyle = { backgroundColor: "#0E1017", color: "#F8FAFC" };

export type DeveloperStudioView = "overview" | "new-drop" | "review-deck" | "asset-vault";

export function DeveloperStudio({ submissions, assets, auditReports, reviewPage, reviewTotalPages, reviewTotalCount, canSaveTestDraft, initialDraft, view }: { submissions: ReviewSubmission[]; assets: Asset[]; auditReports: InsightSubmission[]; reviewPage: number; reviewTotalPages: number; reviewTotalCount: number; canSaveTestDraft: boolean; initialDraft?: CampaignDraft; view: DeveloperStudioView }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [highestStep, setHighestStep] = useState(1);
  const draftId = initialDraft?.id;
  const [form, setForm] = useState<CampaignInput>(() => initialDraft ? {
    title: initialDraft.title,
    platform: initialDraft.platform,
    appUrl: initialDraft.appUrl,
    iconUrl: initialDraft.iconUrl || "",
    targetVibe: initialDraft.targetVibe,
    description: initialDraft.description,
    totalSlots: initialDraft.totalSlots,
    bountyPerTaskUsd: initialDraft.bountyPerTaskUsd,
    instructions: initialDraft.instructions.map(({ instructionTitle, instructionDetail, proofType, minimumRep }) => ({ instructionTitle, instructionDetail, proofType, minimumRep })),
    discoveryAllowed: initialDraft.discoveryAllowed,
    discoveryMinRep: initialDraft.discoveryMinRep,
  } : {
    title: "",
    platform: PlatformType.TESTFLIGHT,
    appUrl: "",
    iconUrl: "",
    targetVibe: vibes[0],
    description: "",
    totalSlots: 25,
    bountyPerTaskUsd: 4,
    instructions: [defaultTask],
    discoveryAllowed: false,
    discoveryMinRep: 0,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [iconMessage, setIconMessage] = useState("");
  const [iconFileName, setIconFileName] = useState("");
  const [isPending, startTransition] = useTransition();

  const payoutPool = useMemo(() => form.totalSlots * form.bountyPerTaskUsd, [form.totalSlots, form.bountyPerTaskUsd]);
  const fundingQuote = useMemo(() => quoteCampaignFunding(payoutPool), [payoutPool]);
  const totalEscrow = fundingQuote.totalBudgetUsd;
  const platformFee = fundingQuote.platformFeeUsd;

  function validateStep(stepToValidate: number) {
    const nextErrors: Record<string, string> = {};
    if (stepToValidate === 1) {
      const title = form.title.trim();
      if (title.length < 4 || title.length > 90) nextErrors.title = "Use 4 to 90 characters for the app title.";
      const appUrl = parseHttpUrl(form.appUrl);
      if (!appUrl) nextErrors.appUrl = "Enter a valid HTTP or HTTPS app URL.";
      if ((form.targetVibe || "").trim().length < 3) nextErrors.targetVibe = "Choose a target audience.";
      if (form.description.trim().length < 24) nextErrors.description = "Add at least 24 characters so testers know what to validate.";
      if (form.description.length > 1400) nextErrors.description = "Mission brief must be 1,400 characters or fewer.";
      if (form.iconUrl && !parseHttpUrl(form.iconUrl)) nextErrors.iconUrl = "Enter a valid HTTP or HTTPS image URL, or leave it blank.";
    }
    if (stepToValidate === 2) {
      if (form.instructions.length < 1) nextErrors.instructions = "Add at least one tester task.";
      if (form.instructions.length > 12) nextErrors.instructions = "A drop can have up to 12 tester tasks.";
      form.instructions.forEach((task, index) => {
        if (task.instructionTitle.trim().length < 3 || task.instructionTitle.length > 90) nextErrors[`instructionTitle-${index}`] = "Task title must be 3 to 90 characters.";
        if (task.instructionDetail.trim().length < 12 || task.instructionDetail.length > 900) nextErrors[`instructionDetail-${index}`] = "Task instructions must be 12 to 900 characters.";
      });
    }
    if (stepToValidate === 3) {
      if (!Number.isInteger(form.totalSlots) || form.totalSlots < 5 || form.totalSlots > 500) nextErrors.totalSlots = "Choose between 5 and 500 tester slots.";
      if (form.bountyPerTaskUsd < 1 || form.bountyPerTaskUsd > 100) nextErrors.bountyPerTaskUsd = "Bounty must be between $1 and $100 per tester.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function updateFormField<Key extends keyof CampaignInput>(key: Key, value: CampaignInput[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function continueWizard() {
    if (isUploadingIcon) return;
    if (!validateStep(step)) return;
    const nextStep = Math.min(3, step + 1);
    setStep(nextStep);
    setHighestStep((current) => Math.max(current, nextStep));
    setMessage(null);
  }

  async function uploadCampaignIcon(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      setIconMessage("Choose a PNG or JPG image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setIconMessage("Icon must be 2 MB or smaller.");
      return;
    }

    setIconMessage("");
    setIsUploadingIcon(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/console/campaign-icon", { method: "POST", body: formData });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Could not upload the app icon.");
      updateFormField("iconUrl", result.iconUrl);
      setIconFileName(file.name);
      setIconMessage("App icon uploaded and added to the preview.");
    } catch (error) {
      setIconMessage(error instanceof Error ? error.message : "Could not upload the app icon.");
    } finally {
      setIsUploadingIcon(false);
    }
  }

  function updateTask(index: number, patch: Partial<CampaignInput["instructions"][number]>) {
    setForm((current) => ({
      ...current,
      instructions: current.instructions.map((task, taskIndex) => (taskIndex === index ? { ...task, ...patch } : task)),
    }));
    setErrors((current) => {
      const next = { ...current };
      if (patch.instructionTitle !== undefined) delete next[`instructionTitle-${index}`];
      if (patch.instructionDetail !== undefined) delete next[`instructionDetail-${index}`];
      return next;
    });
  }

  function moveTask(index: number, direction: -1 | 1) {
    setErrors({});
    setForm((current) => {
      const next = [...current.instructions];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, instructions: next };
    });
  }

  function launchCampaign() {
    if (isUploadingIcon) return;
    for (let stepToValidate = 1; stepToValidate <= 3; stepToValidate += 1) {
      if (!validateStep(stepToValidate)) {
        setStep(stepToValidate);
        return;
      }
    }
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await createCampaignWithEscrow(form, draftId);
        if (result.requiresPaymentSetup) {
          router.push(`/account?tab=portfolio&draft=${encodeURIComponent(result.campaignId)}`);
          return;
        }
        if (result.checkoutUrl?.startsWith("http")) {
          window.location.href = result.checkoutUrl;
          return;
        }
        setMessage("Draft saved and awaiting escrow. Configure Stripe Checkout to collect payment and activate the drop.");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not create campaign.");
      }
    });
  }

  function saveNoChargeTestDraft() {
    if (isUploadingIcon) return;
    for (let stepToValidate = 1; stepToValidate <= 3; stepToValidate += 1) {
      if (!validateStep(stepToValidate)) {
        setStep(stepToValidate);
        return;
      }
    }

    setMessage(null);
    startTransition(async () => {
      try {
        const draft = await saveTestCampaignDraft(form);
        router.push(`/console?view=billing&testDraft=${encodeURIComponent(draft.campaignId)}`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not save the no-charge test draft.");
      }
    });
  }

  function review(submissionId: string, action: "approve" | "reject" | "revision", reason?: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        if (action === "approve") {
          const result = await approveSubmission(submissionId);
          setMessage(result.payoutStatus === "TRANSFERRED"
            ? `Approved: ${formatCents(result.payoutCents)} was transferred to the tester’s Stripe account and ${result.xpGain} REP was added.`
            : `Approved: ${result.xpGain} REP was added. The ${formatCents(result.payoutCents)} payout is pending the tester’s Stripe setup.`);
        } else if (action === "revision") {
          await requestSubmissionRevision(submissionId, reason || "Please add clearer reproduction steps and supporting proof.");
          setMessage("Revision request sent to the tester.");
        } else {
          await rejectSubmission(submissionId, reason || "Low Effort");
          setMessage("Submission rejected and slot returned.");
        }
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Review action failed.");
      }
    });
  }

  return (
    <section className="space-y-8">
      {message ? <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-100" role="status">{message}</p> : null}
      {view === "overview" ? <DeveloperInsights submissions={auditReports} /> : null}
      {view === "new-drop" ? (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="luxury-panel rounded-2xl p-6 transition-all hover:border-violet-500/30">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-aurum">New Drop / Campaign</p>
              <h2 className="mt-2 text-3xl font-black">Launch Wizard</h2>
            </div>
            <div className="flex rounded-lg border border-[#1F2430] bg-[#090A0F]/60 p-1" role="tablist" aria-label="Launch wizard steps">
              {([[1, "Details"], [2, "Tasks"], [3, "Budget"]] as const).map(([item, label]) => (
                <button aria-selected={step === item} disabled={item > highestStep} key={item} className={`rounded-md px-2.5 py-2 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-35 ${step === item ? "bg-amber-500 text-neutral-950" : "text-white/55 enabled:hover:text-white"}`} onClick={() => { setStep(item); setErrors({}); }} role="tab" type="button">
                  <span className="mr-1 font-mono">{item}</span>{label}
                </button>
              ))}
            </div>
          </div>

          {step === 1 && (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field error={errors.title} label="App title" maxLength={90} required value={form.title} onChange={(value) => updateFormField("title", value)} />
              <label className="space-y-2 text-sm font-semibold text-white/72">
                Platform
                <select style={{ colorScheme: "dark" }} value={form.platform} onChange={(event) => updateFormField("platform", event.target.value as PlatformType)} className={selectClass}>
                  <option style={optionStyle} value={PlatformType.TESTFLIGHT}>TestFlight</option>
                  <option style={optionStyle} value={PlatformType.WEB_STAGING}>Web URL</option>
                  <option style={optionStyle} value={PlatformType.PLAY_STORE}>Staging APK / Play Store</option>
                </select>
              </label>
              <Field error={errors.appUrl} label="App / TestFlight URL" maxLength={2048} placeholder="https://..." required type="url" value={form.appUrl} onChange={(value) => updateFormField("appUrl", value)} />
              <div className="space-y-2 text-sm font-semibold text-white/72">
                <p>App icon</p>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-[#090A0F]">
                    {form.iconUrl ? <Image alt="Selected app icon preview" className="object-cover" fill sizes="48px" src={form.iconUrl} unoptimized /> : <ImagePlus className="size-5 text-neutral-500" />}
                  </span>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stroke bg-black/28 px-3 py-2.5 text-xs font-semibold text-neutral-200 transition hover:border-amber-500/40 hover:text-white has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                    {isUploadingIcon ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                    {isUploadingIcon ? "Uploading…" : form.iconUrl ? "Replace icon" : "Choose icon file"}
                    <input accept="image/png,image/jpeg,.png,.jpg,.jpeg" className="sr-only" disabled={isUploadingIcon} onChange={uploadCampaignIcon} type="file" />
                  </label>
                  {iconFileName ? <span className="max-w-full truncate text-xs font-normal text-neutral-500">{iconFileName}</span> : null}
                </div>
                <p className="text-xs font-normal text-neutral-500">PNG or JPG, up to 2 MB.</p>
                {iconMessage ? <p className={`text-xs font-normal ${iconMessage.startsWith("App icon uploaded") ? "text-emerald-300" : "text-rose-300"}`} role="status">{iconMessage}</p> : null}
              </div>
              <label className="space-y-2 text-sm font-semibold text-white/72">
                Target audience / vibe
                <select aria-invalid={Boolean(errors.targetVibe)} style={{ colorScheme: "dark" }} value={form.targetVibe} onChange={(event) => updateFormField("targetVibe", event.target.value)} className={selectClass}>
                  {vibes.map((vibe) => <option key={vibe} style={optionStyle}>{vibe}</option>)}
                </select>
                {errors.targetVibe ? <span className="block text-xs font-normal text-rose-300">{errors.targetVibe}</span> : null}
              </label>
              <label className="space-y-2 text-sm font-semibold text-white/72 md:col-span-2">
                Mission brief
                <textarea aria-invalid={Boolean(errors.description)} maxLength={1400} value={form.description} onChange={(event) => updateFormField("description", event.target.value)} className="min-h-28 w-full rounded-2xl border border-stroke bg-black/28 px-4 py-3 text-white outline-none focus:border-aurum" />
                <span className="block text-right text-xs text-white/42">{form.description.length}/1,400</span>
                {errors.description ? <span className="block text-xs font-normal text-rose-300">{errors.description}</span> : null}
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="mt-6 space-y-3">
              <label className="block text-sm font-semibold text-neutral-300">Add a micro-task template
                <select value="" disabled={form.instructions.length >= 12} className={`mt-2 ${selectClass}`} onChange={(event) => {
                  const template = microTaskTemplates.find(([id]) => id === event.target.value);
                  if (!template) return;
                  setForm((current) => ({ ...current, instructions: [...current.instructions, { instructionTitle: template[1], instructionDetail: template[2], proofType: TaskProofType.SCREENSHOT, minimumRep: 0 }] }));
                }}><option value="">Choose from 24 testing activities</option>{microTaskTemplates.map(([id, title]) => <option key={id} value={id} style={optionStyle}>{title}</option>)}</select>
                <span className="mt-2 block text-xs font-normal leading-6 text-neutral-500">Adapt the brief to your app. Rewards are issued for the whole approved mission, not once per step.</span>
              </label>
              {form.instructions.map((task, index) => (
                <motion.div key={index} layout className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-4 backdrop-blur-md transition-all hover:border-violet-500/30">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-mono text-sm text-aurum">STEP {index + 1}</span>
                    <div className="flex gap-2">
                      <IconButton disabled={index === 0} label="Move up" onClick={() => moveTask(index, -1)} icon={<ArrowUp className="size-4" />} />
                      <IconButton disabled={index === form.instructions.length - 1} label="Move down" onClick={() => moveTask(index, 1)} icon={<ArrowDown className="size-4" />} />
                      <IconButton label="Delete" onClick={() => { setForm((current) => ({ ...current, instructions: current.instructions.filter((_, taskIndex) => taskIndex !== index) })); setErrors({}); }} icon={<Trash2 className="size-4" />} />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field error={errors[`instructionTitle-${index}`]} label="Instruction title" maxLength={90} required value={task.instructionTitle} onChange={(value) => updateTask(index, { instructionTitle: value })} />
                    <label className="space-y-2 text-sm font-semibold text-white/72">Minimum tester REP<input type="number" min={0} max={1000000} value={task.minimumRep} onChange={(event) => updateTask(index, { minimumRep: Number(event.target.value) })} className={selectClass} /></label>
                    <label className="space-y-2 text-sm font-semibold text-white/72">
                      Proof type
                      <select style={{ colorScheme: "dark" }} value={task.proofType} onChange={(event) => updateTask(index, { proofType: event.target.value as TaskProofType })} className={selectClass}>
                        <option style={optionStyle} value={TaskProofType.SCREENSHOT}>Screenshot</option>
                        <option style={optionStyle} value={TaskProofType.TEXT_FEEDBACK}>Text feedback</option>
                        <option style={optionStyle} value={TaskProofType.ACTION_LINK}>Action link</option>
                      </select>
                    </label>
                    <label className="space-y-2 text-sm font-semibold text-white/72 md:col-span-2">
                      Instruction detail
                      <textarea aria-invalid={Boolean(errors[`instructionDetail-${index}`])} maxLength={900} value={task.instructionDetail} onChange={(event) => updateTask(index, { instructionDetail: event.target.value })} className="min-h-24 w-full rounded-2xl border border-stroke bg-black/28 px-4 py-3 text-white outline-none focus:border-aurum" />
                      {errors[`instructionDetail-${index}`] ? <span className="block text-xs font-normal text-rose-300">{errors[`instructionDetail-${index}`]}</span> : null}
                    </label>
                  </div>
                </motion.div>
              ))}
              {errors.instructions ? <p className="text-sm text-rose-300" role="alert">{errors.instructions}</p> : null}
              <Button disabled={form.instructions.length >= 12} type="button" variant="ghost" onClick={() => setForm((current) => ({ ...current, instructions: [...current.instructions, defaultTask] }))}>
                <Plus className="size-4" /> Add step
              </Button>
              <div className="rounded-xl border border-stroke p-4">
                <p className="text-xs leading-6 text-neutral-400">Applicants must meet the highest REP requirement among the campaign steps. You review all applications before testers start.</p>
                <label className="mt-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={form.discoveryAllowed} onChange={(event) => setForm((current) => ({ ...current, discoveryAllowed: event.target.checked }))} />Allow Discovery Pass applicants</label>
                {form.discoveryAllowed ? <label className="mt-3 block text-sm">Discovery REP floor<input type="number" min={0} max={1000000} value={form.discoveryMinRep} onChange={(event) => setForm((current) => ({ ...current, discoveryMinRep: Number(event.target.value) }))} className={`mt-2 ${selectClass}`} /></label> : null}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mt-6 space-y-5">
              <Slider error={errors.totalSlots} label="Number of testers" min={5} max={500} value={form.totalSlots} onChange={(value) => updateFormField("totalSlots", value)} />
              <Slider error={errors.bountyPerTaskUsd} label="Bounty per tester ($)" min={1} max={100} value={form.bountyPerTaskUsd} step={0.5} onChange={(value) => updateFormField("bountyPerTaskUsd", value)} />
              <div className="grid gap-3 md:grid-cols-3">
                <Metric label="Tester payout escrow (92%)" value={`$${payoutPool.toFixed(2)}`} />
                <Metric label={`${SEEDENV_PLATFORM_FEE_PERCENT * 100}% platform & telemetry fee`} value={`$${platformFee.toFixed(2)}`} />
                <Metric label="Total escrow" value={`$${totalEscrow.toFixed(2)}`} gold />
              </div>
              <p className="text-xs leading-5 text-white/50">No hidden markups. 92% of funds go straight to rewarding verified human validators.</p>
              <Button size="lg" type="button" className="w-full" onClick={launchCampaign} disabled={isPending}>
                <BadgeDollarSign className="size-5" /> Deposit Escrow & Launch
              </Button>
              {canSaveTestDraft ? <Button className="w-full" disabled={isPending || isUploadingIcon} type="button" variant="ghost" onClick={saveNoChargeTestDraft}><CheckCircle2 className="size-4" /> Save test draft (no charge)</Button> : null}
            </div>
          )}
          <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
            <Button disabled={step === 1 || isPending || isUploadingIcon} type="button" variant="ghost" onClick={() => { setStep((current) => Math.max(1, current - 1)); setErrors({}); }}>Back</Button>
            {step < 3 ? <Button type="button" onClick={continueWizard} disabled={isPending || isUploadingIcon}>Continue to {step === 1 ? "tasks" : "budget"}</Button> : <Button type="button" variant="ghost" onClick={() => setStep(1)}>Review details</Button>}
          </div>
        </div>
        <LaunchPreview form={form} />
        </div>
      ) : null}
      {view === "review-deck" ? <ReviewDeck submissions={submissions} onReview={review} isPending={isPending} page={reviewPage} totalPages={reviewTotalPages} totalCount={reviewTotalCount} /> : null}
      {view === "asset-vault" ? <AssetVault assets={assets} /> : null}
    </section>
  );
}

function LaunchPreview({ form }: { form: CampaignInput }) {
  const [failedIconUrl, setFailedIconUrl] = useState("");
  const platformLabel = form.platform === PlatformType.TESTFLIGHT
    ? "TestFlight"
    : form.platform === PlatformType.WEB_STAGING
      ? "Web"
      : "Play Store";
  let previewIconUrl = "";
  try {
    const parsedIconUrl = new URL(form.iconUrl || "");
    if (parsedIconUrl.protocol === "https:" || parsedIconUrl.protocol === "http:") previewIconUrl = parsedIconUrl.toString();
  } catch {
    previewIconUrl = "";
  }

  return (
    <aside className="xl:sticky xl:top-28">
      <div className="rounded-2xl border border-amber-500/25 bg-[linear-gradient(155deg,rgba(245,158,11,0.1),rgba(14,16,23,0.96)_36%)] p-5 shadow-xl shadow-black/20">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">Live Preview</p>
            <h3 className="mt-1 text-lg font-black text-white">Tester HUD</h3>
          </div>
          <span className="rounded-full border border-emerald-500/25 bg-emerald-950/35 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Beta drop</span>
        </div>

        <article className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-[#090A0F]/90">
          <div className="h-1 bg-gradient-to-r from-amber-500 via-orange-400 to-emerald-400" />
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-[#141720]">
                <Boxes className="size-6 text-amber-400" />
                {previewIconUrl && failedIconUrl !== previewIconUrl ? <Image alt="Campaign icon preview" className="object-cover" fill onError={() => setFailedIconUrl(previewIconUrl)} sizes="56px" src={previewIconUrl} unoptimized /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="truncate font-bold text-white">{form.title.trim() || "Your app title"}</h4>
                <p className="mt-1 text-xs text-neutral-500">{form.targetVibe || "Choose a target audience"}</p>
              </div>
            </div>
            <span className="mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-neutral-300">{platformLabel}</span>
            <p className="mt-4 min-h-16 text-sm leading-6 text-neutral-400">{form.description.trim() || "Your mission brief will show testers what to explore and what feedback you need."}</p>
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs">
              <span className="text-neutral-500">Tester reward</span>
              <span className="font-mono font-bold text-amber-300">${form.bountyPerTaskUsd.toFixed(2)}</span>
            </div>
            <button className="mt-4 w-full rounded-lg bg-amber-500 px-3 py-2.5 text-sm font-bold text-neutral-950" disabled type="button">View seed mission</button>
          </div>
        </article>
        <p className="mt-3 text-xs leading-5 text-neutral-500">Preview updates as you edit the title, platform, icon, and mission brief.</p>
      </div>
    </aside>
  );
}

function Field({ label, value, onChange, error, type = "text", maxLength, placeholder, required }: { label: string; value: string; onChange: (value: string) => void; error?: string; type?: "text" | "url"; maxLength?: number; placeholder?: string; required?: boolean }) {
  return (
    <label className="space-y-2 text-sm font-semibold text-white/72">
      {label}
      <input aria-invalid={Boolean(error)} className="w-full rounded-2xl border border-stroke bg-black/28 px-4 py-3 text-white outline-none placeholder:text-white/32 focus:border-aurum" maxLength={maxLength} placeholder={placeholder} required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      {error ? <span className="block text-xs font-normal text-rose-300">{error}</span> : null}
    </label>
  );
}

function Slider({ label, min, max, step = 1, value, onChange, error }: { label: string; min: number; max: number; step?: number; value: number; onChange: (value: number) => void; error?: string }) {
  const inputId = `campaign-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="block rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-4 backdrop-blur-md transition-all hover:border-violet-500/30">
      <div className="mb-3 flex items-center justify-between text-sm font-bold">
        <label className="text-white/72" htmlFor={inputId}>{label}</label>
        <input aria-invalid={Boolean(error)} className="w-24 rounded-md border border-stroke bg-black/40 px-2 py-1 text-right font-mono text-aurum outline-none focus:border-aurum" id={inputId} max={max} min={min} onChange={(event) => { const nextValue = event.currentTarget.valueAsNumber; if (Number.isFinite(nextValue)) onChange(nextValue); }} step={step} type="number" value={value} />
      </div>
      <input aria-label={`${label} slider`} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-aurum" />
      {error ? <p className="mt-2 text-xs font-normal text-rose-300">{error}</p> : null}
    </div>
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

function IconButton({ label, icon, onClick, disabled = false }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button aria-label={label} disabled={disabled} type="button" onClick={onClick} className="rounded-xl border border-[#1F2430] bg-[#0E1017]/80 p-2 text-white/72 backdrop-blur-md transition-all hover:border-violet-500/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-35">{icon}</button>;
}

const rejectionReasons = ["Blurry Image", "Irrelevant Content", "Incomplete Steps", "Low Effort", "Generic Feedback", "Did not follow test script", "Incomplete video proof"] as const;

function ReviewDeck({ submissions, onReview, isPending, page, totalPages, totalCount }: { submissions: ReviewSubmission[]; onReview: (id: string, action: "approve" | "reject" | "revision", reason?: string) => void; isPending: boolean; page: number; totalPages: number; totalCount: number }) {
  const [selectedId, setSelectedId] = useState("");
  const [decision, setDecision] = useState<"approve" | "revision" | "reject" | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [rejectionReason, setRejectionReason] = useState<(typeof rejectionReasons)[number]>("Generic Feedback");
  const [error, setError] = useState("");
  const active = submissions.find((submission) => submission.id === selectedId) || submissions[0];

  function confirmDecision() {
    if (!active || !decision) return;
    if (decision === "approve") {
      onReview(active.id, "approve");
    } else if (decision === "revision") {
      const note = revisionNote.trim();
      if (note.length < 8 || note.length > 300) {
        setError("Revision notes must be 8 to 300 characters.");
        return;
      }
      onReview(active.id, "revision", note);
    } else {
      onReview(active.id, "reject", rejectionReason);
    }
    setDecision(null);
    setError("");
  }

  return (
    <section className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-[0.28em] text-aurum">Tester quality</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-3xl font-black">Review Deck</h2><p className="mt-1 text-sm text-neutral-400">Review proof, request a revision, or approve the tester payout.</p></div>
          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200">{totalCount} awaiting review</span>
        </div>
      </header>

      {active ? (
        <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-4">
            <h3 className="text-sm font-semibold text-white">Pending queue</h3>
            <div className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto">
              {submissions.map((submission) => (
                <button aria-pressed={active.id === submission.id} className={`w-full rounded-xl border p-3 text-left transition ${active.id === submission.id ? "border-amber-400/40 bg-amber-500/10" : "border-[#1F2430] bg-[#090A0F]/55 hover:border-white/20"}`} key={submission.id} onClick={() => { setSelectedId(submission.id); setDecision(null); setError(""); }} type="button">
                  <span className="block truncate text-sm font-semibold text-white">{submission.campaign.title}</span>
                  <span className="mt-1 block truncate text-xs text-neutral-500">{submission.tester.username} · {submission.id.slice(-8)}</span>
                  <span className="mt-2 block font-mono text-xs text-amber-300">{formatCents(submission.payoutCents)}</span>
                  {submission.revisionRequestedAt ? <span className="mt-2 block text-xs text-violet-300">Awaiting tester revision</span> : null}
                </button>
              ))}
            </div>
          </aside>

          <article className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-5 sm:p-6">
            {active.revisionRequestedAt ? <p className="mb-5 whitespace-pre-wrap break-words rounded-xl border border-violet-400/25 p-4 text-sm leading-6 text-violet-200">{active.rejectionReason}{"\n"}The tester chooses when to start a fresh 30-minute editing window. Approval becomes available after resubmission.</p> : null}
            <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-400">{active.campaign.title}</p>
                  <h3 className="mt-2 text-xl font-bold text-white">Tester instructions</h3>
                </div>
                {active.campaign.instructions.length ? active.campaign.instructions.map((item) => (
                  <div key={item.stepNumber} className="rounded-xl border border-[#1F2430] bg-[#090A0F]/55 p-4">
                    <div className="flex items-center justify-between gap-3"><p className="font-semibold text-white">{item.stepNumber}. {item.instructionTitle}</p><span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-neutral-400">{item.proofType.replaceAll("_", " ").toLowerCase()}</span></div>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">{item.instructionDetail}</p>
                  </div>
                )) : <p className="text-sm text-neutral-500">No campaign-specific steps were saved.</p>}
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">Tester feedback · {active.tester.username}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-200">{active.feedbackText || "No written feedback submitted."}</p>
                  <div className="mt-3 grid gap-2 text-xs text-neutral-500 sm:grid-cols-2">
                    <p>OS / build: <span className="text-neutral-300">{active.osBuild || active.appBuildVersion || "Not captured"}</span></p>
                    <p>Device: <span className="text-neutral-300">{active.deviceModel || "Not captured"}</span></p>
                    <p>Resolution: <span className="text-neutral-300">{active.screenResolution || "Not captured"}</span></p>
                    <p>Network: <span className="text-neutral-300">{active.networkType || "Not captured"}</span></p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="relative flex min-h-64 items-center justify-center overflow-hidden rounded-xl border border-[#1F2430] bg-[#090A0F]">
                  {active.proofImageUrl ? <Image alt={`Proof submitted for ${active.campaign.title}`} className="object-contain" fill sizes="(min-width: 1536px) 40vw, (min-width: 1280px) 50vw, 100vw" src={active.proofImageUrl} unoptimized /> : active.recordingUrl ? <video className="max-h-80 w-full" controls src={active.recordingUrl} /> : <div className="p-8 text-center"><ImageIcon className="mx-auto size-10 text-neutral-600" /><p className="mt-3 text-sm text-neutral-500">Feedback-only submission</p></div>}
                </div>
                {active.recordingUrl && active.proofImageUrl ? <a className="inline-flex text-xs font-semibold text-amber-300 hover:text-amber-200" href={active.recordingUrl} target="_blank" rel="noreferrer">Open tester recording</a> : null}

                {decision ? (
                  <div className="space-y-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
                    {decision === "approve" ? (
                      <p className="text-sm leading-6 text-neutral-300">Approve this proof and release <span className="font-mono font-bold text-amber-300">{formatCents(active.payoutCents)}</span> to {active.tester.username}?</p>
                    ) : decision === "revision" ? (
                      <label className="block text-sm font-semibold text-neutral-200">Revision notes
                        <textarea className="mt-2 min-h-24 w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] p-3 text-sm text-white outline-none focus:border-amber-500/50" maxLength={300} onChange={(event) => setRevisionNote(event.target.value)} placeholder="Explain what the tester should clarify or resubmit." value={revisionNote} />
                        <span className="mt-1 block text-right text-xs font-normal text-neutral-500">{revisionNote.length}/300</span>
                      </label>
                    ) : (
                      <label className="block text-sm font-semibold text-neutral-200">Rejection reason
                        <select className="mt-2 w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] p-3 text-white outline-none focus:border-amber-500/50" onChange={(event) => setRejectionReason(event.target.value as (typeof rejectionReasons)[number])} value={rejectionReason}>
                          {rejectionReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                        </select>
                      </label>
                    )}
                    {error ? <p className="text-xs text-rose-300" role="alert">{error}</p> : null}
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button disabled={isPending} type="button" variant="ghost" onClick={() => { setDecision(null); setError(""); }}>Cancel</Button>
                      <Button disabled={isPending} type="button" variant={decision === "reject" ? "danger" : "primary"} onClick={confirmDecision}>{isPending ? "Saving..." : decision === "approve" ? "Confirm approval & release" : decision === "reject" ? "Confirm rejection" : "Send revision request"}</Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Button disabled={isPending || Boolean(active.revisionRequestedAt)} type="button" onClick={() => setDecision("approve")}><CheckCircle2 className="size-4" /> Approve &amp; Release</Button>
                    <Button disabled={isPending || Boolean(active.revisionRequestedAt)} type="button" variant="ghost" onClick={() => { setDecision("revision"); setRevisionNote(""); setError(""); }}>Request Revision</Button>
                    <Button disabled={isPending} type="button" variant="danger" onClick={() => { setDecision("reject"); setError(""); }}><XCircle className="size-4" /> Reject</Button>
                  </div>
                )}
              </div>
            </div>
          </article>
        </div>
      ) : (
        <section className="rounded-2xl border border-dashed border-[#3A3F4C] bg-[#0E1017]/70 p-8 text-center">
          <CheckCircle2 className="mx-auto size-8 text-emerald-400" />
          <h3 className="mt-3 text-lg font-bold text-white">Nothing to review</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-neutral-400">New proof submissions appear here. You can review past decisions in the Audit Hub.</p>
          <Link className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-amber-300 hover:text-amber-200" href="/console?view=overview">Open Audit Hub</Link>
        </section>
      )}
      {totalCount > 0 ? (
        <nav aria-label="Review queue pages" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1F2430] bg-[#0E1017]/65 px-4 py-3">
          <p className="text-xs text-neutral-500">Page {page} of {totalPages} · {totalCount} pending reports</p>
          <div className="flex gap-2">
            {page > 1 ? <Link className="rounded-lg border border-[#2A2F3D] px-3 py-2 text-xs font-semibold text-neutral-300 hover:text-white" href={`/console?view=review-deck&reviewPage=${page - 1}`}>Previous</Link> : <span aria-disabled="true" className="rounded-lg border border-[#1F2430] px-3 py-2 text-xs text-neutral-600">Previous</span>}
            {page < totalPages ? <Link className="rounded-lg border border-[#2A2F3D] px-3 py-2 text-xs font-semibold text-neutral-300 hover:text-white" href={`/console?view=review-deck&reviewPage=${page + 1}`}>Next</Link> : <span aria-disabled="true" className="rounded-lg border border-[#1F2430] px-3 py-2 text-xs text-neutral-600">Next</span>}
          </div>
        </nav>
      ) : null}
    </section>
  );
}

function AssetVault({ assets }: { assets: Asset[] }) {
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-aurum">Approved tester proof</p>
          <h2 className="mt-2 text-3xl font-black">Asset Vault</h2>
          <p className="mt-1 text-sm text-neutral-400">Screenshots approved across your campaigns.</p>
        </div>
        {assets.length ? <Button asChild variant="ghost"><a href="/api/assets/download"><Download className="size-4" /> Download all campaigns (.zip)</a></Button> : null}
      </header>
      {assets.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => (
            <article key={asset.id} className="overflow-hidden rounded-xl border border-[#1F2430] bg-[#0E1017]/80 transition hover:border-amber-500/30">
              <a aria-label={`Open ${asset.campaign.title} proof image from ${asset.tester.username}`} className="group relative block h-52 bg-black/30" href={asset.proofImageUrl || undefined} rel="noreferrer" target="_blank">
                {asset.proofImageUrl ? <Image alt={`Approved proof for ${asset.campaign.title}`} className="object-cover transition group-hover:scale-[1.02]" fill sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw" src={asset.proofImageUrl} unoptimized /> : <div className="grid h-full place-items-center text-neutral-500"><ImageIcon className="size-8" /></div>}
                <span className="absolute bottom-3 right-3 grid size-8 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"><ExternalLink className="size-4" /></span>
              </a>
              <div className="p-4">
                <p className="truncate font-bold text-white">{asset.campaign.title}</p>
                <p className="mt-1 text-xs text-neutral-500">Tester: {asset.tester.username}</p>
                {asset.feedbackText ? <p className="mt-3 line-clamp-3 text-sm leading-5 text-neutral-400">{asset.feedbackText}</p> : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#3A3F4C] bg-[#0E1017]/65 p-8 text-center">
          <Boxes className="mx-auto size-8 text-amber-400" />
          <h3 className="mt-3 text-lg font-bold text-white">No approved proof yet</h3>
          <p className="mt-2 text-sm text-neutral-400">Approved tester screenshots will collect here, ready to review and download.</p>
          <Link className="mt-5 inline-flex text-sm font-semibold text-amber-300 hover:text-amber-200" href="/console?view=review-deck">Open Review Deck <ArrowDown className="ml-2 size-4 rotate-[-45deg]" /></Link>
        </div>
      )}
    </section>
  );
}
