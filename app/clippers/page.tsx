import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth-options";
import { MemberShell } from "@/components/member-shell";
import { ClipperWorkspace } from "@/components/clipper-workspace";
import { clipMember, clippersEnabled } from "@/lib/clippers";
import { tikTokConfigured } from "@/lib/clipper-tiktok";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClippersPage({ searchParams }: { searchParams: Promise<{ social?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin?callbackUrl=/clippers");
  const home = session.user.role === "DEVELOPER" ? "/console" : session.user.role === "ADMIN" ? "/admin" : "/dashboard";
  if (!clippersEnabled()) return <MemberShell title="Clippers" home={home}><section className="rounded-3xl border border-violet-400/25 p-6"><h2 className="text-2xl font-bold">Creator collaborations are being prepared.</h2><p className="mt-4 text-sm leading-7 text-neutral-400">This workspace stays disabled until its database migration, private video storage, Stripe payment webhooks, and administrator dispute coverage are ready. No creator payments or social accounts are simulated.</p></section></MemberShell>;
  const member = await clipMember();
  const developer = member.role === "DEVELOPER";
  const { social } = await searchParams;
  if (member.role === "ADMIN") {
    const disputes = await prisma.clipEngagement.findMany({ where: { OR: [{ status: { in: ["DISPUTED", "PAYMENT_PENDING", "CANCEL_PENDING"] } }, { disputeOpenedBy: "STRIPE" }] }, take: 100, orderBy: { updatedAt: "desc" }, include: { campaign: { select: { id: true, title: true } }, creator: { select: { username: true } } } });
    return <MemberShell title="Clippers / administrator review" home={home}><h2 className="mb-4 text-xl font-bold">Disputes & payment reconciliation</h2><p className="mb-5 text-sm leading-6 text-neutral-400">Review each party&apos;s evidence before resuming or refunding. Resolve Stripe charge disputes in Stripe before resuming contracts. Never release a duplicate transfer.</p>{disputes.map((item) => <Link key={item.id} href={`/clippers/${item.campaign.id}`} className="mb-3 block rounded-xl border border-stroke p-4 text-sm">{item.campaign.title} / {item.creator.username} / {item.status}</Link>)}{!disputes.length ? <p className="text-sm text-neutral-400">No agreements require review.</p> : null}</MemberShell>;
  }
  const [profile, campaigns, agreements, socialAccount] = await Promise.all([
    prisma.clipProfile.findUnique({ where: { userId: member.id }, select: { bio: true, portfolioUrl: true, socialUrl: true, specialties: true } }),
    prisma.clipCampaign.findMany({ where: developer ? { developerId: member.id } : { open: true }, take: 50, orderBy: { createdAt: "desc" }, include: { developer: { select: { username: true } } } }),
    prisma.clipEngagement.findMany({ where: developer ? { campaign: { developerId: member.id } } : { creatorId: member.id }, take: 100, orderBy: { updatedAt: "desc" }, select: { id: true, status: true, feeCents: true, campaign: { select: { id: true, title: true } } } }),
    prisma.clipSocialAccount.findUnique({ where: { userId_provider: { userId: member.id, provider: "TIKTOK" } }, select: { displayName: true } }),
  ]);
  return <MemberShell title="Clippers" home={home}><ClipperWorkspace developer={developer} profile={profile} campaigns={campaigns} agreements={agreements} socialName={socialAccount?.displayName || null} tikTokEnabled={tikTokConfigured()} socialStatus={social} platformFeeWaived={member.platformFeeWaived} /><p className="mt-6 text-xs text-neutral-500">Showing the latest 50 campaigns and 100 agreements. Creator fees are separate from tester mission payouts and grant no automatic REP or Quest XP.</p></MemberShell>;
}
