import assert from "node:assert/strict";
import test, { mock } from "node:test";
import type { ClipEngagement, ClipProfile, Prisma } from "@prisma/client";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyClip, inviteClipCreator, requireClipConversation, respondClipInvitation, reviewClipApplication, reviewCreatorProfile, saveCreatorProfile, submitCreatorProfile } from "../lib/clipper-lifecycle";
import { clipTermsVersion } from "../lib/clipper-rules";

type Stub = Record<string, (args: unknown) => unknown>;
function database(stubs: { user?: Stub; clipProfile?: Stub; clipCampaign?: Stub; clipEngagement?: Stub }) {
  const missing = () => { throw new Error("Unexpected database operation in marketplace test"); };
  const base = { findUnique: missing, findUniqueOrThrow: missing, findFirst: missing, count: missing, create: missing, update: missing, upsert: missing };
  return {
    user: { ...base, ...stubs.user }, clipProfile: { ...base, ...stubs.clipProfile },
    clipCampaign: { ...base, ...stubs.clipCampaign }, clipEngagement: { ...base, ...stubs.clipEngagement },
  } as unknown as Prisma.TransactionClient;
}
const creator = { id: "creator", role: "TESTER", testerWorkspaceEnabled: true, emailVerified: new Date(), xpPoints: 200 };
const developer = { id: "developer", role: "DEVELOPER", platformFeeWaived: false };
const campaign = { id: "campaign", developerId: "developer", open: true, platform: "TIKTOK", minimumRep: 100, feeCents: 5000 };
const input = { bio: "An original gaming and mobile app creator.", portfolioUrl: "https://example.invalid/samples", socialUrl: "https://www.tiktok.com/@creator", specialties: "Gaming tutorials for students", genres: ["Gaming" as const], tiktokUrl: "", instagramUrl: "", youtubeUrl: "" };
const profile: ClipProfile = { ...input, available: true, userId: "creator", status: "APPROVED", revision: 3, submittedAt: new Date(), reviewedAt: new Date(), reviewedById: "admin", reviewNote: "Reviewed the real profile and samples.", updatedAt: new Date() };
function readData(args: unknown): Partial<ClipEngagement> {
  assert.ok(args && typeof args === "object" && "data" in args);
  return args.data as Partial<ClipEngagement>;
}

test("only approved profiles can apply, and application captures immutable profile and terms", async () => {
  let state = { ...profile };
  let existing = false;
  const tx = database({
    user: { findUniqueOrThrow: (args) => JSON.stringify(args).includes("developer") ? developer : creator },
    clipProfile: { findUnique: () => state },
    clipCampaign: { findUnique: () => campaign },
    clipEngagement: { findUnique: () => existing ? { id: "existing" } : null, count: () => 0, create: (args) => ({ id: "agreement", ...readData(args) }) },
  });
  state.status = "PENDING_REVIEW";
  await assert.rejects(applyClip(tx, "creator", "campaign", "A concept that fits this audience."), /approved/);
  state = { ...profile };
  const item = await applyClip(tx, "creator", "campaign", "A concept that fits this audience.");
  assert.equal(item.chargeCents, 5953);
  assert.equal(item.termsVersion, clipTermsVersion);
  assert.ok(item.termsAcceptedAt);
  assert.deepEqual(item.profileSnapshot, { bio: profile.bio, specialties: profile.specialties, genres: profile.genres, portfolioUrl: profile.portfolioUrl, socialUrl: profile.socialUrl, tiktokUrl: "", instagramUrl: "", youtubeUrl: "", revision: 3 });
  existing = true;
  await assert.rejects(applyClip(tx, "creator", "campaign", "A duplicate application is rejected."), /already applied/);
});

test("developer invitations do not imply creator consent and freeze the original quote", async () => {
  let count = 0;
  let currentCampaign = { ...campaign, open: false };
  const tx = database({
    user: { findUniqueOrThrow: (args) => JSON.stringify(args).includes("developer") ? developer : creator },
    clipProfile: { findUnique: () => profile }, clipCampaign: { findUnique: () => currentCampaign },
    clipEngagement: { findUnique: () => null, count: () => count, create: (args) => ({ id: "invite", ...readData(args) }) },
  });
  const item = await inviteClipCreator(tx, "developer", "creator", "campaign", "We would love your original gaming perspective.");
  assert.equal(item.status, "INVITED");
  assert.equal(item.chargeCents, 5953);
  assert.equal(item.termsAcceptedAt, undefined);
  assert.ok(item.invitationExpiresAt && item.invitedAt);
  assert.equal(item.invitationExpiresAt!.getTime() - item.invitedAt!.getTime(), 7 * 86400000);
  count = 20;
  await assert.rejects(inviteClipCreator(tx, "developer", "creator", "campaign", "We would love your original gaming perspective."), /twenty/);
  count = 0;
  currentCampaign = { ...campaign, developerId: "other", open: false };
  await assert.rejects(inviteClipCreator(tx, "developer", "creator", "campaign", "We would love your original gaming perspective."), /your developer/);
});

