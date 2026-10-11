import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { recordCompliancePing } from "@/lib/compliance-pings";

const pingSchema = z.object({
  deviceModel: z.string().trim().min(1).max(120),
  osVersion: z.string().trim().min(1).max(120),
  sessionDuration: z.number().int().min(1).max(86_400),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return Response.json({ message: "Sign in to record a session." }, { status: 401 });
  const input = pingSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ message: input.error.issues[0]?.message || "Invalid ping." }, { status: 400 });
  const { id } = await params;
  // Only a tester actually enrolled in this active cohort can contribute to its audit trail, and
  // the day number is derived from the launch date rather than trusted from the client.
  const campaign = await prisma.appCampaign.findFirst({
    where: { id, cohortType: "GOOGLE_PLAY_14_DAY", status: "ACTIVE", applications: { some: { testerId: session.user.id, status: { in: ["ACCEPTED", "STARTED"] } } } },
    select: { id: true },
  });
  if (!campaign) return Response.json({ message: "You are not enrolled in this Google Play cohort." }, { status: 404 });

  const recorded = await recordCompliancePing({
    campaignId: campaign.id,
    testerId: session.user.id,
    testerHandle: session.user.name || session.user.email?.split("@")[0] || "SeedEnv validator",
    deviceModel: input.data.deviceModel,
    osVersion: input.data.osVersion,
    sessionDuration: input.data.sessionDuration,
  });
  if (!recorded) return Response.json({ message: "This cohort is outside its tracked testing window." }, { status: 409 });
  return Response.json(recorded, { headers: { "Cache-Control": "private, no-store" } });
}
