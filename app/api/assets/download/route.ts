import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { SubmissionStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const campaignId = request.nextUrl.searchParams.get("campaignId");
  if (!campaignId) return NextResponse.json({ message: "campaignId is required" }, { status: 400 });

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: "Authentication required" }, { status: 401 });

  const campaign = await prisma.appCampaign.findUnique({ where: { id: campaignId }, select: { developerId: true } });
  if (!campaign || (campaign.developerId !== session.user.id && session.user.role !== "ADMIN")) {
    return NextResponse.json({ message: "Campaign access denied" }, { status: 403 });
  }

  const submissions = await prisma.submission.findMany({
    where: { campaignId, status: SubmissionStatus.APPROVED, proofImageUrl: { not: null } },
    include: { tester: true },
    orderBy: { reviewedAt: "desc" },
  });

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(submissions.map((submission) => ({
    tester: submission.tester.username,
    proofImageUrl: submission.proofImageUrl,
    feedbackText: submission.feedbackText,
    reviewedAt: submission.reviewedAt,
  })), null, 2));

  for (const [index, submission] of submissions.entries()) {
    if (!submission.proofImageUrl || submission.proofImageUrl.startsWith("data:")) continue;
    try {
      const response = await fetch(submission.proofImageUrl);
      if (!response.ok) continue;
      const arrayBuffer = await response.arrayBuffer();
      const extension = response.headers.get("content-type")?.includes("png") ? "png" : "jpg";
      zip.file(`${String(index + 1).padStart(2, "0")}-${submission.tester.username}.${extension}`, arrayBuffer);
    } catch {
      // The manifest still preserves the asset URL if a remote fetch fails.
    }
  }

  const archive = await zip.generateAsync({ type: "arraybuffer" });
  return new NextResponse(archive, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="seedenv-assets-${campaignId}.zip"`,
    },
  });
}
