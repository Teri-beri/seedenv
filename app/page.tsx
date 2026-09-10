import { CampaignStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { PublicLanding } from "@/components/public-landing";
import { ensurePreviewData } from "@/lib/preview-data";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getOptionalViewer() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return null;
    return prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        username: true,
        role: true,
        walletBalanceCents: true,
        avatarUrl: true,
        image: true,
      },
    });
  } catch (error) {
    console.error("SeedEnv optional session lookup failed:", error);
    return null;
  }
}

export default async function Home() {
  await ensurePreviewData();
  const [missions, viewer] = await Promise.all([
    prisma.appCampaign.findMany({
      where: { status: CampaignStatus.ACTIVE, expiresAt: { gt: new Date() } },
      include: { instructions: { orderBy: { stepNumber: "asc" } } },
      orderBy: [{ bountyPerTaskUsd: "desc" }, { createdAt: "desc" }],
    }),
    getOptionalViewer(),
  ]);

  return <PublicLanding missions={missions} viewer={viewer} />;
}
