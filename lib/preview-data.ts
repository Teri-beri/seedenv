import { CampaignStatus, PlatformType, TaskProofType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function ensurePreviewData() {
  if (process.env.NODE_ENV === "production") return;
  const campaignCount = await prisma.appCampaign.count();
  if (campaignCount > 0) return;

  const developer = await prisma.user.upsert({
    where: { email: "preview.developer@seedenv.dev" },
    update: { role: "DEVELOPER" },
    create: { email: "preview.developer@seedenv.dev", username: "PreviewBuilder", role: "DEVELOPER" },
  });
  await prisma.user.upsert({
    where: { email: "preview.tester@seedenv.dev" },
    update: { walletBalanceCents: 1825, xpPoints: 1240, rankTier: "ALPHA_SEEDER", streakDays: 6 },
    create: { email: "preview.tester@seedenv.dev", username: "PreviewSeeder", role: "TESTER", walletBalanceCents: 1825, xpPoints: 1240, rankTier: "ALPHA_SEEDER", streakDays: 6 },
  });

  const campaigns = [
    ["PulseRoom Social Beta", PlatformType.TESTFLIGHT, "Social & UGC", 3.5, 25, 7, "Seed a private social room with authentic intro posts, reactions, and one crisp friction report.", "https://testflight.apple.com/join/pulseroom-seed", "https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=256&h=256&fit=crop"],
    ["FlexTrail Habit Tracker", PlatformType.PLAY_STORE, "Fitness & Wellness", 5, 40, 16, "Create a weekly plan, log one workout, and evaluate whether the streak loop motivates another session.", "https://play.google.com/apps/testing/flextrail", "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=256&h=256&fit=crop"],
    ["NestSwap Marketplace Launch", PlatformType.WEB_STAGING, "Niche Marketplace", 4.25, 30, 12, "Populate a local-goods marketplace with believable listings, saved searches, and checkout trust feedback.", "https://seedenv.com/demo/nestswap", "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=256&h=256&fit=crop"],
  ] as const;

  for (const [title, platform, vibe, bounty, totalSlots, claimedSlots, description, appUrl, iconUrl] of campaigns) {
    await prisma.appCampaign.create({
      data: {
        developerId: developer.id,
        title,
        platform,
        targetVibe: vibe,
        bountyPerTaskUsd: bounty,
        totalBudgetUsd: bounty * totalSlots,
        platformFeeUsd: Number(((bounty * totalSlots) * 0.08).toFixed(2)),
        totalSlots,
        claimedSlots,
        completedSlots: Math.floor(claimedSlots / 2),
        description,
        appUrl,
        iconUrl,
        status: CampaignStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        instructions: {
          create: [
            { stepNumber: 1, instructionTitle: "Open the beta", instructionDetail: "Install or open the staging app and complete the first-run experience.", proofType: TaskProofType.SCREENSHOT },
            { stepNumber: 2, instructionTitle: "Seed authentic data", instructionDetail: "Perform the core action with realistic content that would help a launch community feel alive.", proofType: TaskProofType.ACTION_LINK },
            { stepNumber: 3, instructionTitle: "Submit usability feedback", instructionDetail: "Write one specific friction point, one trust concern, and one thing that felt ready to ship.", proofType: TaskProofType.TEXT_FEEDBACK },
          ],
        },
      },
    });
  }
}
