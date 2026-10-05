import { CampaignStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { PublicLanding } from "@/components/public-landing";
import { prisma } from "@/lib/prisma";
import { resolveLandingView } from "@/lib/landing-views";
import { publicLaunchCircle } from "@/lib/public-launch-circle";

export const dynamic = "force-dynamic";

async function getOptionalViewer() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return null;
    return await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        role: true,
      },
    });
  } catch (error) {
    console.error("SeedEnv optional session lookup failed:", error);
    return null;
  }
}

export default async function Home({ searchParams }: { searchParams?: Promise<{ view?: string }> } = {}) {
  const params = await searchParams;
  const view = resolveLandingView(params?.view);
  const [directory, viewer, circle] = await Promise.all([
    prisma.appCampaign.findMany({
      where: { status: CampaignStatus.ACTIVE, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        title: true,
        iconUrl: true,
        platform: true,
        targetVibe: true,
        description: true,
        bountyPerTaskUsd: true,
        totalSlots: true,
        claimedSlots: true,
        instructions: { select: { instructionTitle: true }, orderBy: { stepNumber: "asc" } },
      },
      orderBy: [{ bountyPerTaskUsd: "desc" }, { createdAt: "desc" }],
    }).then((missions) => ({ missions, unavailable: false })).catch((error: unknown) => {
      console.error("SeedEnv public cohort lookup failed:", error);
      return { missions: [], unavailable: true };
    }),
    getOptionalViewer(),
    view === "circle" ? publicLaunchCircle() : Promise.resolve({ posts: [], unavailable: false }),
  ]);

  return <PublicLanding missions={directory.missions} viewer={viewer} directoryUnavailable={directory.unavailable} view={view} circlePosts={circle.posts} circleUnavailable={circle.unavailable} />;
}
