ALTER TABLE "User" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
UPDATE "User" SET "onboardingCompletedAt" = CURRENT_TIMESTAMP WHERE "onboardingCompletedAt" IS NULL;