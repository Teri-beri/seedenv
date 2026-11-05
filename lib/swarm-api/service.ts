import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { effectivePlan, nextPeriodReset, usagePeriod, type SwarmApiPlan } from "@/lib/swarm-api/plans";
import type { ModerationRequest } from "@/lib/swarm-api/input";
import { fingerprintComment, RETENTION_MS, scoreComment, type ModerationAction, type ScoreResult } from "@/lib/swarm-api/scoring";
import { generateApiKey, generateFingerprintSalt, hashApiKey } from "@/lib/swarm-api/security";

const HISTORY_LIMIT = 1500;
const LAST_USED_THROTTLE_MS = 60_000;

export type SwarmApiAccountRecord = Prisma.SwarmApiAccountGetPayload<object>;

export async function getOrCreateSwarmApiAccount(userId: string) {
  const existing = await prisma.swarmApiAccount.findUnique({ where: { userId } });
  if (existing) return existing;
  try {
    return await prisma.swarmApiAccount.create({ data: { userId, fingerprintSalt: generateFingerprintSalt() } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return prisma.swarmApiAccount.findUniqueOrThrow({ where: { userId } });
    throw error;
  }
}

export async function authenticateApiKey(rawKey: string) {
  const key = await prisma.swarmApiKey.findUnique({ where: { keyHash: hashApiKey(rawKey) }, include: { account: true } });
  if (!key || key.revokedAt) return null;
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
    await prisma.swarmApiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return key;
}

// Atomically counts one check and refuses once the monthly allowance is spent, even under concurrent requests.
export async function consumeCheck(accountId: string, limit: number, now = new Date()) {
  const period = usagePeriod(now);
  const rows = await prisma.$queryRaw<Array<{ checks: number }>>`
    INSERT INTO "swarm_api_usage" ("accountId", "period", "checks", "updatedAt")
    VALUES (${accountId}, ${period}, 1, ${now})
    ON CONFLICT ("accountId", "period") DO UPDATE
      SET "checks" = "swarm_api_usage"."checks" + 1, "updatedAt" = ${now}
      WHERE "swarm_api_usage"."checks" < ${limit}
    RETURNING "checks"`;
  if (rows.length) return { allowed: true as const, used: Number(rows[0].checks), limit, resetsAt: nextPeriodReset(now) };
  return { allowed: false as const, used: limit, limit, resetsAt: nextPeriodReset(now) };
}

export type ModerationOutcome = ScoreResult & { id: string; plan: SwarmApiPlan; usage: { used: number; limit: number; remaining: number; resetsAt: string } };

export async function moderateComment(account: SwarmApiAccountRecord, input: ModerationRequest, usage: { used: number; limit: number; resetsAt: Date }, now = new Date()): Promise<ModerationOutcome> {
  const current = fingerprintComment(account.fingerprintSalt, input);
  const cutoff = new Date(now.getTime() - RETENTION_MS);
  const candidates: Prisma.SwarmApiFingerprintWhereInput[] = [{ authorHash: current.authorHash }, { textHash: current.textHash }];
  if (current.tokenHashes.length) candidates.push({ tokenHashes: { hasSome: current.tokenHashes } });
  const history = await prisma.swarmApiFingerprint.findMany({
    where: { accountId: account.id, createdAt: { gte: cutoff }, OR: candidates },
    select: { authorHash: true, threadHash: true, textHash: true, tokenHashes: true, postedAt: true },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  const result = scoreComment(current, history, { authorAccountAgeDays: input.authorAccountAgeDays, thresholds: input.thresholds });
  const record = await prisma.swarmApiFingerprint.create({
    data: {
      accountId: account.id,
      commentId: input.commentId,
      threadHash: current.threadHash,
      authorHash: current.authorHash,
      textHash: current.textHash,
      tokenHashes: current.tokenHashes,
      linkCount: current.linkCount,
      postedAt: current.postedAt,
      score: result.score,
      action: result.action,
      signals: result.signals.map((signal) => signal.code),
    },
    select: { id: true },
  });
  if (result.action !== "allow") {
    await prisma.swarmApiUsage.update({
      where: { accountId_period: { accountId: account.id, period: usagePeriod(now) } },
      data: result.action === "hold" ? { holdCount: { increment: 1 } } : { reviewCount: { increment: 1 } },
    }).catch(() => undefined);
  }
  return {
    ...result,
    id: `mod_${record.id}`,
    plan: effectivePlan(account),
    usage: { used: usage.used, limit: usage.limit, remaining: Math.max(0, usage.limit - usage.used), resetsAt: usage.resetsAt.toISOString() },
  };
}

export async function purgeExpiredFingerprints(now = new Date()) {
  const { count } = await prisma.swarmApiFingerprint.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RETENTION_MS) } } });
  return { swarmFingerprintsPurged: count };
}

