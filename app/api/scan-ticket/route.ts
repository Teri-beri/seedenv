import { NextResponse } from "next/server";
import { z } from "zod";
import { SUPPORTED_LINK_DOMAINS, allowLinkFetch, detectLinkPlatform } from "@/lib/comment-link-fetch";
import { issueScanChallenge } from "@/lib/scan-ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ url: z.string().trim().min(8).max(500) });

/** Opens the ad gate: hands back a signed pass that only becomes spendable after the watch time. */
export async function POST(request: Request) {
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
  if (!allowLinkFetch(`ticket:${ip}`)) {
    return NextResponse.json(
      { error: "Too many scans from this connection. Wait a few minutes, or use the Paste Comments tab — it's unlimited." },
      { status: 429 },
    );
  }

  const { challenge, watchMs, nonce } = issueScanChallenge(target.url.toString());
  // The nonce is safe to expose: it is the id an ad network echoes back on its reward postback,
  // and on its own it cannot forge a pass without the signing secret.
  return NextResponse.json(
    { challenge, watchMs, nonce, platform: target.platform },
    { headers: { "Cache-Control": "no-store" } },
  );
}
