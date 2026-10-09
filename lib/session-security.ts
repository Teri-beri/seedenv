import { decode, type JWTDecodeParams, type JWT } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export async function validateSessionToken(token: JWT | null): Promise<JWT | null> {
  if (!token?.id || !Number.isSafeInteger(token.sessionVersion) || (token.sessionVersion ?? -1) < 0) {
    if (token) console.warn("SeedEnv rejected a session without a valid revocation version.");
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: token.id },
    select: { sessionVersion: true, role: true },
  });
  if (!user || user.sessionVersion !== token.sessionVersion) {
    console.warn("SeedEnv rejected a revoked session.");
    return null;
  }
  return { ...token, role: user.role };
}

export async function decodeSessionToken(params: JWTDecodeParams): Promise<JWT | null> {
  return validateSessionToken(await decode(params));
}
