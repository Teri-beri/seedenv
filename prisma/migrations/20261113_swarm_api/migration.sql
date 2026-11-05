-- CreateTable
CREATE TABLE IF NOT EXISTS "swarm_api_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" VARCHAR(20) NOT NULL DEFAULT 'SANDBOX',
    "subscriptionStatus" VARCHAR(40),
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "fingerprintSalt" TEXT NOT NULL,
    "webhookUrl" VARCHAR(500),
    "webhookSecret" TEXT,
    "webhookLastStatus" INTEGER,
    "webhookLastAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "swarm_api_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "swarm_api_keys" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "prefix" VARCHAR(20) NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swarm_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "swarm_api_usage" (
    "accountId" TEXT NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "checks" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "holdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "swarm_api_usage_pkey" PRIMARY KEY ("accountId","period")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "swarm_api_fingerprints" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "commentId" VARCHAR(128),
    "threadHash" VARCHAR(32),
    "authorHash" VARCHAR(32) NOT NULL,
    "textHash" VARCHAR(32) NOT NULL,
    "tokenHashes" TEXT[],
    "linkCount" INTEGER NOT NULL DEFAULT 0,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "score" INTEGER NOT NULL,
    "action" VARCHAR(10) NOT NULL,
    "signals" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swarm_api_fingerprints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "swarm_api_accounts_userId_key" ON "swarm_api_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "swarm_api_accounts_stripeSubscriptionId_key" ON "swarm_api_accounts"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "swarm_api_keys_keyHash_key" ON "swarm_api_keys"("keyHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swarm_api_keys_accountId_createdAt_idx" ON "swarm_api_keys"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swarm_api_fingerprints_accountId_postedAt_idx" ON "swarm_api_fingerprints"("accountId", "postedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swarm_api_fingerprints_accountId_action_createdAt_idx" ON "swarm_api_fingerprints"("accountId", "action", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "swarm_api_fingerprints_createdAt_idx" ON "swarm_api_fingerprints"("createdAt");

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "swarm_api_accounts" ADD CONSTRAINT "swarm_api_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "swarm_api_keys" ADD CONSTRAINT "swarm_api_keys_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "swarm_api_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "swarm_api_usage" ADD CONSTRAINT "swarm_api_usage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "swarm_api_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "swarm_api_fingerprints" ADD CONSTRAINT "swarm_api_fingerprints_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "swarm_api_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

