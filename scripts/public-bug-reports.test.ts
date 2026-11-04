import assert from "node:assert/strict";
import { before, beforeEach, mock, test } from "node:test";
import type { PublicBugReport } from "@prisma/client";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicReportInput } from "../lib/organic-growth";
import { proofPath } from "../lib/storage";

let publicReport: PublicBugReport | null = null;
let submissionStatus = "APPROVED";
let screenshot = "proof:private/evidence-secret";
const input: PublicReportInput = { title: "Checkout freezes on confirmation", severity: "MAJOR", summary: "Expected a receipt; the loading spinner remains indefinitely.", reproSteps: ["Open the cart", "Confirm a sandbox payment"], includeMedia: false };
const fake = {
  submission: {
    findFirst: async ({ where }: { where: { campaign: { developerId: string }; status?: string } }) => where.campaign.developerId === "developer" && (!where.status || submissionStatus === where.status)
      ? { id: "submission-1", deviceModel: "iPhone 14 Pro", osBuild: "iOS 17.4", screenResolution: "393 x 852", hardwareStatus: "VERIFIED_PHYSICAL_NODE", proofImageUrl: screenshot, recordingUrl: "proof:recordings/submission-1/secret.mp4" } : null,
  },
  publicBugReport: {
    upsert: async ({ create, update }: { create: Omit<PublicBugReport, "id" | "publishedAt" | "updatedAt">; update: Partial<PublicBugReport> }) => {
      publicReport = publicReport ? { ...publicReport, ...update } : { ...create, id: "public-report-123", publishedAt: new Date(), updatedAt: new Date() };
      return { id: publicReport.id, isPublic: publicReport.isPublic };
    },
    update: async ({ data }: { data: Partial<PublicBugReport> }) => { if (!publicReport) throw new Error("Missing report"); publicReport = { ...publicReport, ...data }; return publicReport; },
    findUnique: async () => publicReport,
    findFirst: async ({ where }: { where: { id: string } }) => publicReport?.id === where.id && publicReport.isPublic && submissionStatus === "APPROVED" ? publicReport : null,
    findMany: async () => publicReport?.isPublic && submissionStatus === "APPROVED" ? [{ id: publicReport.id, updatedAt: publicReport.updatedAt }] : [],
  },
  user: { findMany: async () => [] },
};
let publish: typeof import("../lib/public-bug-reports").publishBugReport;
let revoke: typeof import("../lib/public-bug-reports").unpublishBugReport;
let getReport: typeof import("../lib/public-bug-reports").getPublicBugReport;
let prisma: typeof import("../lib/prisma").prisma;
let Page: typeof import("../app/report/[reportId]/page").default;
let metadata: typeof import("../app/report/[reportId]/page").generateMetadata;
let media: typeof import("../app/report/[reportId]/media/[kind]/route").GET;

before(async () => {
  mock.module("../lib/prisma.ts", { namedExports: { prisma: fake } });
  mock.module("../lib/storage.ts", { namedExports: {
    proofPath,
    downloadProofObject: async (value: string | null) => value ? { buffer: Buffer.from([137, 80, 78, 71]), mimeType: "image/png" } : null,
    getProofImageUrl: async () => "https://storage.example.invalid/private-token",
  } });
  mock.module("../lib/growth/blog.ts", { namedExports: { listPublishedPosts: async () => [] } });
  mock.module("next/navigation", { namedExports: { notFound: () => { throw new Error("NOT_FOUND"); } } });
  mock.module("next/link", { defaultExport: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children) });
  mock.module("next/image", { defaultExport: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) });
  ({ publishBugReport: publish, unpublishBugReport: revoke, getPublicBugReport: getReport } = await import("../lib/public-bug-reports"));
  ({ prisma } = await import("../lib/prisma"));
  ({ default: Page, generateMetadata: metadata } = await import("../app/report/[reportId]/page"));
  ({ GET: media } = await import("../app/report/[reportId]/media/[kind]/route"));
});
beforeEach(() => { publicReport = null; submissionStatus = "APPROVED"; screenshot = "proof:private/evidence-secret"; });
const props = { params: Promise.resolve({ reportId: "public-report-123" }) };