test("pausing a listing blocks new invitations, not proactive applications or accepted conversations", async () => {
  const tx = database({
    user: { findUniqueOrThrow: (args) => JSON.stringify(args).includes("developer") ? developer : creator },
    clipProfile: { findUnique: () => ({ ...profile, available: false }) }, clipCampaign: { findUnique: () => campaign },
    clipEngagement: { findUnique: () => null, count: () => 0, create: (args) => ({ id: "application", ...readData(args) }) },
  });
  await assert.rejects(inviteClipCreator(tx, "developer", "creator", "campaign", "We would love your original gaming perspective."), /paused new marketplace invitations/);
  assert.equal((await applyClip(tx, "creator", "campaign", "I am still interested in this specific app.")).id, "application");
  const roomTx = database({ clipEngagement: { findUnique: () => ({ creatorId: "creator", campaignId: "campaign", campaign, status: "FUNDED" }) } });
  await requireClipConversation(roomTx, "campaign", "funded", "creator", "TESTER");
});

test("saving identical normalized content preserves marketplace approval and revision", async () => {
  const current = { ...profile, tiktokUrl: null, instagramUrl: null, youtubeUrl: null };
  const tx = database({ clipProfile: { findUnique: () => current } });
  const saved = await saveCreatorProfile(tx, "creator", input, 3);
  assert.equal(saved, current);
  assert.equal(saved.status, "APPROVED");
  assert.equal(saved.revision, 3);
});

test("invitation acceptance enforces owner, expiry, profile approval, and explicit terms", async () => {
  let status = "INVITED";
  let expires = new Date(Date.now() + 86400000);
  let profileStatus: ClipProfile["status"] = "APPROVED";
  const tx = database({
    user: { findUniqueOrThrow: () => creator }, clipProfile: { findUnique: () => ({ ...profile, status: profileStatus }) },
    clipEngagement: { findUnique: () => ({ id: "invite", creatorId: "creator", status, campaign, invitationExpiresAt: expires }), update: (args) => ({ id: "invite", ...readData(args) }) },
  });
  await assert.rejects(respondClipInvitation(tx, "stranger", "invite", true, "This concept matches my real audience."), /not found/);
  expires = new Date(0);
  await assert.rejects(respondClipInvitation(tx, "creator", "invite", true, "This concept matches my real audience."), /expired/);
  assert.equal((await respondClipInvitation(tx, "creator", "invite", false, "")).status, "INVITATION_DECLINED");
  expires = new Date(Date.now() + 86400000);
  profileStatus = "SUSPENDED";
  await assert.rejects(respondClipInvitation(tx, "creator", "invite", true, "This concept matches my real audience."), /approved/);
  profileStatus = "APPROVED";
  const accepted = await respondClipInvitation(tx, "creator", "invite", true, "This concept matches my real audience.");
  assert.equal(accepted.status, "ACCEPTED");
  assert.ok(accepted.termsAcceptedAt);
  status = "ACCEPTED";
  await assert.rejects(respondClipInvitation(tx, "creator", "invite", true, "This concept matches my real audience."), /unavailable/);
});

test("profile edits remove listing, reject stale writes, and require explicit resubmission", async () => {
  let updated: Partial<ClipProfile> | undefined;
  const tx = database({
    user: { findUniqueOrThrow: () => creator },
    clipProfile: { findUnique: () => profile, upsert: (args) => { assert.ok(args && typeof args === "object" && "update" in args); updated = args.update as Partial<ClipProfile>; return updated; } },
  });
  await assert.rejects(saveCreatorProfile(tx, "creator", input, 2), /another tab/);
  await saveCreatorProfile(tx, "creator", { ...input, bio: "An updated original gaming and mobile app creator." }, 3);
  assert.equal(updated?.status, "DRAFT");
  assert.equal(updated?.reviewedAt, null);
  assert.equal(updated?.submittedAt, null);
  const submitTx = database({ user: { findUniqueOrThrow: () => creator }, clipProfile: { findUnique: () => ({ ...profile, status: "DRAFT" }), update: (args) => readData(args) } });
  await assert.rejects(submitCreatorProfile(submitTx, "creator", 2), /changed/);
  assert.equal((await submitCreatorProfile(submitTx, "creator", 3)).status, "PENDING_REVIEW");
});

