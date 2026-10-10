import { z } from "zod";

export const aiDraftInputsSchema = z.object({
  open: z.boolean(),
  description: z.string().max(4000),
  notes: z.string().max(6000),
  audience: z.string().max(300),
});

// Drafts intentionally accept incomplete launch fields; launch validation still runs on the server.
export const launchWizardDraftSchema = z.object({
  version: z.literal(1),
  form: z.object({
    title: z.string().max(90),
    platform: z.enum(["TESTFLIGHT", "WEB_STAGING", "PLAY_STORE"]),
    appUrl: z.string().max(4000),
    iconUrl: z.string().max(4000).optional(),
    targetVibe: z.string().max(80),
    description: z.string().max(1400),
    totalSlots: z.number().int().min(0).max(500),
    bountyPerTaskUsd: z.number().min(0).max(100),
    instructions: z.array(z.object({
      instructionTitle: z.string().max(90),
      instructionDetail: z.string().max(900),
      proofType: z.enum(["SCREENSHOT", "TEXT_FEEDBACK", "ACTION_LINK"]),
      minimumRep: z.number().int().min(0).max(1000000),
      presetId: z.string().max(90).optional(),
    })).max(12),
    discoveryAllowed: z.boolean(),
    discoveryMinRep: z.number().int().min(0).max(1000000),
    cohortType: z.enum(["STANDARD_QA", "GOOGLE_PLAY_14_DAY", "LIVE_STRESS_DROP"]),
    syncGitHubRepo: z.string().max(200).optional(),
    hardwareStrict: z.boolean(),
    estimatedMinutes: z.number().int().min(0).max(240).nullable().optional(),
    testerPerk: z.string().max(80).optional(),
    promoCode: z.string().max(81).optional(),
  }),
  step: z.number().int().min(1).max(3),
  highestStep: z.number().int().min(1).max(3),
  topUpTesters: z.number().int().min(1).max(500),
  iconFileName: z.string().max(300),
  ai: aiDraftInputsSchema,
}).refine((draft) => draft.step <= draft.highestStep, "The current step must be unlocked.");

export type LaunchWizardDraft = z.infer<typeof launchWizardDraftSchema>;
export type AiDraftInputs = z.infer<typeof aiDraftInputsSchema>;
export const emptyAiDraftInputs: AiDraftInputs = { open: false, description: "", notes: "", audience: "" };
export const launchWizardDraftsSchema = z.record(z.string(), launchWizardDraftSchema);
export function launchDraftKey(sourceDraftId?: string) {
  return sourceDraftId ? `campaign:${sourceDraftId}` : "new";
}
