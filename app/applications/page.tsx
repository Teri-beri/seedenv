import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { MemberShell } from "@/components/member-shell";
import { ApplicationCenter } from "@/components/application-center";
import { requireMember } from "@/lib/member";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
import { previewNextSlotCharges } from "@/lib/slot-funding";
import { rankThresholds } from "@/lib/rank";
import { serverNowMs } from "@/lib/clock";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  if (!await getServerSession(authOptions)) redirect("/auth/signin?callbackUrl=/applications");
  const member = await requireMember();
  const developer = member.role === "DEVELOPER";
  if (member.role === "ADMIN") redirect("/admin");
  await serializable(async (tx) => {
    const expired = await tx.missionApplication.findMany({ where: { testerId: member.id, status: "ACCEPTED", startBy: { lte: new Date() } } });
    for (const item of expired) {
      await tx.missionApplication.update({ where: { id: item.id }, data: { status: "WITHDRAWN", passReserved: false } });
      if (item.passReserved) await tx.user.update({ where: { id: member.id }, data: { discoveryPasses: { increment: 1 } } });
    }
  });
  const testerSelect = { username: true, avatarUrl: true, xpPoints: true, rankTier: true, _count: { select: { submissions: true } }, ...(developer ? { submissions: { where: { campaign: { developerId: member.id } }, orderBy: { createdAt: "desc" as const }, take: 1, select: { deviceModel: true, osBuild: true } } } : {}) };
  const [applications, campaigns] = await Promise.all([
    prisma.missionApplication.findMany({ where: developer ? { campaign: { developerId: member.id } } : { testerId: member.id }, orderBy: developer ? [{ status: "asc" }, { createdAt: "desc" }] : { createdAt: "desc" }, take: 100, include: { campaign: { select: { title: true, id: true } }, tester: { select: testerSelect } } }),
    developer ? prisma.appCampaign.findMany({ where: { developerId: member.id, status: { in: ["DRAFT", "ACTIVE", "ESCROW_PENDING"] } }, include: { instructions: { orderBy: { stepNumber: "asc" } } }, orderBy: { createdAt: "desc" }, take: 50 }) : Promise.resolve([]),
  ]);
  const pendingCampaignIds = developer ? [...new Set(applications.filter((item) => item.status === "PENDING").map((item) => item.campaign.id))] : [];
  const previews = await previewNextSlotCharges(pendingCampaignIds);
  const chargePreviews = Object.fromEntries([...previews].map(([id, preview]) => [id, preview.credit || !preview.quote ? { credit: true as const } : { credit: false as const, stipendCents: preview.quote.stipendCents, platformFeeCents: preview.quote.platformFeeCents, totalCents: preview.quote.totalCents }]));
  const balance = developer && pendingCampaignIds.length ? await prisma.user.findUnique({ where: { id: member.id }, select: { fundingBalanceCents: true, autoReloadCents: true } }) : null;
  // A run counts as completed only once the developer has approved that tester's proof for that cohort.
  const approved = developer
    ? await prisma.submission.findMany({ where: { status: "APPROVED", campaign: { developerId: member.id } }, select: { campaignId: true, testerId: true }, take: 1000 })
    : [];
  const completedPairs = new Set(approved.map((row) => `${row.campaignId}:${row.testerId}`));
  const serialised = applications.map((item) => ({ ...item, startBy: item.startBy?.toISOString() || null }));
  const queue = serialised.map((item) => ({
    id: item.id,
    status: item.status,
    note: item.note,
    passReserved: item.passReserved,
    startBy: item.startBy,
    completed: completedPairs.has(`${item.campaign.id}:${item.testerId}`),
    campaign: { id: item.campaign.id, title: item.campaign.title },
    tester: {
      username: item.tester.username,
      avatarUrl: item.tester.avatarUrl,
      xpPoints: item.tester.xpPoints,
      rankLabel: rankThresholds[item.tester.rankTier].label,
      submissionCount: item.tester._count.submissions,
      deviceModel: "submissions" in item.tester ? item.tester.submissions[0]?.deviceModel ?? null : null,
      osBuild: "submissions" in item.tester ? item.tester.submissions[0]?.osBuild ?? null : null,
    },
  }));
  const shareCohort = campaigns.find((campaign) => campaign.status === "ACTIVE") || null;
  const renderedAt = serverNowMs();
  return <MemberShell wide={developer} backLabel={developer ? "Back to Console" : undefined} title={developer ? "Tester Applications & Queue" : "Your applications"} subtitle={developer ? "Review validator requests, issue builds, and tune entry rules" : undefined} home={developer ? "/console" : "/dashboard"}><div id="tester-requests" className="scroll-mt-20"><ApplicationCenter developer={developer} applications={serialised} campaigns={campaigns} chargePreviews={chargePreviews} balance={balance ? { balanceCents: balance.fundingBalanceCents, autoReloadCents: balance.autoReloadCents } : undefined} queue={queue} renderedAt={renderedAt} shareCohort={shareCohort ? { id: shareCohort.id, title: shareCohort.title } : null} /></div></MemberShell>;
}
