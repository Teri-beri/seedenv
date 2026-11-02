import "server-only";
import { requireMember } from "@/lib/member";
import { prisma } from "@/lib/prisma";
import { notificationEnabled, sendNotificationEmail } from "@/lib/notifications";
export { requireClipRoom } from "@/lib/clipper-lifecycle";

export function clippersEnabled() {
  return process.env.CLIPPERS_ENABLED === "true";
}

export function requireClippers() {
  if (!clippersEnabled()) throw new Error("Clippers is not enabled. An administrator must apply its migration and configure private storage and payment webhooks first.");
}

export async function clipMember(role?: "TESTER" | "DEVELOPER") {
  requireClippers();
  return requireMember(role);
}

export async function notifyClipMember(userId: string, subject: string, text: string, key: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, notificationPreferences: true } });
  if (!notificationEnabled(user.notificationPreferences, "email_tester_requests", true)) return "";
  const sent = await sendNotificationEmail(user.email, subject, text, key);
  if (!sent) {
    console.warn("Clippers notification unavailable", { userId, key });
    return " Email notification could not be delivered; the in-app status is saved.";
  }
  return "";
}

export async function notifyClipAdmins(subject: string, text: string, key: string) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true }, take: 50 });
  if (!admins.length) {
    console.error("Clippers administrator review coverage is missing", { key });
    return " Your request is saved, but no review administrator is configured. Please contact SeedEnv support.";
  }
  const results = await Promise.all(admins.map((admin) => notifyClipMember(admin.id, subject, `${text}\n\nReview queue: https://seedenv.com/clippers`, `${key}-${admin.id}`)));
  return results.find(Boolean) || "";
}

export async function notifyClipAgreement(id: string, senderId: string, text: string, eventKey?: string) {
  const item = await prisma.clipEngagement.findUniqueOrThrow({ where: { id }, include: { campaign: { select: { developerId: true, title: true } } } });
  const recipients = senderId === item.creatorId ? [item.campaign.developerId] : senderId === item.campaign.developerId ? [item.creatorId] : [item.creatorId, item.campaign.developerId];
  const results = await Promise.all(recipients.map((recipient) => notifyClipMember(recipient, `SeedEnv Clippers: ${item.campaign.title}`, `${text}\n\nOpen the agreement: https://seedenv.com/clippers/${item.campaignId}?agreement=${item.id}`, `clip-${eventKey || `${id}-${item.status}-${item.updatedAt.toISOString()}`}-${recipient}`)));
  return results.find(Boolean) || "";
}
