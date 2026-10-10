import { CampaignStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { PublicLanding } from "@/components/public-landing";
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
        id: true,
        role: true,
      },
    });
  } catch (error) {
    console.error("SeedEnv optional session lookup failed:", error);
    return null;
  }
}

async function getLaunchOffer() {
  try {
    const offer = await prisma.cohortPromoCode.findUnique({ where: { code: "FIRSTDROP" } });
    if (!offer || !offer.enabled || offer.ownerId || offer.discountPercent !== 100 || !offer.expiresAt || offer.expiresAt <= new Date() || offer.reservedCount >= offer.maxRedemptions) return null;
    return { code: offer.code, remaining: offer.maxRedemptions - offer.reservedCount, expiresAt: offer.expiresAt.toISOString() };
  } catch (error) {
    console.error("SeedEnv landing promo availability lookup failed:", error);
    return null;
  }
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const { view } = await searchParams;
  if (typeof view === "string" && view) {
    const destination = landingViewHref(resolveLandingView(view));
    redirect(destination.startsWith("#") ? `/${destination}` : destination);
  }
  const [directory, viewer, launchOffer] = await Promise.all([
    prisma.appCampaign.findMany({
      where: { status: CampaignStatus.ACTIVE, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        developerId: true,
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
    getLaunchOffer(),
  ]);

  return <PublicLanding missions={directory.missions} viewer={viewer} directoryUnavailable={directory.unavailable} launchOffer={launchOffer} />;
}
