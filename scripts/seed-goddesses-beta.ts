import { CampaignStatus, PlatformType, PrismaClient, TaskProofType } from "@prisma/client";

const prisma = new PrismaClient();
const appUrl = "https://testflight.apple.com/join/mRBmnG8M";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Usage: npm run seed:goddesses-beta");
  console.log("Creates or updates the active Goddesses App Beta Validation mission.");
  process.exit(0);
}

async function main() {
  const developer = await prisma.user.findFirst({ where: { role: "DEVELOPER" }, orderBy: { createdAt: "asc" } });
  if (!developer) throw new Error("Create a developer account before seeding the Goddesses beta mission.");

  const existing = await prisma.appCampaign.findFirst({ where: { title: "Goddesses App Beta Validation" } });
  const campaign = existing || await prisma.appCampaign.create({
    data: {
      developerId: developer.id,
      title: "Goddesses App Beta Validation",
      platform: PlatformType.TESTFLIGHT,
      appUrl,
      targetVibe: "Social & UGC",
      description: "Validate the real Goddesses TestFlight beta: onboarding, profile setup, community discovery, and trust friction.",
      totalBudgetUsd: 216,
      bountyPerTaskUsd: 5,
      platformFeeUsd: 18,
      totalSlots: 40,
      status: CampaignStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      instructions: { create: [
        { stepNumber: 1, instructionTitle: "Install and onboard", instructionDetail: "Join the TestFlight beta, create an account, and complete the first-run flow.", proofType: TaskProofType.SCREENSHOT },
        { stepNumber: 2, instructionTitle: "Explore the core loop", instructionDetail: "Visit the home feed, open a Goddess profile, and try one community interaction.", proofType: TaskProofType.ACTION_LINK },
        { stepNumber: 3, instructionTitle: "Report trust friction", instructionDetail: "Submit your device metadata, one specific friction point, expected behavior, actual behavior, and any crash or network logs.", proofType: TaskProofType.TEXT_FEEDBACK },
      ] },
    },
  });

  if (existing && (existing.appUrl !== appUrl || existing.status !== CampaignStatus.ACTIVE)) {
    await prisma.appCampaign.update({ where: { id: existing.id }, data: { appUrl, status: CampaignStatus.ACTIVE } });
  }
  console.log(`Goddesses beta mission ready: ${campaign.id}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());