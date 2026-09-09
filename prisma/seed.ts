import { PrismaClient, CampaignStatus, PlatformType, RankTier, TaskProofType, TransactionStatus, TransactionType, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);
const cents = (usd: number) => Math.round(usd * 100);

async function main() {
  await prisma.walletTransaction.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.taskInstruction.deleteMany();
  await prisma.appCampaign.deleteMany();
  await prisma.user.deleteMany();

  const [tester, developer, admin] = await Promise.all([
    prisma.user.create({
      data: {
        email: "maya.tester@seedenv.dev",
        username: "MayaSeeder",
        role: UserRole.TESTER,
        avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160&h=160&fit=crop&crop=faces",
        walletBalanceCents: 2850,
        xpPoints: 1340,
        rankTier: RankTier.ALPHA_SEEDER,
        streakDays: 8,
      },
    }),
    prisma.user.create({
      data: {
        email: "nolan.builder@seedenv.dev",
        username: "NolanLaunchLab",
        role: UserRole.DEVELOPER,
        avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&h=160&fit=crop&crop=faces",
        stripeCustomerId: "cus_seed_developer",
        stripeConnectAccountId: "acct_seed_developer",
      },
    }),
    prisma.user.create({
      data: {
        email: "admin@seedenv.dev",
        username: "SeedEnvOps",
        role: UserRole.ADMIN,
        xpPoints: 9000,
        rankTier: RankTier.APEX_ARCHITECT,
      },
    }),
  ]);

  const campaigns = [
    {
      title: "PulseRoom Social Beta",
      platform: PlatformType.TESTFLIGHT,
      appUrl: "https://testflight.apple.com/join/pulseroom-seed",
      iconUrl: "https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=256&h=256&fit=crop",
      targetVibe: "Social & UGC",
      description: "Seed a private social room with authentic intro posts, reactions, and one useful friction report.",
      totalSlots: 25,
      claimedSlots: 7,
      completedSlots: 4,
      bountyPerTaskUsd: 3.5,
      totalBudgetUsd: 87.5,
      platformFeeUsd: 17.5,
      expiresAt: daysFromNow(12),
      instructions: [
        ["Join TestFlight", "Install PulseRoom and complete onboarding with a profile photo.", TaskProofType.SCREENSHOT],
        ["Seed community data", "Create one intro post, reply to two members, and react to three posts.", TaskProofType.ACTION_LINK],
        ["Report usability friction", "Write one specific issue and one improvement idea from your session.", TaskProofType.TEXT_FEEDBACK],
      ],
    },
    {
      title: "FlexTrail Habit Tracker",
      platform: PlatformType.PLAY_STORE,
      appUrl: "https://play.google.com/apps/testing/flextrail",
      iconUrl: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=256&h=256&fit=crop",
      targetVibe: "Fitness & Wellness",
      description: "Test a fitness habit loop by creating a weekly plan, logging a workout, and reviewing streak clarity.",
      totalSlots: 40,
      claimedSlots: 16,
      completedSlots: 11,
      bountyPerTaskUsd: 5,
      totalBudgetUsd: 200,
      platformFeeUsd: 40,
      expiresAt: daysFromNow(18),
      instructions: [
        ["Build a plan", "Create a three-day workout plan using the guided setup.", TaskProofType.SCREENSHOT],
        ["Log an activity", "Complete or simulate one activity and save the workout note.", TaskProofType.SCREENSHOT],
        ["Evaluate motivation", "Explain whether the streak and reward prompts made you want to continue.", TaskProofType.TEXT_FEEDBACK],
      ],
    },
    {
      title: "NestSwap Marketplace Launch",
      platform: PlatformType.WEB_STAGING,
      appUrl: "https://seedenv.com/demo/nestswap",
      iconUrl: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=256&h=256&fit=crop",
      targetVibe: "Niche Marketplace",
      description: "Populate a local-goods marketplace with believable listings, saved searches, and checkout feedback.",
      totalSlots: 30,
      claimedSlots: 12,
      completedSlots: 6,
      bountyPerTaskUsd: 4.25,
      totalBudgetUsd: 127.5,
      platformFeeUsd: 25.5,
      expiresAt: daysFromNow(21),
      instructions: [
        ["Create a listing", "Post one realistic item with a title, category, price, and photo.", TaskProofType.SCREENSHOT],
        ["Act like a buyer", "Save two items, message one seller, and copy the staging listing URL.", TaskProofType.ACTION_LINK],
        ["Checkout critique", "Describe one blocker that would stop you from trusting the marketplace.", TaskProofType.TEXT_FEEDBACK],
      ],
    },
  ] as const;

  for (const campaignData of campaigns) {
    await prisma.appCampaign.create({
      data: {
        developerId: developer.id,
        title: campaignData.title,
        platform: campaignData.platform,
        appUrl: campaignData.appUrl,
        iconUrl: campaignData.iconUrl,
        targetVibe: campaignData.targetVibe,
        description: campaignData.description,
        totalBudgetUsd: campaignData.totalBudgetUsd,
        bountyPerTaskUsd: campaignData.bountyPerTaskUsd,
        platformFeeUsd: campaignData.platformFeeUsd,
        totalSlots: campaignData.totalSlots,
        claimedSlots: campaignData.claimedSlots,
        completedSlots: campaignData.completedSlots,
        status: CampaignStatus.ACTIVE,
        expiresAt: campaignData.expiresAt,
        instructions: {
          create: campaignData.instructions.map(([instructionTitle, instructionDetail, proofType], index) => ({
            stepNumber: index + 1,
            instructionTitle,
            instructionDetail,
            proofType,
          })),
        },
      },
    });
  }

  const firstCampaign = await prisma.appCampaign.findFirstOrThrow({ where: { title: "PulseRoom Social Beta" } });
  await prisma.submission.create({
    data: {
      campaignId: firstCampaign.id,
      testerId: tester.id,
      proofImageUrl: "https://images.unsplash.com/photo-1551650975-87deedd944c3?w=1200&h=800&fit=crop",
      proofImageHash: "seed-proof-pulseroom-001",
      feedbackText: "The onboarding felt fast, but the room invite copy needs a clearer next step after profile creation.",
      status: "APPROVED",
      payoutCents: cents(firstCampaign.bountyPerTaskUsd),
      claimedAt: minutesFromNow(-90),
      expiresAt: minutesFromNow(-60),
      reviewedAt: minutesFromNow(-10),
    },
  });

  await prisma.walletTransaction.createMany({
    data: [
      {
        userId: tester.id,
        amountCents: 350,
        type: TransactionType.BOUNTY_PAYOUT,
        status: TransactionStatus.COMPLETED,
        stripePaymentId: "pi_seed_pulseroom",
        description: "PulseRoom Social Beta approved bounty",
      },
      {
        userId: developer.id,
        amountCents: 10500,
        type: TransactionType.ESCROW_DEPOSIT,
        status: TransactionStatus.COMPLETED,
        stripePaymentId: "pi_seed_escrow",
        description: "Escrow funded for PulseRoom Social Beta",
      },
    ],
  });

  console.log(`Seeded SeedEnv with tester ${tester.username}, developer ${developer.username}, admin ${admin.username}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
