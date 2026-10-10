"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/member";
import { serializable } from "@/lib/quest-ledger";
import { queueFollowerEmails } from "@/lib/social-connections";

export async function publishPost(body: string, publicVisible = false) {
  const member = await requireMember("DEVELOPER");
  const text = z.string().trim().min(12).max(1600).parse(body);
  const visibility = z.boolean().parse(publicVisible);
  await serializable(async (tx) => {
    const count = await tx.communityPost.count({ where: { authorId: member.id, createdAt: { gte: new Date(Date.now() - 86400000) } } });
    if (count >= 5) throw new Error("You can publish up to five app updates per rolling 24 hours.");
    const post = await tx.communityPost.create({ data: { authorId: member.id, body: text, publicVisible: visibility } });
    await queueFollowerEmails(tx, member.id, `post:${post.id}`, `/community/${post.id}`, `@${member.username} posted a Launch Circle update`);
  });
  revalidatePath("/community");
  revalidatePath("/");
  return "App update published.";
}

export async function publishComment(postId: string, body: string) {
  const member = await requireMember();
  const text = z.string().trim().min(2).max(800).parse(body);
  await serializable(async (tx) => {
    const post = await tx.communityPost.findUnique({ where: { id: postId } });
    if (!post || post.hidden) throw new Error("This discussion is unavailable.");
    const count = await tx.communityComment.count({ where: { authorId: member.id, createdAt: { gte: new Date(Date.now() - 3600000) } } });
    if (count >= 20) throw new Error("Comment limit reached. Please try again later.");
    await tx.communityComment.create({ data: { postId, authorId: member.id, body: text } });
  });
  revalidatePath("/community");
  revalidatePath("/community/[id]", "page");
  revalidatePath("/");
  return "Comment added.";
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
  revalidatePath("/community");
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
  revalidatePath("/community");
  revalidatePath("/community/[id]", "page");
  revalidatePath("/");
  return "Content removed.";
}

export async function dismissCommunityReport(id: string) {
  const member = await requireMember();
  if (member.role !== "ADMIN") throw new Error("Moderator access required.");
  await serializable((tx) => tx.communityReport.update({ where: { id }, data: { resolved: true } }));
  revalidatePath("/community");
  return "Report reviewed and dismissed.";
}
