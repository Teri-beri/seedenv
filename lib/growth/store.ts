import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export type ContentStatus = "RESEARCHING" | "DRAFTED" | "APPROVED" | "PUBLISHED" | "REJECTED";
export type SocialStatus = "PENDING_APPROVAL" | "MANUAL" | "QUEUED" | "PUBLISHED" | "REJECTED" | "FAILED";
export type Platform = "TWITTER" | "LINKEDIN" | "INSTAGRAM" | "TIKTOK";
export type AdAction = "MAINTAINED" | "ALERTED" | "PAUSED";

export type ContentDropRecord = { id: string; title: string; targetKeyword: string; slug: string; status: ContentStatus; markdownBody: string | null; metadata: unknown; research: unknown; reviewNote: string | null; externalUrl: string | null; approvedAt: Date | null; publishedAt: Date | null; createdAt: Date };
export type SocialRecord = { id: string; contentDropId: string | null; platform: Platform; postText: string; mediaUrls: string[]; linkUrl: string | null; videoScript: unknown; scheduledTime: Date; status: SocialStatus; externalId: string | null; lastError: string | null };
export type AdAuditRecord = { provider: string; campaignId: string; campaignName: string; spend: number; impressions: number; conversions: number; cpa: number | null; thresholdCpa: number; actionTaken: AdAction; reason: string; timestamp?: Date };

export interface GrowthStore {
  keywordsUsedSince(since: Date): Promise<string[]>;
  slugTaken(slug: string): Promise<boolean>;
  createContentDrop(input: Pick<ContentDropRecord, "title" | "targetKeyword" | "slug" | "status"> & { research?: unknown }): Promise<ContentDropRecord>;
  updateContentDrop(id: string, patch: Partial<Omit<ContentDropRecord, "id" | "createdAt">>, expectedStatus?: ContentStatus): Promise<ContentDropRecord | null>;
  getContentDrop(id: string): Promise<ContentDropRecord | null>;
  createSocialPosts(rows: Array<Omit<SocialRecord, "id" | "externalId" | "lastError">>): Promise<SocialRecord[]>;
  getSocialPost(id: string): Promise<SocialRecord | null>;
  updateSocialPost(id: string, patch: Partial<Omit<SocialRecord, "id">>, expectedStatus?: SocialStatus): Promise<SocialRecord | null>;
  createAdAudit(row: AdAuditRecord): Promise<void>;
  lastAdAudit(campaignId: string, since: Date): Promise<AdAuditRecord | null>;
}

const num = (value: unknown) => value === null || value === undefined ? null : Number(value);

export function prismaGrowthStore(prisma: PrismaClient): GrowthStore {
  // Status-guarded updates (updateMany with the expected status) make approve/reject idempotent under double clicks.
  const guarded = async <T>(find: () => Promise<T | null>, count: number) => count ? find() : null;
  return {
    async keywordsUsedSince(since) {
      const rows = await prisma.contentDrop.findMany({ where: { createdAt: { gte: since }, status: { not: "REJECTED" } }, select: { targetKeyword: true } });
      return rows.map((row) => row.targetKeyword.toLowerCase());
    },
    async slugTaken(slug) {
      return Boolean(await prisma.contentDrop.findUnique({ where: { slug }, select: { id: true } }));
    },
    createContentDrop: (input) => prisma.contentDrop.create({ data: { ...input, research: input.research as object | undefined } }) as Promise<ContentDropRecord>,
    async updateContentDrop(id, patch, expectedStatus) {
      const { count } = await prisma.contentDrop.updateMany({ where: { id, ...(expectedStatus ? { status: expectedStatus } : {}) }, data: { ...patch, metadata: patch.metadata as object | undefined, research: patch.research as object | undefined } });
      return guarded(() => prisma.contentDrop.findUnique({ where: { id } }) as Promise<ContentDropRecord | null>, count);
    },
    getContentDrop: (id) => prisma.contentDrop.findUnique({ where: { id } }) as Promise<ContentDropRecord | null>,
    async createSocialPosts(rows) {
      return prisma.$transaction(rows.map((data) => prisma.socialQueue.create({ data: { ...data, videoScript: (data.videoScript ?? undefined) as object | undefined } }))) as Promise<SocialRecord[]>;
    },
    getSocialPost: (id) => prisma.socialQueue.findUnique({ where: { id } }) as Promise<SocialRecord | null>,
    async updateSocialPost(id, patch, expectedStatus) {
      const { count } = await prisma.socialQueue.updateMany({ where: { id, ...(expectedStatus ? { status: expectedStatus } : {}) }, data: { ...patch, videoScript: patch.videoScript as object | undefined } });
      return guarded(() => prisma.socialQueue.findUnique({ where: { id } }) as Promise<SocialRecord | null>, count);
    },
    async createAdAudit(row) {
      await prisma.adAudit.create({ data: row });
    },
    async lastAdAudit(campaignId, since) {
      const row = await prisma.adAudit.findFirst({ where: { campaignId, timestamp: { gte: since } }, orderBy: { timestamp: "desc" } });
      return row ? { ...row, spend: Number(row.spend), cpa: num(row.cpa), thresholdCpa: Number(row.thresholdCpa) } : null;
    },
  };
}

export function memoryGrowthStore() {
  const drops = new Map<string, ContentDropRecord>();
  const social = new Map<string, SocialRecord>();
  const audits: AdAuditRecord[] = [];
  const store: GrowthStore = {
    async keywordsUsedSince(since) {
      return [...drops.values()].filter((drop) => drop.createdAt >= since && drop.status !== "REJECTED").map((drop) => drop.targetKeyword.toLowerCase());
    },
    async slugTaken(slug) {
      return [...drops.values()].some((drop) => drop.slug === slug);
    },
    async createContentDrop(input) {
      const drop: ContentDropRecord = { id: randomUUID(), markdownBody: null, metadata: null, reviewNote: null, externalUrl: null, approvedAt: null, publishedAt: null, createdAt: new Date(), research: null, ...input };
      drops.set(drop.id, drop);
      return { ...drop };
    },
    async updateContentDrop(id, patch, expectedStatus) {
      const drop = drops.get(id);
      if (!drop || (expectedStatus && drop.status !== expectedStatus)) return null;
      Object.assign(drop, patch);
      return { ...drop };
    },
    getContentDrop: async (id) => drops.has(id) ? { ...drops.get(id)! } : null,
    async createSocialPosts(rows) {
      return rows.map((row) => {
        const record: SocialRecord = { id: randomUUID(), externalId: null, lastError: null, ...row };
        social.set(record.id, record);
        return { ...record };
      });
    },
    getSocialPost: async (id) => social.has(id) ? { ...social.get(id)! } : null,
    async updateSocialPost(id, patch, expectedStatus) {
      const post = social.get(id);
      if (!post || (expectedStatus && post.status !== expectedStatus)) return null;
      Object.assign(post, patch);
      return { ...post };
    },
    async createAdAudit(row) {
      audits.push({ ...row, timestamp: row.timestamp ?? new Date() });
    },
    async lastAdAudit(campaignId, since) {
      return audits.filter((row) => row.campaignId === campaignId && (row.timestamp ?? new Date()) >= since).at(-1) ?? null;
    },
  };
  return Object.assign(store, { drops, social, audits });
}
