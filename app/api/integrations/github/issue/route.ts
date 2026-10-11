import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { submissionId?: string } | null;
  if (!body?.submissionId || !/^[A-Za-z0-9_-]+$/.test(body.submissionId)) {
    return NextResponse.json({ message: "A valid submissionId is required." }, { status: 400 });
  }
  const target = new URL(`/api/submissions/${encodeURIComponent(body.submissionId)}/export-github`, request.url);
  return NextResponse.redirect(target, 307);
}
