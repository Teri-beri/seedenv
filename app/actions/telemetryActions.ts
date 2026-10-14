"use server";

import { CampaignStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/member";
import { prisma } from "@/lib/prisma";

export async function setCohortTelemetryPause(campaignId: string, paused: boolean) {
  const developer = await requireMember("DEVELOPER");
  const campaign = await prisma.appCampaign.findFirst({
    where: { id: campaignId, developerId: developer.id },
    select: { id: true, status: true, cancelledAt: true, expiresAt: true },
  });
  if (!campaign) return { ok: false as const, message: "Cohort not found." };
  if (campaign.cancelledAt || campaign.expiresAt <= new Date() || campaign.status === CampaignStatus.COMPLETED) {
    return { ok: false as const, message: "Completed or cancelled cohorts cannot be resumed." };
  }
  const expectedStatus = paused ? CampaignStatus.ACTIVE : CampaignStatus.PAUSED;
  const nextStatus = paused ? CampaignStatus.PAUSED : CampaignStatus.ACTIVE;
  if (campaign.status === nextStatus) return { ok: true as const, status: nextStatus };
  if (campaign.status !== expectedStatus) return { ok: false as const, message: `Cohort cannot be ${paused ? "paused" : "resumed"} from ${campaign.status}.` };

  const changed = await prisma.appCampaign.updateMany({
    where: { id: campaign.id, developerId: developer.id, status: expectedStatus, cancelledAt: null, expiresAt: { gt: new Date() } },
    data: { status: nextStatus },
  });
  if (changed.count !== 1) return { ok: false as const, message: "Cohort state changed. Refresh and try again." };
  revalidatePath("/console");
  revalidatePath("/console/monitor");
  revalidatePath("/dashboard");
  return { ok: true as const, status: nextStatus };
}
