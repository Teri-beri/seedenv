"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/member";
import { serializable } from "@/lib/quest-ledger";
import { createMissionApplication, reviewMissionApplication, closeMissionApplication } from "@/lib/mission-applications";
import { prisma } from "@/lib/prisma";
import { acceptApplicationWithFunding } from "@/lib/slot-funding";

export async function requestMission(campaignId: string, note: string) {
  const member = await requireMember("TESTER");
  const message = z.string().trim().min(12, "Describe why you are a good fit (at least 12 characters).").max(600).parse(note);
  await serializable((tx) => createMissionApplication(tx, member.id, campaignId, message));
  revalidatePath("/dashboard");
  revalidatePath("/applications");
  return "Request sent. The developer will decide whether to accept you.";
}

export async function decideApplication(id: string, decision: "accept" | "decline") {
  if (decision !== "accept" && decision !== "decline") throw new Error("Choose a valid decision.");
  const member = await requireMember("DEVELOPER");
  const application = decision === "accept" ? await prisma.missionApplication.findUnique({ where: { id }, select: { campaign: { select: { fundingModel: true } } } }) : null;
  if (application?.campaign.fundingModel === "PAY_PER_TESTER") {
    // Return charge failures as text: production server actions hide thrown error messages.
    try {
      const result = await acceptApplicationWithFunding(member.id, id);
      revalidatePath("/applications");
      revalidatePath("/dashboard");
      revalidatePath("/console");
      return result.message;
    } catch (error) {
      return error instanceof Error ? error.message : "The tester could not be accepted. Please try again.";
    }
  }
  await serializable((tx) => reviewMissionApplication(tx, member.id, id, decision));
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  return decision === "accept" ? "Accepted. The tester has up to 24 hours to start." : "Declined. Any reserved pass was returned.";
}

export async function withdrawApplication(id: string) {
  const member = await requireMember("TESTER");
  await serializable((tx) => closeMissionApplication(tx, member.id, id));
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  return "Application closed. Any unused pass was returned.";
}

export async function updateMissionRequirements(campaignId: string, requirements: Array<{ id: string; minimumRep: number }>, discoveryAllowed: boolean, discoveryMinRep: number) {
  const member = await requireMember("DEVELOPER");
  const input = z.object({
    requirements: z.array(z.object({ id: z.string().min(1), minimumRep: z.number().int().min(0).max(1000000) })).min(1).max(12),
    discoveryAllowed: z.boolean(),
    discoveryMinRep: z.number().int().min(0).max(1000000),
  }).parse({ requirements, discoveryAllowed, discoveryMinRep });
  await serializable(async (tx) => {
    const campaign = await tx.appCampaign.findUnique({ where: { id: campaignId }, include: { instructions: true } });
    if (!campaign || campaign.developerId !== member.id) throw new Error("Campaign not found.");
    if (input.requirements.length !== campaign.instructions.length || new Set(input.requirements.map((item) => item.id)).size !== input.requirements.length || input.requirements.some((item) => !campaign.instructions.some((task) => task.id === item.id))) throw new Error("Provide requirements for every task in this campaign.");
    if (input.discoveryAllowed && input.discoveryMinRep > Math.max(...input.requirements.map((item) => item.minimumRep))) throw new Error("The discovery floor cannot exceed the task requirements.");
    for (const item of input.requirements) await tx.taskInstruction.update({ where: { id: item.id }, data: { minimumRep: item.minimumRep } });
    await tx.appCampaign.update({ where: { id: campaignId }, data: { discoveryAllowed: input.discoveryAllowed, discoveryMinRep: input.discoveryMinRep } });
  });
  revalidatePath("/applications");
  revalidatePath("/dashboard");
  return "Task requirements saved. Existing accepted applications are honored.";
}
