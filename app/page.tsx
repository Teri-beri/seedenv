import { CampaignStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { PublicLanding } from "@/components/public-landing";
import TelemetryGridCanvas from "@/components/TelemetryGridCanvas";
import { prisma } from "@/lib/prisma";
import { landingViewHref, resolveLandingView } from "@/lib/landing-views";
import { redirect } from "next/navigation";

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
  if (params?.view) {
    const destination = landingViewHref(resolveLandingView(params.view));
    redirect(destination.startsWith("#") ? `/${destination}` : destination);
  }
  const [directory, viewer] = await Promise.all([
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
  ]);

  return (
    <div className="relative isolate min-h-screen bg-[#0A0D12]">
      <TelemetryGridCanvas />
      <div className="relative z-10">
        <PublicLanding missions={directory.missions} viewer={viewer} directoryUnavailable={directory.unavailable} />
      </div>
    </div>
  );
}
