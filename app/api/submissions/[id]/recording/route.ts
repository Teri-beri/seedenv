import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isStoredRecording } from "@/lib/recording";
import { deleteProofObject, getProofImageUrl, proofStorageConfigured, uploadProofRecording } from "@/lib/storage";
import { assertProofEditable } from "@/lib/submission-lifecycle";
import { SubmissionStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };
const MAX_RECORDING_BYTES = 50 * 1024 * 1024;
const extensions: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

function matchesSignature(buffer: Buffer, contentType: string) {
  if (contentType === "video/webm") return buffer.length > 4 && buffer.readUInt32BE(0) === 0x1a45dfa3;
  return buffer.length > 12 && buffer.toString("ascii", 4, 8) === "ftyp";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  const requestHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  if (!origin || new URL(origin).host !== requestHost) return NextResponse.json({ message: "Cross-site uploads are not allowed." }, { status: 403, headers });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: "Sign in to upload a recording." }, { status: 401, headers });
  if (!proofStorageConfigured()) return NextResponse.json({ message: "Recording uploads are not available yet. Paste a share link instead." }, { status: 503, headers });

  const contentType = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const extension = extensions[contentType];
  if (!extension) return NextResponse.json({ message: "Upload an MP4, MOV, or WebM recording." }, { status: 415, headers });
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_RECORDING_BYTES) return NextResponse.json({ message: "Recordings must be 50MB or smaller." }, { status: 413, headers });

  const { id } = await params;
  const submission = await prisma.submission.findUnique({ where: { id } });
  if (!submission || submission.testerId !== session.user.id) return NextResponse.json({ message: "Submission unavailable." }, { status: 404, headers });
  if (submission.status !== SubmissionStatus.PENDING) return NextResponse.json({ message: "This submission is no longer pending." }, { status: 409, headers });
  try {
    assertProofEditable(submission);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Proof is locked." }, { status: 409, headers });
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (!buffer.length) return NextResponse.json({ message: "The recording was empty." }, { status: 400, headers });
  if (buffer.length > MAX_RECORDING_BYTES) return NextResponse.json({ message: "Recordings must be 50MB or smaller." }, { status: 413, headers });
  if (!matchesSignature(buffer, contentType)) return NextResponse.json({ message: "The file does not look like a valid video." }, { status: 415, headers });

  try {
    const stored = await uploadProofRecording({ buffer, contentType, path: `recordings/${submission.id}/${randomUUID()}.${extension}` });
    const saved = await prisma.submission.updateMany({ where: { id, testerId: session.user.id, status: SubmissionStatus.PENDING }, data: { recordingUrl: stored } });
    if (saved.count !== 1) {
      await deleteProofObject(stored);
      return NextResponse.json({ message: "This submission changed during upload." }, { status: 409, headers });
    }
    if (submission.recordingUrl && isStoredRecording(submission.recordingUrl) && submission.recordingUrl !== stored) {
      await deleteProofObject(submission.recordingUrl).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, bytes: buffer.length }, { status: 201, headers });
  } catch (error) {
    console.error("SeedEnv recording upload failed:", id, error instanceof Error ? error.message : error);
    return NextResponse.json({ message: "Upload failed. Try again or paste a share link instead." }, { status: 502, headers });
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: "Sign in to view recordings." }, { status: 401, headers });
  const { id } = await params;
  const [viewer, submission] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } }),
    prisma.submission.findUnique({ where: { id }, select: { testerId: true, recordingUrl: true, campaign: { select: { developerId: true } } } }),
  ]);
  const allowed = submission && (submission.testerId === session.user.id || submission.campaign.developerId === session.user.id || viewer?.role === "ADMIN");
  if (!allowed || !isStoredRecording(submission.recordingUrl)) return NextResponse.json({ message: "Recording unavailable." }, { status: 404, headers });
  const signed = await getProofImageUrl(submission.recordingUrl).catch(() => null);
  if (!signed) return NextResponse.json({ message: "Recording unavailable." }, { status: 404, headers });
  return NextResponse.redirect(signed, { status: 302, headers });
}