test("admin review cannot approve a stale revision or bypass the review state", async () => {
  let role = "ADMIN";
  let state: ClipProfile["status"] = "PENDING_REVIEW";
  const tx = database({ user: { findUniqueOrThrow: () => ({ role }) }, clipProfile: { findUnique: () => ({ ...profile, status: state, user: creator }), update: (args) => readData(args) } });
  await assert.rejects(reviewCreatorProfile(tx, "admin", "creator", 2, "APPROVED", "Reviewed samples and accounts."), /changed/);
  role = "TESTER";
  await assert.rejects(reviewCreatorProfile(tx, "admin", "creator", 3, "APPROVED", "Reviewed samples and accounts."), /administrators/);
  role = "ADMIN";
  assert.equal((await reviewCreatorProfile(tx, "admin", "creator", 3, "APPROVED", "Reviewed samples and accounts.")).status, "APPROVED");
  state = "SUSPENDED";
  await assert.rejects(reviewCreatorProfile(tx, "admin", "creator", 3, "APPROVED", "Reviewed samples and accounts."), /expected review/);
});

test("private conversations reject teammate access and applications do not open chat", async () => {
  let status = "ACCEPTED";
  const tx = database({ clipEngagement: { findUnique: () => ({ creatorId: "creator", campaignId: "campaign", campaign, status }) } });
  await assert.rejects(requireClipConversation(tx, "campaign", "agreement", "teammate", "TESTER"), /not available/);
  await assert.rejects(requireClipConversation(tx, "different", "agreement", "creator", "TESTER"), /not available/);
  await requireClipConversation(tx, "campaign", "agreement", "creator", "TESTER");
  await requireClipConversation(tx, "campaign", "agreement", "developer", "DEVELOPER");
  await requireClipConversation(tx, "campaign", "agreement", "admin", "ADMIN");
  status = "APPLIED";
  await assert.rejects(requireClipConversation(tx, "campaign", "agreement", "creator", "TESTER"), /unavailable/);
  status = "ACCEPTED_WITHDRAWN";
  await requireClipConversation(tx, "campaign", "agreement", "creator", "TESTER");
});

test("developer cannot accept an application after marketplace suspension", async () => {
  const tx = database({ clipEngagement: { findUnique: () => ({ creatorId: "creator", campaign, status: "APPLIED", termsAcceptedAt: new Date() }) }, user: { findUniqueOrThrow: () => creator }, clipProfile: { findUnique: () => ({ ...profile, status: "SUSPENDED" }) } });
  await assert.rejects(reviewClipApplication(tx, "developer", "agreement", true), /approved/);
});

test("tester Clippers dashboard exposes marketplace applications, invitations, work, and paging separately", async () => {
  const linkMock = mock.module("next/link", { defaultExport: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children) });
  try {
    const { ClipperDashboard } = await import("../components/clipper-dashboard");
    const now = new Date("2026-11-01T12:00:00Z");
    const html = renderToStaticMarkup(createElement(ClipperDashboard, { now, data: { enabled: true, profileStatus: "PENDING_REVIEW", reviewNote: null, paidCents: 5000, page: 1, total: 51, agreements: [
      { id: "invite", status: "INVITED", feeCents: 5000, invitationExpiresAt: "2026-11-02T12:00:00Z", dueAt: null, reviewDueAt: null, publishDueAt: null, campaign: { id: "campaign", title: "Original gaming app story", platform: "TIKTOK" } },
      { id: "application", status: "APPLIED", feeCents: 1000, invitationExpiresAt: null, dueAt: null, reviewDueAt: null, publishDueAt: null, campaign: { id: "campaign2", title: "Education creator campaign", platform: "YOUTUBE" } },
    ] } }));
    assert.match(html, /Under SeedEnv review/);
    assert.match(html, /Invitations/);
    assert.match(html, /Your campaign applications/);
    assert.match(html, /Active creator work/);
    assert.match(html, /Completed &amp; closed agreements/);
    assert.match(html, /agreement=invite/);
    assert.match(html, /agreement=application/);
    assert.match(html, /clipPage=2/);
    assert.match(html, /You receive \$50\.00/);
  } finally { linkMock.restore(); }
});

