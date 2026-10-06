import { NextResponse } from "next/server";
import { getSystemStatus } from "@/lib/system-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getSystemStatus();
  return NextResponse.json(
    { overall: status.overall, checkedAt: status.checkedAt, services: status.services.map(({ id, name, state }) => ({ id, name, state })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
