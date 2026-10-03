-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'STARTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "discoveryPasses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "questTheme" TEXT NOT NULL DEFAULT 'classic',
ADD COLUMN     "questXp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referralCode" TEXT;

-- AlterTable
ALTER TABLE "AppCampaign" ADD COLUMN     "discoveryAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "discoveryMinRep" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TaskInstruction" ADD COLUMN     "minimumRep" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "QuestReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "friendId" TEXT NOT NULL,
    "qualifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionApplication" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "testerId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "passReserved" BOOLEAN NOT NULL DEFAULT false,
    "startBy" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "reason" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestReward_userId_createdAt_idx" ON "QuestReward"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QuestReward_userId_key_key" ON "QuestReward"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_friendId_key" ON "Referral"("friendId");

-- CreateIndex
CREATE INDEX "Referral_inviterId_qualifiedAt_idx" ON "Referral"("inviterId", "qualifiedAt");

-- CreateIndex
CREATE INDEX "MissionApplication_campaignId_status_idx" ON "MissionApplication"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MissionApplication_campaignId_testerId_key" ON "MissionApplication"("campaignId", "testerId");

-- CreateIndex
CREATE INDEX "CommunityPost_hidden_createdAt_idx" ON "CommunityPost"("hidden", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityComment_postId_createdAt_idx" ON "CommunityComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunityReport_resolved_createdAt_idx" ON "CommunityReport"("resolved", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityReport_reporterId_postId_key" ON "CommunityReport"("reporterId", "postId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityReport_reporterId_commentId_key" ON "CommunityReport"("reporterId", "commentId");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "QuestReward" ADD CONSTRAINT "QuestReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_friendId_fkey" FOREIGN KEY ("friendId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionApplication" ADD CONSTRAINT "MissionApplication_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AppCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionApplication" ADD CONSTRAINT "MissionApplication_testerId_fkey" FOREIGN KEY ("testerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityReport" ADD CONSTRAINT "CommunityReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "CommunityComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