test("developer and creator workspaces expose distinct hiring, application, and funding controls", async () => {
  const actionNames = ["inviteClipper", "createClipCampaign", "removeClipTikTok", "saveClipProfile", "submitClipProfile", "setClipAvailability", "createClipUpload", "completeClipUpload", "answerClipInvitation", "applyToClip", "cancelClipCheckout", "cancelClipInvitation", "checkClipTikTok", "decideClipApplication", "decideClipDraft", "fundClip", "manuallyVerifyClip", "openClipDispute", "refundClip", "releaseClip", "renewClipInvitation", "resumeClipDispute", "sendClipDraft", "sendClipMessage", "sendClipPublication", "setClipApplications", "withdrawClip"];
  const actionsMock = mock.module("@/app/actions/clipperActions", { namedExports: Object.fromEntries(actionNames.map((name) => [name, async () => { throw new Error("Rendering must not execute a server action"); }])) });
  const navigationMock = mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh() {}, push() {} }) } });
  const linkMock = mock.module("next/link", { defaultExport: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children) });
  try {
    const { ClipperWorkspace } = await import("../components/clipper-workspace");
    const { ClipperMarketplace } = await import("../components/clipper-marketplace");
    const { ClipperRoom } = await import("../components/clipper-room");
    const marketplace = (developer: boolean) => createElement(ClipperMarketplace, { developer, query: "", genre: "", platform: "", page: 1, total: 1, campaigns: [{ ...campaign, title: "Original mobile app story" }], creators: [{ ...input, userId: "creator", username: "Fixture creator", reputation: 200, socialName: null, completedCollaborations: 0, existingCampaignIds: [] }] });
    const common = { emailVerified: true, campaigns: [], agreements: [], campaignPage: 1, campaignTotal: 0, workPage: 1, workTotal: 0, pageQuery: "", socialName: null, tikTokEnabled: false };
    const developerHtml = renderToStaticMarkup(createElement(ClipperWorkspace, { ...common, profile: null, developer: true, marketplace: marketplace(true) }));
    assert.match(developerHtml, /Invite to your campaign/);
    assert.match(developerHtml, /Create campaign/);
    assert.match(developerHtml, /\$59\.53/);
    assert.doesNotMatch(developerHtml, /Submit.*review/);
    const creatorHtml = renderToStaticMarkup(createElement(ClipperWorkspace, { ...common, profile: { ...input, status: "APPROVED", revision: 3, reviewNote: null, available: false }, developer: false, marketplace: marketplace(false) }));
    assert.match(creatorHtml, /Your creator application/);
    assert.match(creatorHtml, /Resume approved listing/);
    assert.doesNotMatch(creatorHtml, /Invite to your campaign/);
    assert.doesNotMatch(creatorHtml, /Create campaign/);
    const item: import("../components/clipper-room").ClipAgreementView = {
      id: "agreement", creatorId: "creator", status: "INVITED", note: "", feeCents: 5000, chargeCents: 5953, revisionCount: 0, reviewNote: null,
      dueAt: null, reviewDueAt: null, publishDueAt: null, fundedAt: null, paidAt: null, licenseEndsAt: null, draftId: null, approvedDraftId: null, proofId: null,
      publicationUrl: null, publicationCode: "FIXTURE", verificationMethod: null, disputeReason: null, moderationNote: null, termsAcceptedAt: null,
      invitationNote: "Please share your original mobile app story.", invitationExpiresAt: "2099-01-01T00:00:00Z", eligibilityReason: null, fundingBlockReason: null, profileFromApplication: false,
      creator: { username: "Fixture creator", xpPoints: 200, clipProfile: input, clipSocialAccounts: [] }, assets: [],
    };
    const room = { campaign: { ...campaign, title: "Original mobile app story", appUrl: "https://example.invalid", brief: "A fixture creative brief for original app stories.", revisionLimit: 2, deliveryDays: 7, liveDays: 30, developer: { username: "Fixture developer" } }, messages: [], briefAssets: [], members: [], roomAccess: false, conversationId: null, applicationReason: null, admin: false, workspaceReady: true, storageEnabled: false, tikTokEnabled: false, olderCursor: null };
    const invitationHtml = renderToStaticMarkup(createElement(ClipperRoom, { ...room, agreements: [item], developer: false, viewerId: "creator" }));
    assert.match(invitationHtml, /Accept invitation/);
    assert.doesNotMatch(invitationHtml, /Upload &amp; submit new video version/);
    const fundingHtml = renderToStaticMarkup(createElement(ClipperRoom, { ...room, agreements: [{ ...item, status: "FUNDING", termsAcceptedAt: "2026-11-01T00:00:00Z" }], developer: true, viewerId: "developer" }));
    assert.match(fundingHtml, /Cancel unpaid checkout/);
    assert.match(fundingHtml, /Retry \/ return to funding checkout/);
    assert.doesNotMatch(fundingHtml, /Paid before filming/);
  } finally { actionsMock.restore(); navigationMock.restore(); linkMock.restore(); }
});
