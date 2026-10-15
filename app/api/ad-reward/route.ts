import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { markAdVerified } from "@/lib/scan-ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretMatches(given: string | null, expected: string) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Server-to-server reward postback for an ad network. Networks differ on verb and parameter
 * names, so both GET and POST are accepted and the nonce is read from whichever macro is sent.
 * Until a network is wired up this stays dormant: without AD_POSTBACK_SECRET nothing is accepted.
 */
async function handle(request: Request) {
  const expected = process.env.AD_POSTBACK_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ error: "Reward postbacks are not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const params = url.searchParams;
  let bodyParams: Record<string, string> = {};
  if (request.method === "POST") {
    try {
      const raw = await request.text();
      bodyParams = raw.trim().startsWith("{")
        ? (JSON.parse(raw) as Record<string, string>)
        : Object.fromEntries(new URLSearchParams(raw));
    } catch {
      bodyParams = {};
    }
  }

  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = params.get(key) ?? bodyParams[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };

  const secret = pick("secret", "token", "key") ?? request.headers.get("x-ad-postback-secret");
  if (!secretMatches(secret, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const nonce = pick("nonce", "ymid", "subid", "sub_id", "var", "user_id");
  if (!nonce || nonce.length > 64) {
    return NextResponse.json({ error: "Missing reward id." }, { status: 400 });
  }

  markAdVerified(nonce);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
