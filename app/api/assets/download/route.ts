import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";
import { SubmissionStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isStoredRecording } from "@/lib/recording";
import { downloadProofObject, getProofImageUrl } from "@/lib/storage";

const MAX_RECORDING_BYTES = 50 * 1024 * 1024;

function evidenceJson(submission: {
  id: string;
  feedbackText: string | null;
  recordingUrl: string | null;
  osBuild: string | null;
  deviceModel: string | null;
  screenResolution: string | null;
  appBuildVersion: string | null;
  networkType: string | null;
  crashLogs: string | null;
  networkLogs: string | null;
  hardwareStatus: string;
  hardwareFlags: string[];
  gpuRenderer: string | null;
  reviewedAt: Date | null;
  tester: { username: string };
  campaign: { id: string; title: string };
}) {
  return {
    submissionId: submission.id,
    campaign: submission.campaign,
    validator: submission.tester.username,
    reviewedAt: submission.reviewedAt,
    report: submission.feedbackText,
    recordingUrl: submission.recordingUrl && !isStoredRecording(submission.recordingUrl) ? submission.recordingUrl : null,
    device: {
      model: submission.deviceModel,
      osBuild: submission.osBuild,
      screenResolution: submission.screenResolution,
      appBuildVersion: submission.appBuildVersion,
      networkType: submission.networkType,
      hardwareStatus: submission.hardwareStatus,
      hardwareFlags: submission.hardwareFlags,
      gpuRenderer: submission.gpuRenderer,
    },
    logs: { crash: submission.crashLogs, network: submission.networkLogs },
  };
}

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
      OR: [
        { proofImageUrl: { not: null } },
        { recordingUrl: { not: null } },
        { crashLogs: { not: null } },
        { networkLogs: { not: null } },
        { feedbackText: { not: null } },
      ],
      ...(campaignId ? { campaignId } : { campaign: { developerId: session.user.id } }),
    },
    include: { tester: true, campaign: { select: { id: true, title: true } } },
    orderBy: { reviewedAt: "desc" },
  });

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(submissions.map((submission) => ({
    ...evidenceJson(submission),
    screenshotIncluded: Boolean(submission.proofImageUrl),
    recordingIncluded: isStoredRecording(submission.recordingUrl),
  })), null, 2));

  for (const [index, submission] of submissions.entries()) {
    const campaignFolder = `${submission.campaign.title.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48)}-${submission.campaign.id.slice(-6)}`;
    const testerName = submission.tester.username.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 32) || "tester";
    const filePrefix = `${campaignFolder}/${String(index + 1).padStart(2, "0")}-${testerName}`;
    zip.file(`${filePrefix}-evidence.json`, JSON.stringify(evidenceJson(submission), null, 2));
    if (submission.crashLogs) zip.file(`${filePrefix}-crash.log`, submission.crashLogs);
    if (submission.networkLogs) zip.file(`${filePrefix}-network.log`, submission.networkLogs);
    if (isStoredRecording(submission.recordingUrl)) {
      const recording = await downloadProofObject(submission.recordingUrl, MAX_RECORDING_BYTES);
      if (recording) {
        const extension = recording.mimeType.includes("webm") ? "webm" : recording.mimeType.includes("quicktime") ? "mov" : "mp4";
        zip.file(`${filePrefix}-recording.${extension}`, recording.buffer);
      }
    }
    if (!submission.proofImageUrl) continue;
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
