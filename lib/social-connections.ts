import { Prisma } from "@prisma/client";
import { z } from "zod";

export class SocialError extends Error {}
export const socialId = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const messageBody = z.string().trim().min(1, "Write a message first.").max(2000, "Messages can contain up to 2,000 characters.");
export const socialMemberSelect = { id: true, username: true, avatarUrl: true, role: true, developerWorkspaceEnabled: true, testerWorkspaceEnabled: true } as const;

export function conversationPair(first: string, second: string) {
  if (first === second) throw new SocialError("You cannot message or follow yourself.");
  const [participantAId, participantBId] = [first, second].sort();
  return { participantAId, participantBId };
}

export function isDeveloper(user: { role: string; developerWorkspaceEnabled: boolean }) {
  return user.role === "DEVELOPER" || user.role === "ADMIN" || user.developerWorkspaceEnabled;
}

export async function blockedBetween(tx: Prisma.TransactionClient, first: string, second: string) {
  return Boolean(await tx.userBlock.findFirst({ where: { OR: [{ blockerId: first, blockedId: second }, { blockerId: second, blockedId: first }] }, select: { blockerId: true } }));
}

export async function sendDirectMessage(tx: Prisma.TransactionClient, senderId: string, recipientId: string, body: string) {
  const pair = conversationPair(senderId, recipientId);
  const recipient = await tx.user.findUnique({ where: { id: recipientId }, select: { messageRequestsEnabled: true, email: true } });
  if (!recipient || recipient.email.endsWith("@seedenv.dev")) throw new SocialError("This member is unavailable.");
  if (await blockedBetween(tx, senderId, recipientId)) throw new SocialError("Messaging is unavailable between these accounts.");
  const recent = await tx.directMessage.count({ where: { senderId, createdAt: { gte: new Date(Date.now() - 3600000) } } });
  if (recent >= 60) throw new SocialError("You have reached the hourly message limit. Please try again later.");
  let conversation = await tx.directConversation.findUnique({ where: { participantAId_participantBId: pair } });
  if (conversation && conversation.status !== "ACCEPTED") {
    throw new SocialError(conversation.status === "DECLINED" ? "This request was declined. You cannot send more messages." : "Wait until the recipient accepts your request before sending another message.");
  }
  if (!conversation) {
    if (!recipient.messageRequestsEnabled) throw new SocialError("This member is not accepting new message requests.");
    const requests = await tx.directConversation.count({ where: { requesterId: senderId, createdAt: { gte: new Date(Date.now() - 86400000) } } });
    if (requests >= 10) throw new SocialError("You can send up to ten new message requests per day.");
    conversation = await tx.directConversation.create({ data: { ...pair, requesterId: senderId } });
  }
  await tx.directMessage.create({ data: { conversationId: conversation.id, senderId, body: messageBody.parse(body) } });
  await tx.directConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  return conversation.id;
}

export async function reviewMessageRequest(tx: Prisma.TransactionClient, memberId: string, id: string, decision: "ACCEPTED" | "DECLINED") {
  const thread = await tx.directConversation.findUnique({ where: { id } });
  if (!thread || ![thread.participantAId, thread.participantBId].includes(memberId) || thread.requesterId === memberId || thread.status !== "REQUESTED") throw new SocialError("Only the recipient can review a pending request.");
  const otherId = thread.participantAId === memberId ? thread.participantBId : thread.participantAId;
  if (await blockedBetween(tx, memberId, otherId)) throw new SocialError("Unblock this member before reviewing their request.");
  await tx.directConversation.update({ where: { id }, data: { status: decision } });
}

export async function setFollowing(tx: Prisma.TransactionClient, memberId: string, targetId: string, following: boolean, emailUpdates: boolean) {
  conversationPair(memberId, targetId);
  const target = await tx.user.findUnique({ where: { id: targetId }, select: { email: true, role: true, developerWorkspaceEnabled: true } });
  if (!target || target.email.endsWith("@seedenv.dev")) throw new SocialError("This profile is unavailable.");
  if (await blockedBetween(tx, memberId, targetId)) throw new SocialError("Following is unavailable between these accounts.");
  if (following) {
    const updates = emailUpdates && isDeveloper(target);
    await tx.userFollow.upsert({ where: { followerId_followingId: { followerId: memberId, followingId: targetId } }, create: { followerId: memberId, followingId: targetId, emailUpdates: updates }, update: { emailUpdates: updates } });
    if (updates) return;
  } else await tx.userFollow.deleteMany({ where: { followerId: memberId, followingId: targetId } });
  await tx.followerEmail.updateMany({ where: { recipientId: memberId, authorId: targetId, sentAt: null, cancelledAt: null }, data: { cancelledAt: new Date() } });
}

export async function setMemberBlock(tx: Prisma.TransactionClient, memberId: string, targetId: string, block: boolean) {
  const pair = conversationPair(memberId, targetId);
  if (block) {
    if (!await tx.user.findUnique({ where: { id: targetId }, select: { id: true } })) throw new SocialError("This member is unavailable.");
    await tx.userBlock.upsert({ where: { blockerId_blockedId: { blockerId: memberId, blockedId: targetId } }, create: { blockerId: memberId, blockedId: targetId }, update: {} });
    await tx.userFollow.deleteMany({ where: { OR: [{ followerId: memberId, followingId: targetId }, { followerId: targetId, followingId: memberId }] } });
    await tx.directConversation.updateMany({ where: pair, data: { status: "DECLINED" } });
    await tx.followerEmail.updateMany({ where: { sentAt: null, cancelledAt: null, OR: [{ authorId: memberId, recipientId: targetId }, { authorId: targetId, recipientId: memberId }] }, data: { cancelledAt: new Date() } });
  } else await tx.userBlock.deleteMany({ where: { blockerId: memberId, blockedId: targetId } });
}

export async function queueFollowerEmails(tx: Prisma.TransactionClient, authorId: string, eventKey: string, path: string, subject: string) {
  const author = await tx.user.findUnique({ where: { id: authorId }, select: { role: true, developerWorkspaceEnabled: true } });
  if (!author || !isDeveloper(author)) return;
  // Fan-out stays in the publishing transaction; no provider calls can delay or roll back funding.
  await tx.$executeRaw`
    INSERT INTO "FollowerEmail" ("id", "eventKey", "recipientId", "authorId", "path", "subject")
    SELECT ${eventKey} || ':' || f."followerId", ${eventKey}, f."followerId", ${authorId}, ${path}, ${subject}
    FROM "UserFollow" f JOIN "User" u ON u."id" = f."followerId"
    WHERE f."followingId" = ${authorId} AND f."emailUpdates" = true AND u."emailVerified" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "UserBlock" b WHERE
        (b."blockerId" = f."followerId" AND b."blockedId" = ${authorId}) OR
        (b."blockerId" = ${authorId} AND b."blockedId" = f."followerId"))
    ON CONFLICT ("eventKey", "recipientId") DO NOTHING`;
}
