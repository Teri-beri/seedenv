import { sendNotificationEmail } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export async function notifyTesterOfMissionAcceptance(applicationId: string) {
  const application = await prisma.missionApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      startBy: true,
      updatedAt: true,
      tester: { select: { email: true, username: true } },
      campaign: { select: { id: true, title: true, platform: true } },
    },
  });
  if (!application || application.status !== "ACCEPTED" || !application.startBy) return false;

  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://seedenv.com";
  const missionUrl = new URL(`/dashboard?view=missions&claim=${encodeURIComponent(application.campaign.id)}`, origin).toString();
  return sendNotificationEmail(
    application.tester.email,
    `Accepted to test: ${application.campaign.title}`,
    [
      `Hi ${application.tester.username},`,
      "",
      `Your request to test ${application.campaign.title} was accepted.`,
      application.campaign.platform === "ROBLOX_EXPERIENCE"
        ? "Open SeedEnv to launch the private Roblox run and follow the in-game telemetry protocol."
        : "Open SeedEnv to claim your reserved testing slot.",
      "",
      `Start before: ${application.startBy.toISOString()}`,
      `Open mission: ${missionUrl}`,
      "",
      "Your acceptance reservation is held for up to 24 hours.",
    ].join("\n"),
    `mission-accepted-${application.id}-${application.updatedAt.getTime()}`,
  );
}