test("reports are unavailable until the owner publishes their own approved evidence", async () => {
  assert.equal(await getReport("public-report-123"), null);
  await assert.rejects(publish(prisma, "other-developer", "submission-1", input), /own approved/);
  submissionStatus = "PENDING";
  await assert.rejects(publish(prisma, "developer", "submission-1", input), /own approved/);
  assert.equal(publicReport, null);
});

test("publication copies only reviewed fields and media stays private without a separate opt-in", async () => {
  await publish(prisma, "developer", "submission-1", input);
  const report = await getReport("public-report-123");
  assert.ok(report);
  assert.equal(report.proofImageUrl, null);
  assert.equal(report.recordingUrl, null);
  assert.equal(report.title, input.title);
  assert.equal("testerId" in report, false);
  assert.equal("feedbackText" in report, false);
  assert.equal("crashLogs" in report, false);
  const html = renderToStaticMarkup(await Page(props));
  assert.match(html, /Copy GitHub Markdown/);
  assert.match(html, /Physical-device signals verified/);
  assert.match(html, /Post a Testing Sprint on Your Repo/);
  assert.doesNotMatch(html, /private\/evidence-secret|private-token|No report/);
});

test("opted-in media uses no-store proxy URLs; signed private storage URLs never appear in public HTML", async () => {
  await publish(prisma, "developer", "submission-1", { ...input, includeMedia: true });
  const html = renderToStaticMarkup(await Page(props));
  assert.match(html, /report\/public-report-123\/media\/screenshot/);
  assert.match(html, /report\/public-report-123\/media\/recording/);
  assert.doesNotMatch(html, /evidence-secret|secret\.mp4|private-token/);
  const response = await media(new Request("https://seedenv.com/report/public-report-123/media/screenshot"), { params: Promise.resolve({ reportId: "public-report-123", kind: "screenshot" }) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(response.headers.get("location"), null);
});

test("recording playback forwards valid byte ranges without redirecting or leaking storage tokens", async (context) => {
  await publish(prisma, "developer", "submission-1", { ...input, includeMedia: true });
  let forwardedRange: string | undefined;
  context.mock.method(globalThis, "fetch", async (_url: string, init?: RequestInit) => {
    forwardedRange = new Headers(init?.headers).get("range") ?? undefined;
    return new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-2/3", "content-length": "3", "accept-ranges": "bytes" } });
  });

  const params = Promise.resolve({ reportId: "public-report-123", kind: "recording" });
  const response = await media(new Request("https://seedenv.com/report/public-report-123/media/recording", { headers: { Range: "bytes=0-2" } }), { params });
  assert.equal(response.status, 206);
  assert.equal(forwardedRange, "bytes=0-2");
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("content-range"), "bytes 0-2/3");
  for (const range of ["bytes=0-2,5-10", "bytes=-"]) {
    const bad = await media(new Request("https://seedenv.com/report/public-report-123/media/recording", { headers: { Range: range } }), { params });
    assert.equal(bad.status, 416);
    assert.equal(forwardedRange, "bytes=0-2");
  }
});

test("legacy Supabase evidence uses the existing private-storage parser and revocable media endpoint", async (context) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldBucket = process.env.SUPABASE_PROOF_BUCKET;
  context.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldBucket === undefined) delete process.env.SUPABASE_PROOF_BUCKET; else process.env.SUPABASE_PROOF_BUCKET = oldBucket;
  });
  process.env.SUPABASE_URL = "https://proof-fixture.supabase.co";
  process.env.SUPABASE_PROOF_BUCKET = "proof-screenshots";
  screenshot = "https://proof-fixture.supabase.co/storage/v1/object/public/proof-screenshots/legacy%20evidence.png";
  await publish(prisma, "developer", "submission-1", { ...input, includeMedia: true });
  assert.equal((await getReport("public-report-123"))?.proofImageUrl, "proof:legacy evidence.png");
  const html = renderToStaticMarkup(await Page(props));
  assert.match(html, /media\/screenshot/);
  assert.doesNotMatch(html, /proof-fixture|legacy%20evidence/);
});

