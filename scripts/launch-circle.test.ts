import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const authorFixture = { id: "developer", username: "Studio", role: "DEVELOPER", xpPoints: 0 };
const postRow = {
  id: "public-post", body: "A public launch update", createdAt: new Date("2026-10-05"), publicVisible: true,
  tag: "NEED_VALIDATION", buildLabel: "1.0.4", campaign: { id: "cohort-1", title: "Goddesses", platform: "TESTFLIGHT", status: "ACTIVE" },
  author: authorFixture, comments: [], helpfulVotes: [], _count: { comments: 0, helpfulVotes: 3 },
};

test("public Launch Circle excludes hidden/member-only content and personal account fields", async () => {
  let query: { where?: unknown; include?: { author?: { select?: Record<string, boolean> }; comments?: { where?: unknown }; helpfulVotes?: { where?: { userId?: string } } } } = {};
  const modules = [
    mock.module("../lib/auth-options.ts", { namedExports: { authOptions: {} } }),
    mock.module("../lib/member.ts", { namedExports: { requireMember: async () => { throw new Error("No member."); } } }),
    mock.module("next-auth", { namedExports: { getServerSession: async () => null } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: { communityPost: { findMany: async (input: typeof query) => { query = input; return [postRow]; } } } } }),
  ];
  try {
    const { publicLaunchCircle, optionalCircleMember } = await import(`../lib/public-launch-circle.ts?privacy=${randomUUID()}`);
    const feed = await publicLaunchCircle();
    assert.equal(feed.unavailable, false);
    assert.deepEqual(query.where, { hidden: false, publicVisible: true });
    assert.deepEqual(query.include?.comments?.where, { hidden: false });
    assert.deepEqual(Object.keys(query.include?.author?.select || {}).sort(), ["id", "role", "username", "xpPoints"]);
    // Signed-out readers never match a viewer, so no personal helpful mark leaks into the public feed.
    assert.equal(query.include?.helpfulVotes?.where?.userId, "");
    assert.equal(feed.posts[0].createdAt, "2026-10-05T00:00:00.000Z");
    assert.equal(feed.posts[0].tag, "NEED_VALIDATION");
    assert.equal(feed.posts[0].helpfulCount, 3);
    assert.equal(feed.posts[0].viewerFoundHelpful, false);
    assert.equal(await optionalCircleMember(), null);
  } finally { for (const item of modules.reverse()) item.restore(); }
});

test("only authenticated members write; structured tags and cohort ownership are enforced", async () => {
  let signedIn = false;
  let role = "DEVELOPER";
  let ownsCampaign = true;
  const writes: Array<Record<string, unknown>> = [];
  const refreshed: string[] = [];
  const tx = {
    appCampaign: { findFirst: async () => (ownsCampaign ? { id: "cohort-1" } : null) },
    communityPost: { count: async () => 0, create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return { id: "post-test" }; }, findUnique: async () => ({ id: "post-test", hidden: false, publicVisible: true }) },
    communityComment: { count: async () => 0, create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); } },
    communityPostHelpful: { findUnique: async () => null, create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); }, delete: async () => {} },
  };
  const modules = [
    mock.module("../lib/social-connections.ts", { namedExports: { queueFollowerEmails: async () => {} } }),
    mock.module("../lib/member.ts", { namedExports: { requireMember: async (required?: string) => { if (!signedIn || required && role !== required) throw new Error("Sign in with the required workspace."); return { id: "real-member", role, username: "Studio" }; } } }),
    mock.module("../lib/quest-ledger.ts", { namedExports: { serializable: async (work: (db: typeof tx) => Promise<unknown>) => work(tx) } }),
    mock.module("next/cache", { namedExports: { revalidatePath: (path: string) => refreshed.push(path) } }),
  ];
  try {
    const { publishPost, publishComment, toggleHelpful } = await import(`../app/actions/communityActions.ts?access=${randomUUID()}`);
    await assert.rejects(publishPost("Public developer progress update", true), /Sign in/);
    await assert.rejects(publishComment("post-test", "A useful tester comment"), /Sign in/);
    assert.equal(writes.length, 0);
    signedIn = true;

    await publishPost("Public developer progress update", true, { tag: "NEED_VALIDATION", campaignId: "cohort-1", buildLabel: "1.0.4" });
    assert.equal(writes[0].publicVisible, true);
    assert.equal(writes[0].tag, "NEED_VALIDATION");
    assert.equal(writes[0].campaignId, "cohort-1");
    assert.equal(writes[0].buildLabel, "1.0.4");

    await publishPost("Older client without an explicit public choice");
    assert.equal(writes[1].publicVisible, false);
    assert.equal(writes[1].tag, "CHANGELOG");
    assert.equal(writes[1].campaignId, null);
    // A build label without an attached cohort would render a badge for nothing.
    assert.equal(writes[1].buildLabel, null);

    ownsCampaign = false;
    await assert.rejects(publishPost("Attaching someone else's cohort", true, { campaignId: "cohort-other" }), /cohort you own/);
    ownsCampaign = true;

    role = "TESTER";
    await assert.rejects(publishPost("Tester must not publish developer updates", true), /workspace/);
    await publishComment("post-test", "A useful tester comment", { tag: "DEVICE_CONFIRMED", deviceLabel: "iPhone 15 Pro · iOS 18.2" });
    const comment = writes[writes.length - 1];
    assert.equal(comment.authorId, "real-member");
    assert.equal(comment.postId, "post-test");
    assert.equal(comment.tag, "DEVICE_CONFIRMED");
    assert.equal(comment.deviceLabel, "iPhone 15 Pro · iOS 18.2");

    assert.equal(await toggleHelpful("post-test"), "Marked as helpful.");
    assert.ok(refreshed.includes("/"));
    assert.ok(refreshed.includes("/launch-circle/[id]"));
  } finally { for (const item of modules.reverse()) item.restore(); }
});

