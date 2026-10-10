import { CampaignStatus } from "@prisma/client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { publicPageMetadata } from "@/lib/seo";
import { CohortBriefLink } from "@/components/cohort-brief-link";

export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata("Explore Beta Testing Missions", "Browse active mobile and web beta testing missions, compare tester rewards, and review feedback requirements before joining SeedEnv.", "/explore");

export default async function ExplorePage() {
  const missions = await prisma.appCampaign.findMany({
    where: { status: CampaignStatus.ACTIVE, expiresAt: { gt: new Date() } },
    select: { id: true, title: true, description: true, targetVibe: true, bountyPerTaskUsd: true, totalSlots: true, claimedSlots: true },
    orderBy: [{ bountyPerTaskUsd: "desc" }, { createdAt: "desc" }],
  });

  return (
    <>
      <h1>Explore Beta Testing Missions</h1>
      <p>Find mobile and web apps looking for real usage evidence and structured feedback.</p>
      <div className="mt-8 divide-y divide-white/10 border-y border-white/10">
        {missions.length === 0 ? <p className="pb-6">No active missions right now. Check back for new testing opportunities.</p> : null}
        {missions.map((mission) => {
          const available = Math.max(0, mission.totalSlots - mission.claimedSlots);
          return (
            <article key={mission.id} className="py-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="!mt-0 break-words"><CohortBriefLink campaignId={mission.id}>{mission.title}</CohortBriefLink></h2>
                <span className="font-mono font-semibold text-emerald-300">${mission.bountyPerTaskUsd.toFixed(2)} / approved task</span>
              </div>
              <p className="break-words">{mission.description}</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-sm">
                <span className="break-words text-neutral-400">{mission.targetVibe} - {available} open slots</span>
                {available > 0 ? (
                  <Link href="/auth/signin?callbackUrl=%2Fdashboard" className="inline-flex items-center gap-2 font-semibold text-emerald-300">
                    Join to test <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                ) : <span className="text-neutral-400">All slots claimed</span>}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}