test("unsupported evidence cannot be silently omitted after media opt-in", async () => {
  screenshot = "https://unsupported.example/evidence.png";
  await assert.rejects(publish(prisma, "developer", "submission-1", { ...input, includeMedia: true }), /unsupported storage/);
  assert.equal(publicReport, null);
  await publish(prisma, "developer", "submission-1", input);
  assert.equal((await getReport("public-report-123"))?.proofImageUrl, null);
});

test("out-of-bounds recording ranges return 416 rather than a storage outage", async (context) => {
  await publish(prisma, "developer", "submission-1", { ...input, includeMedia: true });
  let cancelled = false;
  context.mock.method(globalThis, "fetch", async () => new Response(new ReadableStream({ cancel: () => { cancelled = true; } }), { status: 416, headers: { "content-range": "bytes */3" } }));
  const response = await media(new Request("https://seedenv.com/report/public-report-123/media/recording", { headers: { Range: "bytes=999-" } }), { params: Promise.resolve({ reportId: "public-report-123", kind: "recording" }) });
  assert.equal(response.status, 416);
  assert.equal(response.headers.get("content-range"), "bytes */3");
  assert.equal(cancelled, true);
});

test("revocation disables page, metadata, OG and media, and excludes the report from the sitemap", async () => {
  await publish(prisma, "developer", "submission-1", { ...input, includeMedia: true });
  const { default: sitemap } = await import("../app/sitemap");
  const before = await sitemap();
  assert.ok(before.some((entry) => entry.url === "https://seedenv.com/report/public-report-123"));
  for (const path of ["/tools", "/tools/viewport-check", "/tools/qa-checklist", "/tools/swarm-detector"]) assert.ok(before.some((entry) => entry.url === `https://seedenv.com${path}`));
  await assert.rejects(revoke(prisma, "other-developer", "submission-1"), /unavailable/);
  await revoke(prisma, "developer", "submission-1");
  assert.equal(await getReport("public-report-123"), null);
  await assert.rejects(Page(props), /NOT_FOUND/);
  assert.deepEqual((await metadata(props)).robots, { index: false, follow: false });
  const { default: image } = await import("../app/report/[reportId]/opengraph-image");
  assert.equal((await image(props)).status, 404);
  assert.equal((await media(new Request("https://seedenv.com/report/public-report-123/media/screenshot"), { params: Promise.resolve({ reportId: "public-report-123", kind: "screenshot" }) })).status, 404);
  assert.equal((await sitemap()).some((entry) => entry.url.includes("/report/")), false);
});

test("published metadata names the bug and device; the generated OG image is a valid 1200x630 PNG", async () => {
  await publish(prisma, "developer", "submission-1", input);
  const result = await metadata(props);
  assert.equal(result.title, input.title);
  assert.match(result.description!, /iPhone 14 Pro/);
  assert.equal(result.alternates?.canonical, "https://seedenv.com/report/public-report-123");
  const { default: image } = await import("../app/report/[reportId]/opengraph-image");
  const response = await image(props);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.equal(buffer.readUInt32BE(16), 1200);
  assert.equal(buffer.readUInt32BE(20), 630);
});

test("hardware-unverified reports are never advertised as physically verified", async () => {
  await publish(prisma, "developer", "submission-1", input);
  if (publicReport) publicReport.hardwareStatus = "UNVERIFIED";
  const html = renderToStaticMarkup(await Page(props));
  assert.match(html, /Hardware not verified/);
  assert.match(html, /Physical hardware was not verified/);
  assert.doesNotMatch(html, /### Verified Bug Report/);
});