test("the composer is role gated: validators get a read-only notice, developers get the publish card", async () => {
  const modules = [
    mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh: () => {} }) } }),
    mock.module("next-auth/react", { namedExports: { useSession: () => ({ update: async () => {} }) } }),
    mock.module("../app/actions/communityActions.ts", { namedExports: { publishPost: async () => "", publishComment: async () => "", reportCommunityContent: async () => "", hideCommunityContent: async () => "", toggleHelpful: async () => "" } }),
    mock.module("../app/actions/accountActions.ts", { namedExports: { activateAccountWorkspace: async () => ({ ok: true }) } }),
  ];
  try {
    const { FeedComposer } = await import(`../components/launch-circle/FeedComposer.tsx?gate=${randomUUID()}`);
    const validator = renderToStaticMarkup(createElement(FeedComposer, { canPost: false, username: "qa_halden" }));
    assert.ok(validator.includes("Validator Mode"));
    assert.ok(validator.includes("Posting reserved for verified developers"));
    assert.ok(!validator.includes("<textarea"));
    // The old amber "Posting as" control must not come back.
    assert.ok(!validator.includes("amber-500"));
    assert.ok(!validator.includes("Posting as"));

    const switcher = renderToStaticMarkup(createElement(FeedComposer, { canPost: false, username: "qa_halden", canSwitchToDeveloper: true }));
    assert.ok(switcher.includes("Switch to developer workspace"));

    const developer = renderToStaticMarkup(createElement(FeedComposer, { canPost: true, username: "Studio", apps: [{ id: "cohort-1", title: "Goddesses", platform: "TESTFLIGHT" }] }));
    assert.ok(developer.includes("<textarea"));
    assert.ok(developer.includes("0 / 1600"));
    assert.ok(developer.includes("bg-emerald-500"));
    assert.ok(!developer.includes("amber-500"));
    assert.ok(!developer.includes('type="checkbox"'));
    assert.ok(developer.includes("Cohort Testers Only"));
    assert.ok(developer.includes("[Changelog]") && developer.includes("[Need Validation]") && developer.includes("[Bug Fix]"));
    assert.ok(developer.includes("Goddesses"));
  } finally { for (const item of modules.reverse()) item.restore(); }
});

