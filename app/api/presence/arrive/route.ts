import { broadcastVisitorArrival } from "@/lib/visitor-pulse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST() {
  broadcastVisitorArrival();
  return new Response(null, { status: 204 });
}
