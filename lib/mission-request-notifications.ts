import { notificationEnabled, sendNotificationEmail } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export async function notifyDeveloperOfMissionRequest(applicationId: string) {
  const application = await prisma.missionApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      note: true,
      updatedAt: true,
      tester: { select: { username: true, xpPoints: true } },
      campaign: {
        select: {
          title: true,
          developer: { select: { email: true, notificationPreferences: true } },
        },
      },
    },
  });
  if (!application || application.status !== "PENDING") return false;
  if (!notificationEnabled(application.campaign.developer.notificationPreferences, "email_tester_requests", true)) return false;

  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://seedenv.com";
  const reviewUrl = new URL("/applications#tester-requests", origin).toString();
  return sendNotificationEmail(
    application.campaign.developer.email,
    `New tester request: ${application.campaign.title}`,
    [
      `${application.tester.username} requested to test ${application.campaign.title}.`,
      `Tester reputation: ${application.tester.xpPoints} REP`,
      "",
      "Application note:",
      application.note,
      "",
      `Review this request: ${reviewUrl}`,
      "",
      "You can manage tester-request emails in SeedEnv Account → Notifications.",
    ].join("\n"),
    `mission-request-${application.id}-${application.updatedAt.getTime()}`,
  );
}
