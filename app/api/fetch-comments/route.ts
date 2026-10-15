import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SUPPORTED_LINK_DOMAINS,
  allowLinkFetch,
  detectLinkPlatform,
  fetchCommentsForLink,
} from "@/lib/comment-link-fetch";
import { consumeScanTicket, refundScanTicket, verifyScanTicket } from "@/lib/scan-ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  url: z.string().trim().min(8).max(500),
  platform: z.string().trim().max(40).optional(),
  challenge: z.string().trim().min(16).max(400),
});

export async function POST(request: Request) {
  // JSON-only forces a CORS preflight, so other sites cannot drive this endpoint from a visitor's browser.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Unsupported request." }, { status: 415 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Send a post link between 8 and 500 characters." }, { status: 400 });
  }
  const target = detectLinkPlatform(body.url);
  if (!target) {
    return NextResponse.json(
      { error: `That link isn't supported. Use a public https post link from: ${SUPPORTED_LINK_DOMAINS.join(", ")}.` },
      { status: 400 },
    );
  }

  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  if (!allowLinkFetch(`ip:${ip}`)) {
    return NextResponse.json(
      { error: "Too many link scans from this connection. Wait a few minutes, or use the Paste Comments tab — it has no limits." },
      { status: 429 },
    );
  }

  // Each scan bills a licensed provider per comment, so it has to be funded by an ad view first.
  const ticket = verifyScanTicket(body.challenge, target.url.toString());
  if (!ticket.ok) {
    return NextResponse.json({ error: ticket.message, reason: ticket.reason }, { status: 402 });
  }
  // Burned before the provider call so parallel replays of one pass cannot double-spend.
  consumeScanTicket(ticket.nonce);

  try {
    const result = await fetchCommentsForLink(target.platform, target.url);
    // The guidance path never reaches the provider, so the visitor's ad paid for nothing —
    // give the pass back rather than making them watch another to retry the same post.
    if (result.status === "guidance") refundScanTicket(ticket.nonce);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Deliberately not refunded: a thrown provider call may still have been billed, and a pass
    // that survives failures could be looped to burn credit for free.
    console.error("SeedEnv link comment fetch failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json(
      { error: "The link couldn't be read just now. Switch to the Paste Comments tab for instant offline processing." },
      { status: 502 },
    );
  }
}
