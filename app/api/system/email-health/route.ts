import { NextResponse } from "next/server";

function cleanEnv(value: string | undefined) {
  return value?.trim().replace(/^['"]|['"]$/g, "");
}

function fromDomain(value: string | undefined) {
  const match = value?.match(/<[^@<>]+@([^<>]+)>|^[^@<>]+@([^<>]+)$/);
  return match?.[1] || match?.[2] || null;
}

export function GET() {
  const resendKey = cleanEnv(process.env.RESEND_API_KEY);
  const nextAuthSecret = cleanEnv(process.env.NEXTAUTH_SECRET);
  const authEmailFrom = cleanEnv(process.env.AUTH_EMAIL_FROM) || "SeedEnv Authentication <auth@seedenv.com>";

  return NextResponse.json({
    ok: Boolean(nextAuthSecret && resendKey?.startsWith("re_")),
    nextAuthSecretConfigured: Boolean(nextAuthSecret),
    resendApiKeyConfigured: Boolean(resendKey),
    resendApiKeyLooksValid: Boolean(resendKey?.startsWith("re_")),
    authEmailFrom,
    authEmailDomain: fromDomain(authEmailFrom),
    expectedVerifiedDomain: "seedenv.com",
  });
}