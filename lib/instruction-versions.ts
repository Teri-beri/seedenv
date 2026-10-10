import type { Prisma, CohortInstructionVersion, TaskInstruction } from "@prisma/client";
import { z } from "zod";

const directionSchema = z.object({
  id: z.string(),
  stepNumber: z.number().int(),
  instructionTitle: z.string(),
  instructionDetail: z.string(),
  proofType: z.enum(["SCREENSHOT", "TEXT_FEEDBACK", "ACTION_LINK"]),
  minimumRep: z.number().int(),
});
export type VersionDirection = z.infer<typeof directionSchema>;

export function versionDirections(version: Pick<CohortInstructionVersion, "directions">): VersionDirection[] {
  return z.array(directionSchema).parse(version.directions);
}

export function assignedCampaign<T extends { id: string; instructions: TaskInstruction[]; instructionRevision: number }>(campaign: T, version: CohortInstructionVersion | null) {
  if (!version || version.campaignId !== campaign.id) throw new Error("Accepted instruction version is missing or belongs to another cohort.");
  return {
    ...campaign,
    instructions: versionDirections(version).map((step) => ({ ...step, campaignId: campaign.id })),
    acceptedInstructionRevision: version.revision,
    directionsUpdated: campaign.instructionRevision > version.revision,
  };
}

export async function currentInstructionVersion(tx: Prisma.TransactionClient, campaignId: string) {
  const campaign = await tx.appCampaign.findUniqueOrThrow({
    where: { id: campaignId }, include: { instructions: { orderBy: { stepNumber: "asc" } } },
  });
  const existing = await tx.cohortInstructionVersion.findUnique({
    where: { campaignId_revision: { campaignId, revision: campaign.instructionRevision } },
  });
  if (existing) return existing;
  return tx.cohortInstructionVersion.create({
    data: {
      campaignId, revision: campaign.instructionRevision, editedById: campaign.developerId,
      directions: campaign.instructions.map(({ id, stepNumber, instructionTitle, instructionDetail, proofType, minimumRep }) => ({ id, stepNumber, instructionTitle, instructionDetail, proofType, minimumRep })),
    },
  });
}

export const editDirectionsSchema = z.object({
  campaignId: z.string().min(1),
  expectedRevision: z.number().int().positive(),
  directions: z.array(z.object({
    id: z.string().min(1),
    instructionTitle: z.string().trim().min(3).max(90),
    instructionDetail: z.string().trim().min(12).max(900),
  }).strict()).min(1).max(12),
}).strict();

export class InstructionEditError extends Error {}

export async function editCohortDirections(tx: Prisma.TransactionClient, developerId: string, input: z.infer<typeof editDirectionsSchema>) {
  const campaign = await tx.appCampaign.findUnique({ where: { id: input.campaignId }, include: { instructions: { orderBy: { stepNumber: "asc" } } } });
  if (!campaign || campaign.developerId !== developerId) throw new InstructionEditError("Cohort not found for your account.");
  if (campaign.status !== "ACTIVE" || campaign.expiresAt <= new Date()) throw new InstructionEditError("Only active, unexpired cohorts can edit directions.");
  if (campaign.instructionRevision !== input.expectedRevision) throw new InstructionEditError("Directions changed while you were editing. Reload the page before saving.");
  if (input.directions.length !== campaign.instructions.length || new Set(input.directions.map((step) => step.id)).size !== input.directions.length || input.directions.some((step) => !campaign.instructions.some((original) => original.id === step.id))) throw new InstructionEditError("Edit the existing steps only. Adding, removing or replacing steps is not allowed.");
  const directions = campaign.instructions.map((step) => {
    const edit = input.directions.find((item) => item.id === step.id)!;
    return { id: step.id, stepNumber: step.stepNumber, instructionTitle: edit.instructionTitle, instructionDetail: edit.instructionDetail, proofType: step.proofType, minimumRep: step.minimumRep };
  });
  if (directions.every((step, index) => step.instructionTitle === campaign.instructions[index].instructionTitle && step.instructionDetail === campaign.instructions[index].instructionDetail)) throw new InstructionEditError("No direction changes to save.");
  await currentInstructionVersion(tx, campaign.id);
  const revision = campaign.instructionRevision + 1;
  const updated = await tx.appCampaign.updateMany({
    where: { id: campaign.id, instructionRevision: input.expectedRevision, status: "ACTIVE" },
    data: { instructionRevision: revision },
  });
  if (updated.count !== 1) throw new InstructionEditError("Directions changed while you were editing. Reload before saving.");
  const version = await tx.cohortInstructionVersion.create({ data: { campaignId: campaign.id, revision, directions, editedById: developerId } });
  for (const step of directions) await tx.taskInstruction.update({ where: { id: step.id }, data: { instructionTitle: step.instructionTitle, instructionDetail: step.instructionDetail } });
  return version;
}
