import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { buildGitHubIssue } from "@/lib/github-issue-format";
import { createGitHubIssue, GitHubExportError, unsealGitHubToken } from "@/lib/github-issues";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== new URL(request.url).host) return NextResponse.json({ message: "Cross-site export requests are not allowed." }, { status: 403, headers });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: "Sign in to export submissions." }, { status: 401, headers });

  const { id } = await params;
  const [developer, submission] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { githubTokenEncrypted: true } }),
    prisma.submission.findUnique({
      where: { id },
      include: { tester: { select: { username: true } }, campaign: { select: { id: true, title: true, platform: true, developerId: true, syncGitHubRepo: true } } },
    }),
  ]);
  if (!developer || !submission || submission.campaign.developerId !== session.user.id) return NextResponse.json({ message: "Submission unavailable." }, { status: 404, headers });
  if (submission.githubIssueUrl) return NextResponse.json({ issueUrl: submission.githubIssueUrl, alreadyExported: true }, { headers });
  if (!submission.campaign.syncGitHubRepo) return NextResponse.json({ message: "Add a GitHub repo (owner/repo) to this cohort before exporting." }, { status: 409, headers });
  if (!developer.githubTokenEncrypted) return NextResponse.json({ message: "Add a GitHub token in Settings → Notifications before exporting." }, { status: 409, headers });

  let token: string;
  try {
    token = unsealGitHubToken(developer.githubTokenEncrypted);
  } catch {
    return NextResponse.json({ message: "The saved GitHub token can no longer be decrypted. Save it again in Settings." }, { status: 409, headers });
  }

  try {
    const appOrigin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://seedenv.com";
    const issueUrl = await createGitHubIssue(token, submission.campaign.syncGitHubRepo, buildGitHubIssue(submission, appOrigin.replace(/\/$/, "")));
    // Only the first export is recorded, so a double-click cannot overwrite the stored link.
    await prisma.submission.updateMany({ where: { id, githubIssueUrl: null }, data: { githubIssueUrl: issueUrl } });
    return NextResponse.json({ issueUrl }, { status: 201, headers });
  } catch (error) {
    if (error instanceof GitHubExportError) return NextResponse.json({ message: error.message }, { status: error.status, headers });
    console.error("SeedEnv GitHub export failed:", id, error);
    return NextResponse.json({ message: "GitHub export failed. Try again shortly." }, { status: 502, headers });
  }
}
