"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/member";
import { prisma } from "@/lib/prisma";
import { serializable } from "@/lib/quest-ledger";
import { messageBody, reviewMessageRequest, sendDirectMessage, setFollowing, setMemberBlock, socialId, SocialError } from "@/lib/social-connections";

export type SocialResult = { ok: true; message: string; conversationId?: string } | { ok: false; message: string };

async function action(work: (id: string) => Promise<Omit<Extract<SocialResult, { ok: true }>, "ok">>): Promise<SocialResult> {
  try {
    const member = await requireMember();
    const result = await work(member.id);
    revalidatePath("/account");
    revalidatePath("/messages");
    revalidatePath("/u/[username]", "page");
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof SocialError) return { ok: false, message: error.message };
    console.error("SeedEnv social action failed:", error);
    return { ok: false, message: "This action could not be completed. Check that you are signed in and try again." };
  }
}

export async function sendMessage(recipientId: string, body: string): Promise<SocialResult> {
  const parsed = z.object({ recipientId: socialId, body: messageBody }).safeParse({ recipientId, body });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  return action(async (id) => ({ conversationId: await serializable((tx) => sendDirectMessage(tx, id, parsed.data.recipientId, parsed.data.body)), message: "Message sent." }));
}

export async function reviewRequest(conversationId: string, decision: "ACCEPTED" | "DECLINED"): Promise<SocialResult> {
  const parsed = z.object({ conversationId: socialId, decision: z.enum(["ACCEPTED", "DECLINED"]) }).safeParse({ conversationId, decision });
  if (!parsed.success) return { ok: false, message: "Choose a valid request and decision." };
  return action(async (id) => {
    await serializable((tx) => reviewMessageRequest(tx, id, parsed.data.conversationId, parsed.data.decision));
    return { message: decision === "ACCEPTED" ? "Request accepted. You can now reply." : "Request declined." };
  });
}

export async function followMember(targetId: string, following: boolean, emailUpdates: boolean): Promise<SocialResult> {
  const parsed = z.object({ targetId: socialId, following: z.boolean(), emailUpdates: z.boolean() }).safeParse({ targetId, following, emailUpdates });
  if (!parsed.success) return { ok: false, message: "Choose a valid profile and follow preference." };
  return action(async (id) => {
    await serializable((tx) => setFollowing(tx, id, targetId, following, emailUpdates));
    return { message: following ? "Follow preferences saved." : "Unfollowed." };
  });
}

export async function blockMember(targetId: string, block: boolean): Promise<SocialResult> {
  if (!socialId.safeParse(targetId).success || typeof block !== "boolean") return { ok: false, message: "Choose a valid member." };
  return action(async (id) => {
    await serializable((tx) => setMemberBlock(tx, id, targetId, block));
    return { message: block ? "Member blocked. Messages and follows are disabled." : "Member unblocked. Previous requests remain declined." };
  });
}

export async function saveMessageSettings(enabled: boolean): Promise<SocialResult> {
  if (typeof enabled !== "boolean") return { ok: false, message: "Choose a valid message preference." };
  return action(async (id) => {
    await prisma.user.update({ where: { id }, data: { messageRequestsEnabled: enabled } });
    return { message: "Message settings saved. Existing accepted conversations are unchanged." };
  });
}

export async function reportMessage(conversationId: string, reason: string): Promise<SocialResult> {
  const parsed = z.object({ conversationId: socialId, reason: z.string().trim().min(8).max(500) }).safeParse({ conversationId, reason });
  if (!parsed.success) return { ok: false, message: "Describe the issue in 8 to 500 characters." };
  return action(async (id) => {
    await serializable(async (tx) => {
      const thread = await tx.directConversation.findFirst({ where: { id: conversationId, OR: [{ participantAId: id }, { participantBId: id }] } });
      if (!thread) throw new SocialError("This conversation is unavailable.");
      const count = await tx.supportTicket.count({ where: { userId: id, createdAt: { gte: new Date(Date.now() - 86400000) }, subject: "Private message report" } });
      if (count >= 5) throw new SocialError("You have reached today's message report limit.");
      const member = await tx.user.findUniqueOrThrow({ where: { id }, select: { role: true } });
      const messages = await tx.directMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: 20 });
      const excerpt = messages.reverse().map(m => `${m.createdAt.toISOString()} ${m.senderId}: ${m.body}`).join("\n").slice(-3500);
      await tx.supportTicket.create({ data: { userId: id, role: member.role, category: "General Support", subject: "Private message report", route: `/messages?thread=${conversationId}`, userAgent: "In-app message report", message: `Conversation: ${conversationId}\nReason: ${parsed.data.reason}\nRecent evidence excerpt (up to 3,500 characters):\n${excerpt}` } });
    });
    return { message: "Report sent to SeedEnv support. You can also block this member." };
  });
}
