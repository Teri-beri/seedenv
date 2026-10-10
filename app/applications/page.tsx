import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { MemberShell } from "@/components/member-shell";
import { ApplicationCenter } from "@/components/application-center";
import { requireMember } from "@/lib/member";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
import { previewNextSlotCharges } from "@/lib/slot-funding";

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
  const [applications, campaigns] = await Promise.all([
    prisma.missionApplication.findMany({ where: developer ? { campaign: { developerId: member.id } } : { testerId: member.id }, orderBy: developer ? [{ status: "asc" }, { createdAt: "desc" }] : { createdAt: "desc" }, take: 100, include: { campaign: { select: { title: true, id: true } }, tester: { select: { username: true, xpPoints: true, _count: { select: { submissions: true } } } } } }),
    developer ? prisma.appCampaign.findMany({ where: { developerId: member.id, status: { in: ["DRAFT", "ACTIVE", "ESCROW_PENDING"] } }, include: { instructions: { orderBy: { stepNumber: "asc" } } }, orderBy: { createdAt: "desc" }, take: 50 }) : Promise.resolve([]),
  ]);
  const pendingCampaignIds = developer ? [...new Set(applications.filter((item) => item.status === "PENDING").map((item) => item.campaign.id))] : [];
  const previews = await previewNextSlotCharges(pendingCampaignIds);
  const chargePreviews = Object.fromEntries([...previews].map(([id, preview]) => [id, preview.credit || !preview.quote ? { credit: true as const } : { credit: false as const, stipendCents: preview.quote.stipendCents, platformFeeCents: preview.quote.platformFeeCents, totalCents: preview.quote.totalCents }]));
  const balance = developer && pendingCampaignIds.length ? await prisma.user.findUnique({ where: { id: member.id }, select: { fundingBalanceCents: true, autoReloadCents: true } }) : null;
  return <MemberShell title={developer ? "Tester requests & applications" : "Your applications"} home={developer ? "/console" : "/dashboard"}><ApplicationCenter developer={developer} applications={applications.map((item) => ({ ...item, startBy: item.startBy?.toISOString() || null }))} campaigns={campaigns} chargePreviews={chargePreviews} balance={balance ? { balanceCents: balance.fundingBalanceCents, autoReloadCents: balance.autoReloadCents } : undefined} /><p className="mt-5 text-xs text-neutral-500">{developer ? "Showing up to 100 requests, with pending requests first, and up to 50 configurable campaigns." : "Showing your latest 100 requests."}</p></MemberShell>;
}
