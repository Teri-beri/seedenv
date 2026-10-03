import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getProofImageUrl } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ message: "Sign in to view proof." }, { status: 401, headers });
  const { id } = await params;
  const [user, submission] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } }),
    prisma.submission.findUnique({ where: { id }, include: { campaign: { select: { developerId: true } } } }),
  ]);
  if (!user || !submission || (submission.testerId !== session.user.id && submission.campaign.developerId !== session.user.id && user.role !== "ADMIN")) return NextResponse.json({ message: "Proof unavailable." }, { status: 404, headers });
  try {
    const url = await getProofImageUrl(submission.proofImageUrl);
    if (!url) return NextResponse.json({ message: "Proof image unavailable." }, { status: 404, headers });
    if (url.startsWith("data:")) {
      const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(url);
      if (!match) throw new Error("Invalid stored proof image.");
      return new NextResponse(new Uint8Array(Buffer.from(match[2], "base64")), { headers: { ...headers, "Content-Type": match[1], "X-Content-Type-Options": "nosniff" } });
    }
    return NextResponse.redirect(url, { headers });
  } catch (error) {
    console.error("SeedEnv proof preview failed:", id, error);
    return NextResponse.json({ message: "Proof preview could not be loaded. Try again." }, { status: 503, headers });
  }
}