test("the feed labels its sample updates and renders real posts with app, tag and device metadata", async () => {
  const modules = [
    mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh: () => {} }) } }),
    mock.module("next/link", { defaultExport: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children) }),
    mock.module("../app/actions/communityActions.ts", { namedExports: { publishComment: async () => "", reportCommunityContent: async () => "", hideCommunityContent: async () => "", toggleHelpful: async () => "" } }),
  ];
  try {
    const { FeedList, SAMPLE_POSTS } = await import(`../components/launch-circle/FeedList.tsx?feed=${randomUUID()}`);
    const empty = renderToStaticMarkup(createElement(FeedList, { posts: [], interactive: false }));
    assert.equal(SAMPLE_POSTS.length, 3);
    assert.ok(empty.includes("Sample updates"));
    assert.ok(empty.includes("Not real activity."));
    assert.ok(empty.includes("Pushed Build 1.0.4 to TestFlight"));
    assert.ok(empty.includes("Launch Circle v1.2 is live"));
    assert.ok(empty.includes("Goddesses v1.0.4"));
    assert.ok(empty.includes("iPhone 15 Pro · iOS 18.2"));
    // Samples never offer write affordances that would fail against a non-existent record.
    assert.ok(!empty.includes("Add validator feedback"));

    const post = { id: "post-1", body: "Shipped `1.0.5`", createdAt: "2026-10-05T00:00:00.000Z", publicVisible: true, tag: "BUG_FIX", buildLabel: "1.0.5", campaign: { id: "cohort-1", title: "Goddesses", platform: "TESTFLIGHT" }, author: authorFixture, helpfulCount: 2, viewerFoundHelpful: false, _count: { comments: 1 }, comments: [{ id: "c1", body: "Confirmed", author: { id: "t1", username: "qa_halden", role: "TESTER", xpPoints: 0 }, tag: "DEVICE_CONFIRMED", deviceLabel: "iPad mini 6 · iPadOS 18.1" }] };
    const live = renderToStaticMarkup(createElement(FeedList, { posts: [post], userId: "viewer", showSamples: false }));
    assert.ok(!live.includes("Sample updates"));
    assert.ok(live.includes("Goddesses v1.0.5"));
    assert.ok(live.includes("[Bug Fix]"));
    assert.ok(live.includes("@studio"));
    assert.ok(live.includes("Device Confirmed"));
    assert.ok(live.includes("iPad mini 6 · iPadOS 18.1"));
    assert.ok(live.includes("/cohorts/cohort-1"));
    assert.ok(live.includes("Helpful 2"));
    assert.ok(live.includes("Add validator feedback"));
    // Markdown is rendered rather than printed raw.
    assert.ok(live.includes("<code"));
  } finally { for (const item of modules.reverse()) item.restore(); }
});

test("the Launch Circle lives at /launch-circle and legacy /community links redirect there", async () => {
  const modules = [
    mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh: () => {} }), permanentRedirect: (href: string) => { throw new Error(`Redirect:${href}`); } } }),
    mock.module("next/link", { defaultExport: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children) }),
    mock.module("next-auth/react", { namedExports: { useSession: () => ({ update: async () => {} }) } }),
    mock.module("../app/actions/communityActions.ts", { namedExports: { publishPost: async () => "", publishComment: async () => "", reportCommunityContent: async () => "", dismissCommunityReport: async () => "", hideCommunityContent: async () => "", toggleHelpful: async () => "" } }),
    mock.module("../lib/public-launch-circle.ts", { namedExports: { optionalCircleMember: async () => null, circlePostInclude: () => ({}), toCirclePost: (post: unknown) => post } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: { communityPost: { findMany: async () => [] } } } }),
  ];
  try {
    const { default: LaunchCirclePage } = await import(`../app/launch-circle/page.tsx?route=${randomUUID()}`);
    const markup = renderToStaticMarkup(await LaunchCirclePage({ searchParams: Promise.resolve({}) }));
    assert.ok(markup.includes("Launch Circle"));
    assert.ok(markup.includes("Live developer changelogs &amp; validator feedback"));
    assert.ok(markup.includes("All Updates") && markup.includes("Active Drops"));
    assert.ok(markup.includes("Search updates or apps..."));
    // Feed navigation stays on the canonical route instead of bouncing through the legacy path.
    assert.ok(markup.includes('"/launch-circle'));
    assert.ok(!markup.includes('"/community'));

    const { default: LegacyFeed } = await import(`../app/community/page.tsx?legacy=${randomUUID()}`);
    await assert.rejects(LegacyFeed({ searchParams: Promise.resolve({ show: "drops", q: "cart" }) }), /Redirect:\/launch-circle\?show=drops&q=cart/);
    const { default: LegacyThread } = await import(`../app/community/[id]/page.tsx?legacy=${randomUUID()}`);
    await assert.rejects(LegacyThread({ params: Promise.resolve({ id: "post 1" }), searchParams: Promise.resolve({ page: "2" }) }), /Redirect:\/launch-circle\/post%201\?page=2/);
  } finally { for (const item of modules.reverse()) item.restore(); }
});
