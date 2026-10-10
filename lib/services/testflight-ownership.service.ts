import type { Prisma } from "@prisma/client";

export class TestFlightOwnershipError extends Error {}

export function isTestFlightUrl(rawUrl: string) {
  try { return new URL(rawUrl.trim()).hostname.toLowerCase() === "testflight.apple.com"; }
  catch { throw new TestFlightOwnershipError("Enter a valid app URL."); }
}

export function testFlightJoinToken(rawUrl: string): string {
  let url: URL;
  try { url = new URL(rawUrl.trim()); }
  catch { throw new TestFlightOwnershipError("Enter a valid public TestFlight join link."); }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "testflight.apple.com" || url.username || url.password || url.port) {
    throw new TestFlightOwnershipError("TestFlight cohorts require an HTTPS testflight.apple.com/join/ link.");
  }
  const match = url.pathname.match(/^\/join\/([A-Za-z0-9]{8})\/?$/);
  if (!match) throw new TestFlightOwnershipError("Use the public TestFlight join link, not a redirect or app-store URL.");
  return match[1];
}

export async function assertTestFlightOwner(tx: Prisma.TransactionClient, developerId: string, rawUrl: string, campaignId?: string, claim = false) {
  const joinToken = testFlightJoinToken(rawUrl);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`testflight:${joinToken}`}))`;
  const existing = await tx.testFlightBuild.findUnique({ where: { joinToken } });
  if (existing && existing.developerId !== developerId) throw new TestFlightOwnershipError("This TestFlight build is already linked to its original developer. Contact SeedEnv support to verify an ownership transfer.");
  if (!existing && claim) {
    await tx.testFlightBuild.create({ data: { joinToken, developerId, originalCampaignId: campaignId } });
  }
  return `https://testflight.apple.com/join/${joinToken}`;
}
