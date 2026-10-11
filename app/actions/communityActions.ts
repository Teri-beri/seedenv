"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { CommunityCommentTag, CommunityPostTag } from "@prisma/client";
import { requireMember } from "@/lib/member";
import { serializable } from "@/lib/quest-ledger";
import { queueFollowerEmails } from "@/lib/social-connections";

type PostDetails = { tag?: CommunityPostTag; campaignId?: string | null; buildLabel?: string | null };
type CommentDetails = { tag?: CommunityCommentTag; deviceLabel?: string | null };

const postTagSchema = z.enum(["CHANGELOG", "NEED_VALIDATION", "BUG_FIX"]);
const commentTagSchema = z.enum(["GENERAL_FEEDBACK", "REPRO_LOG", "DEVICE_CONFIRMED"]);
const buildLabelSchema = z.string().trim().min(1).max(40).nullish();
const deviceLabelSchema = z.string().trim().min(1).max(60).nullish();

export async function publishPost(body: string, publicVisible = false, details: PostDetails = {}) {
  const member = await requireMember("DEVELOPER");
  const text = z.string().trim().min(12).max(1600).parse(body);
  const visibility = z.boolean().parse(publicVisible);
  const tag = postTagSchema.catch("CHANGELOG").parse(details.tag ?? "CHANGELOG");
  const campaignId = details.campaignId ? z.string().trim().min(1).max(64).parse(details.campaignId) : null;
  const buildLabel = buildLabelSchema.parse(details.buildLabel) ?? null;
  await serializable(async (tx) => {
    const count = await tx.communityPost.count({ where: { authorId: member.id, createdAt: { gte: new Date(Date.now() - 86400000) } } });
    if (count >= 5) throw new Error("You can publish up to five app updates per rolling 24 hours.");
    if (campaignId) {
      const owned = await tx.appCampaign.findFirst({ where: { id: campaignId, developerId: member.id }, select: { id: true } });
      if (!owned) throw new Error("Attach an update only to a cohort you own.");
    }
    const post = await tx.communityPost.create({ data: { authorId: member.id, body: text, publicVisible: visibility, tag, campaignId, buildLabel: campaignId ? buildLabel : null } });
    await queueFollowerEmails(tx, member.id, `post:${post.id}`, `/launch-circle/${post.id}`, `@${member.username} posted a Launch Circle update`);
  });
  revalidatePath("/launch-circle");
  revalidatePath("/");
  return "App update published.";
}

export async function publishComment(postId: string, body: string, details: CommentDetails = {}) {
  const member = await requireMember();
  const text = z.string().trim().min(2).max(800).parse(body);
  const tag = commentTagSchema.catch("GENERAL_FEEDBACK").parse(details.tag ?? "GENERAL_FEEDBACK");
  const deviceLabel = deviceLabelSchema.parse(details.deviceLabel) ?? null;
  await serializable(async (tx) => {
    const post = await tx.communityPost.findUnique({ where: { id: postId } });
    if (!post || post.hidden) throw new Error("This discussion is unavailable.");
    const count = await tx.communityComment.count({ where: { authorId: member.id, createdAt: { gte: new Date(Date.now() - 3600000) } } });
    if (count >= 20) throw new Error("Comment limit reached. Please try again later.");
    await tx.communityComment.create({ data: { postId, authorId: member.id, body: text, tag, deviceLabel } });
  });
  revalidatePath("/launch-circle");
  revalidatePath("/launch-circle/[id]", "page");
  revalidatePath("/");
  return "Comment added.";
}

export async function toggleHelpful(postId: string) {
  const member = await requireMember();
  const id = z.string().trim().min(1).max(64).parse(postId);
  const marked = await serializable(async (tx) => {
    const post = await tx.communityPost.findUnique({ where: { id }, select: { id: true, hidden: true } });
    if (!post || post.hidden) throw new Error("This discussion is unavailable.");
    const existing = await tx.communityPostHelpful.findUnique({ where: { postId_userId: { postId: id, userId: member.id } } });
    if (existing) {
      await tx.communityPostHelpful.delete({ where: { postId_userId: { postId: id, userId: member.id } } });
      return false;
    }
    await tx.communityPostHelpful.create({ data: { postId: id, userId: member.id } });
    return true;
  });
  revalidatePath("/launch-circle");
  revalidatePath("/launch-circle/[id]", "page");
  return marked ? "Marked as helpful." : "Helpful mark removed.";
}

export async function reportCommunityContent(id: string, type: "post" | "comment", reason: string) {
  const member = await requireMember();
  const text = z.string().trim().min(8).max(500).parse(reason);
  if (!["post", "comment"].includes(type)) throw new Error("Choose a valid report target.");
  await serializable(async (tx) => {
    const target = type === "post" ? await tx.communityPost.findUnique({ where: { id } }) : await tx.communityComment.findUnique({ where: { id } });
    if (!target || target.hidden) throw new Error("This content is unavailable.");
    const count = await tx.communityReport.count({ where: { reporterId: member.id, createdAt: { gte: new Date(Date.now() - 86400000) } } });
    if (count >= 20) throw new Error("Report limit reached for today.");
    await tx.communityReport.createMany({ data: [{ reporterId: member.id, ...(type === "post" ? { postId: id } : { commentId: id }), reason: text }], skipDuplicates: true });
  });
  revalidatePath("/launch-circle");
  return "Report sent to platform moderators.";
}

export async function hideCommunityContent(id: string, type: "post" | "comment") {
  const member = await requireMember();
  if (!["post", "comment"].includes(type)) throw new Error("Choose a valid content type.");
  await serializable(async (tx) => {
    const target = type === "post" ? await tx.communityPost.findUnique({ where: { id } }) : await tx.communityComment.findUnique({ where: { id } });
    if (!target || (target.authorId !== member.id && member.role !== "ADMIN")) throw new Error("Only the author or a moderator can remove this content.");
    if (type === "post") await tx.communityPost.update({ where: { id }, data: { hidden: true } });
    else await tx.communityComment.update({ where: { id }, data: { hidden: true } });
    await tx.communityReport.updateMany({ where: type === "post" ? { postId: id } : { commentId: id }, data: { resolved: true } });
  });
  revalidatePath("/launch-circle");
  revalidatePath("/launch-circle/[id]", "page");
  revalidatePath("/");
  return "Content removed.";
}

export async function dismissCommunityReport(id: string) {
  const member = await requireMember();
  if (member.role !== "ADMIN") throw new Error("Moderator access required.");
  await serializable((tx) => tx.communityReport.update({ where: { id }, data: { resolved: true } }));
  revalidatePath("/launch-circle");
  return "Report reviewed and dismissed.";
}