export class SwarmApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function createApiKey(userId: string, name: string) {
  const account = await getOrCreateSwarmApiAccount(userId);
  const plan = effectivePlan(account);
  const label = name.trim().slice(0, 60) || "Default key";
  const active = await prisma.swarmApiKey.count({ where: { accountId: account.id, revokedAt: null } });
  if (active >= plan.maxKeys) throw new SwarmApiError(`The ${plan.name} plan allows ${plan.maxKeys} active key${plan.maxKeys === 1 ? "" : "s"}. Revoke one or upgrade.`, 409);
  const generated = generateApiKey();
  const key = await prisma.swarmApiKey.create({ data: { accountId: account.id, name: label, prefix: generated.prefix, keyHash: generated.keyHash }, select: { id: true, name: true, prefix: true, createdAt: true } });
  return { ...key, secret: generated.key };
}

export async function revokeApiKey(userId: string, keyId: string) {
  const { count } = await prisma.swarmApiKey.updateMany({ where: { id: keyId, revokedAt: null, account: { userId } }, data: { revokedAt: new Date() } });
  if (!count) throw new SwarmApiError("Key not found or already revoked.", 404);
}

export type SwarmApiDashboard = {
  plan: SwarmApiPlan;
  billedPlan: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usage: { used: number; limit: number; reviewCount: number; holdCount: number; resetsAt: string };
  keys: Array<{ id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null }>;
  webhook: { url: string | null; secret: string | null; lastStatus: number | null; lastAt: string | null };
  recentFlags: Array<{ id: string; commentId: string | null; score: number; action: ModerationAction; signals: string[]; createdAt: string }>;
  last24h: { checks: number; flagged: number };
};

export async function getSwarmApiDashboard(userId: string, now = new Date()): Promise<SwarmApiDashboard> {
  const account = await getOrCreateSwarmApiAccount(userId);
  const plan = effectivePlan(account);
  const since = new Date(now.getTime() - RETENTION_MS);
  const [usage, keys, recentFlags, checks24h, flagged24h] = await Promise.all([
    prisma.swarmApiUsage.findUnique({ where: { accountId_period: { accountId: account.id, period: usagePeriod(now) } } }),
    prisma.swarmApiKey.findMany({ where: { accountId: account.id, revokedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true } }),
    prisma.swarmApiFingerprint.findMany({ where: { accountId: account.id, action: { in: ["review", "hold"] }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, commentId: true, score: true, action: true, signals: true, createdAt: true } }),
    prisma.swarmApiFingerprint.count({ where: { accountId: account.id, createdAt: { gte: since } } }),
    prisma.swarmApiFingerprint.count({ where: { accountId: account.id, createdAt: { gte: since }, action: { in: ["review", "hold"] } } }),
  ]);
  return {
    plan,
    billedPlan: account.plan,
    subscriptionStatus: account.subscriptionStatus,
    currentPeriodEnd: account.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: account.cancelAtPeriodEnd,
    usage: { used: usage?.checks ?? 0, limit: plan.monthlyChecks, reviewCount: usage?.reviewCount ?? 0, holdCount: usage?.holdCount ?? 0, resetsAt: nextPeriodReset(now).toISOString() },
    keys: keys.map((key) => ({ ...key, createdAt: key.createdAt.toISOString(), lastUsedAt: key.lastUsedAt?.toISOString() ?? null })),
    webhook: { url: account.webhookUrl, secret: account.webhookSecret, lastStatus: account.webhookLastStatus, lastAt: account.webhookLastAt?.toISOString() ?? null },
    recentFlags: recentFlags.map((flag) => ({ ...flag, id: `mod_${flag.id}`, action: flag.action as ModerationAction, createdAt: flag.createdAt.toISOString() })),
    last24h: { checks: checks24h, flagged: flagged24h },
  };
}
