import { NextResponse } from "next/server";
import { clipMember } from "@/lib/clippers";
import { clipAssetUrl } from "@/lib/clipper-storage";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await clipMember();
    const { id } = await params;
    const url = await clipAssetUrl(id, member);
    return NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Private asset unavailable." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
}
