"use server";

import { z } from "zod";
import { requireMember } from "@/lib/member";
import { prisma } from "@/lib/prisma";
import { launchDraftKey, launchWizardDraftSchema, launchWizardDraftsSchema, type LaunchWizardDraft } from "@/lib/launch-wizard-draft";

const requestSchema = z.object({
  sourceDraftId: z.string().min(1).max(200).optional(),
  expectedRevision: z.number().int().min(0),
  draft: launchWizardDraftSchema.nullable(),
});

export async function saveLaunchWizardDraft(input: { sourceDraftId?: string; expectedRevision: number; draft: LaunchWizardDraft | null }) {
  const request = requestSchema.parse(input);
  const member = await requireMember("DEVELOPER");
  return prisma.$transaction(async (tx) => {
    if (request.sourceDraftId) {
      const campaign = await tx.appCampaign.findFirst({ where: { id: request.sourceDraftId, developerId: member.id, status: "DRAFT" }, select: { id: true } });
      if (!campaign && request.draft) throw new Error("This campaign is no longer an editable draft.");
    }
    const user = await tx.user.findUniqueOrThrow({ where: { id: member.id }, select: { launchWizardDrafts: true, launchWizardDraftRevision: true } });
    if (user.launchWizardDraftRevision !== request.expectedRevision) throw new Error("Your draft changed in another tab or device. Refresh before editing further; your unsaved edits remain in this browser.");
    const drafts = launchWizardDraftsSchema.parse(user.launchWizardDrafts);
    const key = launchDraftKey(request.sourceDraftId);
    if (request.draft) {
      if (!(key in drafts) && Object.keys(drafts).length >= 20) throw new Error("You have reached the limit of 20 saved wizard drafts. Clear an old draft before saving another.");
      drafts[key] = request.draft;
    } else {
      delete drafts[key];
    }
    const updated = await tx.user.updateMany({
      where: { id: member.id, launchWizardDraftRevision: request.expectedRevision },
      data: { launchWizardDrafts: drafts, launchWizardDraftRevision: { increment: 1 } },
    });
    if (updated.count !== 1) throw new Error("Your draft changed in another tab or device. Refresh to load the latest saved version.");
    return { revision: request.expectedRevision + 1 };
  });
}
