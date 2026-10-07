import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { SubmissionStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { getProofImageUrl } from "@/lib/storage";

export async function GET(request: NextRequest) {
  const campaignId = request.nextUrl.searchParams.get("campaignId");
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: "Authentication required" }, { status: 401 });

  if (campaignId) {
    const campaign = await prisma.appCampaign.findUnique({ where: { id: campaignId }, select: { developerId: true } });
    if (!campaign || (campaign.developerId !== session.user.id && session.user.role !== "ADMIN")) {
      return NextResponse.json({ message: "Campaign access denied" }, { status: 403 });
    }
  } else if (session.user.role !== "DEVELOPER") {
    return NextResponse.json({ message: "Developer account required" }, { status: 403 });
  }

  const submissions = await prisma.submission.findMany({
    where: {
      status: SubmissionStatus.APPROVED,
      proofImageUrl: { not: null },
      ...(campaignId ? { campaignId } : { campaign: { developerId: session.user.id } }),
    },
    include: { tester: true, campaign: { select: { id: true, title: true } } },
    orderBy: { reviewedAt: "desc" },
  });

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(submissions.map((submission) => ({
    campaign: submission.campaign.title,
    tester: submission.tester.username,
    feedbackText: submission.feedbackText,
    reviewedAt: submission.reviewedAt,
    proofImageIncluded: Boolean(submission.proofImageUrl),
  })), null, 2));

  for (const [index, submission] of submissions.entries()) {
    if (!submission.proofImageUrl) continue;
    const campaignFolder = `${submission.campaign.title.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48)}-${submission.campaign.id.slice(-6)}`;
    const testerName = submission.tester.username.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 32) || "tester";
    const filePrefix = `${campaignFolder}/${String(index + 1).padStart(2, "0")}-${testerName}`;
    if (submission.proofImageUrl.startsWith("data:")) {
      const inlineImage = /^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(submission.proofImageUrl);
      if (inlineImage) zip.file(`${filePrefix}.${inlineImage[1] === "jpeg" ? "jpg" : inlineImage[1]}`, inlineImage[2], { base64: true });
      continue;
    }
    try {
      const proofUrl = await getProofImageUrl(submission.proofImageUrl);
      if (!proofUrl) continue;
      const response = await fetch(proofUrl);
      if (!response.ok) continue;
      const arrayBuffer = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "";
      const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
      zip.file(`${filePrefix}.${extension}`, arrayBuffer);
    } catch {
      // Keep generating the remaining campaign assets if one remote image is unavailable.
    }
  }

  const archive = await zip.generateAsync({ type: "arraybuffer" });
  return new NextResponse(archive, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="seedenv-assets-${campaignId || "all-campaigns"}.zip"`,
    },
  });
}
