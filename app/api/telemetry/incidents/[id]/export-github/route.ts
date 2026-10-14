import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-options";
import { createGitHubIssue, GitHubExportError, unsealGitHubToken } from "@/lib/github-issues";
import { prisma } from "@/lib/prisma";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  const requestHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  if (!origin || new URL(origin).host !== requestHost) return NextResponse.json({ message: "Cross-site exports are not allowed." }, { status: 403, headers });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: "Sign in to export incidents." }, { status: 401, headers });

  const { id } = await params;
  const [developer, incident] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { githubTokenEncrypted: true, githubDefaultRepo: true } }),
    prisma.telemetryIncident.findUnique({
      where: { id },
      select: {
        id: true,
        severity: true,
        statusCode: true,
        endpoint: true,
        deviceModel: true,
        osVersion: true,
        message: true,
        createdAt: true,
        githubIssueUrl: true,
        validator: { select: { username: true } },
        cohort: { select: { id: true, title: true, developerId: true, syncGitHubRepo: true } },
      },
    }),
  ]);
  if (!developer || !incident || incident.cohort.developerId !== session.user.id) return NextResponse.json({ message: "Incident unavailable." }, { status: 404, headers });
  if (incident.githubIssueUrl) return NextResponse.json({ issueUrl: incident.githubIssueUrl, alreadyExported: true }, { headers });
  const repo = incident.cohort.syncGitHubRepo || developer.githubDefaultRepo;
  if (!repo) return NextResponse.json({ message: "Set a cohort or default GitHub repository before exporting." }, { status: 409, headers });
  if (!developer.githubTokenEncrypted) return NextResponse.json({ message: "Add a GitHub token in Account → Notifications before exporting." }, { status: 409, headers });

  let token: string;
  try {
    token = unsealGitHubToken(developer.githubTokenEncrypted);
  } catch {
    return NextResponse.json({ message: "The saved GitHub token cannot be decrypted. Save it again in Account." }, { status: 409, headers });
  }
  const appOrigin = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://seedenv.com").replace(/\/$/, "");
  const monitorUrl = `${appOrigin}/console/monitor?cohort=${encodeURIComponent(incident.cohort.id)}&incident=${encodeURIComponent(incident.id)}`;
  const body = [
    `### SeedEnv ${incident.severity} Telemetry Incident`,
    `- **Cohort:** ${incident.cohort.title}`,
    `- **Code:** ${incident.statusCode}`,
    `- **Surface:** ${incident.endpoint || "Not specified"}`,
    `- **Hardware:** ${incident.deviceModel} · ${incident.osVersion}`,
    `- **Validator:** ${incident.validator ? `@${incident.validator.username}` : "Unavailable"}`,
    `- **Timestamp:** ${incident.createdAt.toISOString()}`,
    "",
    "#### Incident Details",
    incident.message,
    "",
    `#### SeedEnv Monitor`,
    `[Inspect incident](${monitorUrl})`,
  ].join("\n");

  try {
    const issueUrl = await createGitHubIssue(token, repo, {
      title: `[SeedEnv ${incident.severity}] ${incident.statusCode} on ${incident.deviceModel}`,
      body,
    });
    await prisma.telemetryIncident.updateMany({ where: { id: incident.id, githubIssueUrl: null }, data: { githubIssueUrl: issueUrl } });
    return NextResponse.json({ issueUrl }, { status: 201, headers });
  } catch (error) {
    if (error instanceof GitHubExportError) return NextResponse.json({ message: error.message }, { status: error.status, headers });
    console.error("SeedEnv telemetry GitHub export failed:", incident.id, error);
    return NextResponse.json({ message: "GitHub export failed. Try again shortly." }, { status: 502, headers });
  }
}
