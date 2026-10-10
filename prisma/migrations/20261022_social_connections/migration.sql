ALTER TABLE "User" ADD COLUMN "messageRequestsEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TYPE "DirectConversationStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'DECLINED');
CREATE TABLE "UserFollow" (
  "followerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "followingId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "emailUpdates" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("followerId", "followingId"),
  CHECK ("followerId" <> "followingId")
);
CREATE INDEX "UserFollow_followingId_createdAt_idx" ON "UserFollow"("followingId", "createdAt");
CREATE TABLE "UserBlock" (
  "blockerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "blockedId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("blockerId", "blockedId"),
  CHECK ("blockerId" <> "blockedId")
);
CREATE TABLE "DirectConversation" (
  "id" TEXT PRIMARY KEY,
  "participantAId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "participantBId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "requesterId" TEXT NOT NULL,
  "status" "DirectConversationStatus" NOT NULL DEFAULT 'REQUESTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("participantAId", "participantBId"),
  CHECK ("participantAId" < "participantBId"),
  CHECK ("requesterId" IN ("participantAId", "participantBId"))
);
CREATE INDEX "UserBlock_blockedId_blockerId_idx" ON "UserBlock"("blockedId", "blockerId");
CREATE INDEX "DirectConversation_participantAId_updatedAt_idx" ON "DirectConversation"("participantAId", "updatedAt");
CREATE INDEX "DirectConversation_participantBId_updatedAt_idx" ON "DirectConversation"("participantBId", "updatedAt");
CREATE INDEX "DirectConversation_requesterId_createdAt_idx" ON "DirectConversation"("requesterId", "createdAt");
CREATE TABLE "DirectMessage" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES "DirectConversation"("id") ON DELETE CASCADE,
  "senderId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "body" VARCHAR(2000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DirectMessage_conversationId_createdAt_id_idx" ON "DirectMessage"("conversationId", "createdAt", "id");
CREATE INDEX "DirectMessage_senderId_createdAt_idx" ON "DirectMessage"("senderId", "createdAt");
CREATE TABLE "FollowerEmail" (
  "id" TEXT PRIMARY KEY,
  "eventKey" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "authorId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "path" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("eventKey", "recipientId")
);
CREATE INDEX "FollowerEmail_sentAt_cancelledAt_nextAttemptAt_idx" ON "FollowerEmail"("sentAt", "cancelledAt", "nextAttemptAt");
