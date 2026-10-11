import { prisma } from "@/lib/prisma";

/**
 * Records a tester's engagement day from an authenticated activity event SeedEnv actually
 * observed, so the audit kit reflects real cohort activity rather than self-service check-ins.
 * Safe to repeat: one row per tester per day.
 */
export async function recordCompliancePing(input: {
  campaignId: string;
  testerId: string;
  testerHandle: string;
  deviceModel: string | null;
  osVersion: string | null;
  sessionDuration?: number;
  at?: Date;
}) {
  const now = input.at ?? new Date();
  const campaign = await prisma.appCampaign.findFirst({
    where: { id: input.campaignId, cohortType: "GOOGLE_PLAY_14_DAY" },
    select: { launchedAt: true, createdAt: true, compliance: { select: { id: true, targetDays: true, requiredTesters: true, status: true } } },
  });
  const compliance = campaign?.compliance;
  if (!campaign || !compliance) return null;
  const start = campaign.launchedAt ?? campaign.createdAt;
  const dayNumber = Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1;
  if (dayNumber < 1 || dayNumber > compliance.targetDays) return null;

  const existing = await prisma.dailyPingLog.findFirst({ where: { complianceId: compliance.id, validatorId: input.testerId, dayNumber } });
  const data = {
    deviceModel: input.deviceModel?.trim() || "Not reported",
    osVersion: input.osVersion?.trim() || "Not reported",
    sessionDuration: Math.max(1, Math.min(86_400, Math.round(input.sessionDuration ?? 1))),
    validatorHandle: input.testerHandle,
  };
  if (existing) await prisma.dailyPingLog.update({ where: { id: existing.id }, data });
  else await prisma.dailyPingLog.create({ data: { complianceId: compliance.id, validatorId: input.testerId, dayNumber, ...data } });

  const rows = await prisma.dailyPingLog.findMany({ where: { complianceId: compliance.id }, select: { dayNumber: true, validatorId: true } });
  const complete = Array.from({ length: compliance.targetDays }, (_, index) => index + 1)
    .every((day) => new Set(rows.filter((row) => row.dayNumber === day).map((row) => row.validatorId)).size >= compliance.requiredTesters);
  if (complete && compliance.status === "ACTIVE") {
    await prisma.cohortCompliance.update({ where: { id: compliance.id }, data: { status: "READY_FOR_REVIEW" } });
  }
  return { dayNumber, complete };
}
