import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { blockedBetween, isDeveloper } from "@/lib/social-connections";

export type FollowerEmailSender = (message: { to: string; subject: string; text: string }, idempotencyKey: string) => Promise<void>;

function configuredSender(): FollowerEmailSender {
  const apiKey = process.env.RESEND_API_KEY?.trim().replace(/^['"]|['"]$/g, "");
  if (!apiKey) throw new Error("Follower email delivery requires RESEND_API_KEY.");
  const provider = new Resend(apiKey);
  return async (message, idempotencyKey) => {
    const result = await provider.emails.send({ from: process.env.AUTH_EMAIL_FROM?.trim() || "SeedEnv <auth@seedenv.com>", ...message }, { idempotencyKey });
    if (result.error) throw new Error(result.error.message);
  };
}

export async function deliverFollowerEmails(limit = 30, sender?: FollowerEmailSender) {
  const send = sender || configuredSender();
  const pending = await prisma.followerEmail.findMany({
    where: { sentAt: null, cancelledAt: null, attempts: { lt: 8 }, nextAttemptAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" }, take: limit,
    include: { recipient: { select: { email: true, emailVerified: true } }, author: { select: { username: true, role: true, developerWorkspaceEnabled: true } } },
  });
  let sent = 0, failed = 0, cancelled = 0;
  for (const email of pending) {
    const claimed = await prisma.followerEmail.updateMany({
      where: { id: email.id, attempts: email.attempts, sentAt: null, cancelledAt: null, nextAttemptAt: { lte: new Date() } },
      data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 5 * 60000) },
    });
    if (!claimed.count) continue;
    try {
      const follow = await prisma.userFollow.findUnique({ where: { followerId_followingId: { followerId: email.recipientId, followingId: email.authorId } } });
      const contentId = email.eventKey.slice(email.eventKey.indexOf(":") + 1);
      const available = email.eventKey.startsWith("cohort:")
        ? await prisma.appCampaign.findFirst({ where: { id: contentId, status: "ACTIVE", cancelledAt: null, expiresAt: { gt: new Date() } }, select: { id: true } })
        : await prisma.communityPost.findFirst({ where: { id: contentId, hidden: false }, select: { id: true } });
      if (!follow?.emailUpdates || !email.recipient.emailVerified || !isDeveloper(email.author) || !available || await blockedBetween(prisma, email.authorId, email.recipientId)) {
        await prisma.followerEmail.update({ where: { id: email.id }, data: { cancelledAt: new Date() } });
        cancelled++;
        continue;
      }
      const base = process.env.NEXT_PUBLIC_APP_URL || "https://seedenv.com";
      const text = `@${email.author.username} has a new update on SeedEnv.\n\nView it: ${new URL(email.path, base)}\n\nYou opted in to updates when following this developer. Turn off emails or unfollow in Connections: ${new URL("/account?tab=connections", base)}\n\nSeedEnv / TERIMUS LLC`;
      await send({ to: email.recipient.email, subject: email.subject, text }, `follower-email-${email.id}`);
      await prisma.followerEmail.update({ where: { id: email.id }, data: { sentAt: new Date(), lastError: null } });
      sent++;
    } catch (error) {
      console.error("SeedEnv follower email delivery failed:", email.id, error);
      await prisma.followerEmail.update({ where: { id: email.id }, data: { lastError: (error instanceof Error ? error.message : "Delivery failed").slice(0, 500), nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** email.attempts) * 60000) } });
      failed++;
    }
  }
  return { sent, failed, cancelled };
}
