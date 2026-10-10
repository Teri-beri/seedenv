import type { Prisma } from "@prisma/client";
import { applicationEligibility, startWindowHours } from "@/lib/quest-rules";
import { assertCampaignFunding } from "@/lib/funding-reversals";
import { serviceTaxAudit } from "@/lib/billing/tax-policy";
import { currentInstructionVersion } from "@/lib/instruction-versions";

export class MissionApplicationError extends Error {}

export async function createMissionApplication(tx: Prisma.TransactionClient, testerId: string, campaignId: string, note: string) {
  const user = await tx.user.findUniqueOrThrow({ where: { id: testerId } });
  const campaign = await tx.appCampaign.findUnique({ where: { id: campaignId }, include: { instructions: true } });
  if (!campaign || campaign.status !== "ACTIVE" || campaign.expiresAt <= new Date()) throw new MissionApplicationError("This mission is not accepting applications.");
  if (campaign.developerId === user.id) throw new MissionApplicationError("You cannot apply to your own cohort. Use a separate tester account to test the joining flow.");
  const previous = await tx.missionApplication.findUnique({ where: { campaignId_testerId: { campaignId, testerId } } });
  const submission = await tx.submission.findUnique({ where: { campaignId_testerId: { campaignId, testerId } } });
  if (submission && ["PENDING", "APPROVED"].includes(submission.status)) throw new MissionApplicationError("You already have work in progress or approved for this mission.");
  if (previous && !["DECLINED", "WITHDRAWN"].includes(previous.status) && !(previous.status === "STARTED" && submission && ["REJECTED", "EXPIRED"].includes(submission.status))) throw new MissionApplicationError("You have already applied to this mission. View your request in Applications.");
  const required = Math.max(0, ...campaign.instructions.map((item) => item.minimumRep));
  const eligibility = applicationEligibility(user.xpPoints, required, campaign.discoveryAllowed, campaign.discoveryMinRep);
  if (eligibility === "locked") throw new MissionApplicationError(`This mission requires ${required} REP. Discovery applications are not available for your reputation.`);
  if (eligibility === "pass") {
    const reserved = await tx.user.updateMany({ where: { id: testerId, discoveryPasses: { gt: 0 } }, data: { discoveryPasses: { decrement: 1 } } });
    if (!reserved.count) throw new MissionApplicationError("Earn or exchange Quest XP for a Discovery Pass first.");
  }
  return tx.missionApplication.upsert({ where: { campaignId_testerId: { campaignId, testerId } }, create: { testerId, campaignId, note, passReserved: eligibility === "pass" }, update: { status: "PENDING", note, passReserved: eligibility === "pass", startBy: null, instructionVersionId: null } });
}

export async function reviewMissionApplication(tx: Prisma.TransactionClient, developerId: string, id: string, decision: "accept" | "decline") {
  const application = await tx.missionApplication.findUnique({ where: { id }, include: { campaign: true } });
  if (!application || application.campaign.developerId !== developerId || application.status !== "PENDING") throw new Error("Pending application not found for your campaign.");
  if (decision === "accept") {
    const campaign = application.campaign;
    await assertCampaignFunding(tx, campaign.id);
    await serviceTaxAudit(tx, developerId);
    if (campaign.status !== "ACTIVE" || campaign.expiresAt <= new Date()) throw new Error("Activate the campaign before accepting testers.");
    if (campaign.fundingModel === "PAY_PER_TESTER") throw new Error("Pay-per-tester cohorts must charge the slot before accepting.");
    const held = await tx.missionApplication.count({ where: { campaignId: campaign.id, status: "ACCEPTED", startBy: { gt: new Date() } } });
    if (campaign.claimedSlots + held >= campaign.totalSlots) throw new Error("All mission places are already reserved.");
    const version = await currentInstructionVersion(tx, campaign.id);
    return tx.missionApplication.update({ where: { id }, data: { status: "ACCEPTED", instructionVersionId: version.id, startBy: new Date(Math.min(campaign.expiresAt.getTime(), Date.now() + startWindowHours * 3600000)) } });
  }
  await tx.missionApplication.update({ where: { id }, data: { status: "DECLINED", passReserved: false } });
  if (application.passReserved) await tx.user.update({ where: { id: application.testerId }, data: { discoveryPasses: { increment: 1 } } });
}

export async function closeMissionApplication(tx: Prisma.TransactionClient, testerId: string, id: string) {
  const item = await tx.missionApplication.findUnique({ where: { id } });
  if (!item || item.testerId !== testerId || !["PENDING", "ACCEPTED"].includes(item.status)) throw new Error("This application cannot be withdrawn.");
  await tx.missionApplication.update({ where: { id }, data: { status: "WITHDRAWN", passReserved: false } });
  if (item.passReserved) await tx.user.update({ where: { id: testerId }, data: { discoveryPasses: { increment: 1 } } });
}

export async function startAcceptedApplication(tx: Prisma.TransactionClient, testerId: string, campaignId: string) {
  const application = await tx.missionApplication.findUnique({ where: { campaignId_testerId: { campaignId, testerId } } });
  if (!application || application.status !== "ACCEPTED" || !application.startBy || application.startBy <= new Date()) throw new Error("Request to join and wait for developer acceptance before starting this mission.");
  await tx.missionApplication.update({ where: { id: application.id }, data: { status: "STARTED", passReserved: false } });
  if (!application.instructionVersionId) throw new Error("Accepted directions are missing. Contact SeedEnv support before starting.");
  return application.instructionVersionId;
}
