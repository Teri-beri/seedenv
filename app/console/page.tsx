import { SubmissionStatus } from "@prisma/client";
import { ArrowUpRight } from "lucide-react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import AuthCheck from "@/components/AuthCheck";
import { DeveloperStudio } from "@/components/developer-studio";
import { DeveloperHeader } from "@/components/navigation";
import { ensurePreviewData } from "@/lib/preview-data";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ConsolePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");
  if (session.user.role !== "DEVELOPER") redirect("/");

  await ensurePreviewData();
  const [pendingSubmissions, approvedAssets, campaigns] = await Promise.all([
    prisma.submission.findMany({
      where: { status: SubmissionStatus.PENDING, proofImageUrl: { not: null } },
      include: { tester: true, campaign: { include: { instructions: { orderBy: { stepNumber: "asc" } } } } },
      take: 5,
      orderBy: { createdAt: "asc" },
    }),
    prisma.submission.findMany({
      where: { status: SubmissionStatus.APPROVED },
      include: { tester: true, campaign: true },
      take: 12,
      orderBy: { reviewedAt: "desc" },
    }),
    prisma.appCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, title: true, totalSlots: true, claimedSlots: true, completedSlots: true, bountyPerTaskUsd: true },
    }),
  ]);

  return (
    <AuthCheck role="DEVELOPER">
    <main className="terminal-grid min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(109,40,217,0.2),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(245,158,11,0.12),transparent_24%),linear-gradient(180deg,#090A0F_0%,#10131C_50%,#090A0F_100%)] pb-16 text-white">
      <DeveloperHeader />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="mb-8 grid gap-6 lg:grid-cols-[1fr_420px]">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-amber-500">SeedEnv Console</p>
            <h1 className="mt-3 max-w-4xl bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-5xl font-black leading-[0.98] tracking-tight text-transparent sm:text-6xl">
              Campaign operations without the tester HUD clutter.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-400">
              Launch seed missions, fund escrow, review proof, and export validated assets from one dedicated developer workspace.
            </p>
            <a className="mt-6 inline-flex items-center rounded-xl border border-[#1F2430] bg-[#0E1017]/80 px-4 py-2 text-sm font-semibold text-neutral-300 transition-all hover:border-violet-500/30 hover:text-white" href="/dashboard">
              Open Tester Dashboard <ArrowUpRight className="ml-2 size-4" />
            </a>
          </div>
          <div className="luxury-panel rounded-2xl p-5 transition-all hover:border-violet-500/30">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Active Deployments</p>
            <div className="mt-4 space-y-3">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-4 backdrop-blur-md transition-all hover:border-violet-500/30">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold text-white">{campaign.title}</h2>
                    <span className="font-mono text-sm text-amber-500">${campaign.bountyPerTaskUsd.toFixed(2)}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-700 to-amber-500" style={{ width: `${(campaign.claimedSlots / campaign.totalSlots) * 100}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">{campaign.completedSlots} complete / {campaign.claimedSlots} claimed / {campaign.totalSlots} total</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <DeveloperStudio submissions={pendingSubmissions} assets={approvedAssets} />
      </div>
    </main>
    </AuthCheck>
  );
}
