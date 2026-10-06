import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const DEFAULT_USERNAME = "SeedEnv Member";

export function candidateValidatorHandle(digits = 4) {
  const low = 10 ** (digits - 1);
  return `validator-${randomInt(low, 10 ** digits)}`;
}

// Gives passwordless testers a public handle so they can skip profile setup; they can rename it in Account.
export async function ensureValidatorHandle(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
  if (!user || (user.username && user.username !== DEFAULT_USERNAME)) return user?.username ?? null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const handle = candidateValidatorHandle(attempt < 4 ? 4 : 6);
    const taken = await prisma.user.findFirst({ where: { username: { equals: handle, mode: "insensitive" } }, select: { id: true } });
    if (taken) continue;
    const updated = await prisma.user.updateMany({ where: { id: userId, username: user.username }, data: { username: handle } });
    if (updated.count) return handle;
    return (await prisma.user.findUnique({ where: { id: userId }, select: { username: true } }))?.username ?? null;
  }
  return null;
}
