import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

test("public Launch Circle excludes hidden/member-only content and personal account fields", async () => {
  let query: { where?: unknown; select?: { author?: { select?: Record<string, boolean> }; comments?: { where?: unknown } } } = {};
  const modules = [
    mock.module("../lib/auth-options.ts", { namedExports: { authOptions: {} } }),
    mock.module("../lib/member.ts", { namedExports: { requireMember: async () => { throw new Error("No member."); } } }),
    mock.module("next-auth", { namedExports: { getServerSession: async () => null } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: { communityPost: { findMany: async (input: typeof query) => { query = input; return [{ id: "public-post", body: "A public launch update", createdAt: new Date("2026-10-05"), publicVisible: true, author: { id: "developer", username: "Studio", role: "DEVELOPER", xpPoints: 0 }, comments: [], _count: { comments: 0 } }]; } } } } }),
  ];
  try {
    const { publicLaunchCircle, optionalCircleMember } = await import(`../lib/public-launch-circle.ts?privacy=${randomUUID()}`);
    const feed = await publicLaunchCircle();
    assert.equal(feed.unavailable, false);
    assert.deepEqual(query.where, { hidden: false, publicVisible: true });
    assert.deepEqual(query.select?.comments?.where, { hidden: false });
    assert.deepEqual(Object.keys(query.select?.author?.select || {}).sort(), ["id", "role", "username", "xpPoints"]);
    assert.equal(feed.posts[0].createdAt, "2026-10-05T00:00:00.000Z");
    assert.equal(await optionalCircleMember(), null);
  } finally { for (const item of modules.reverse()) item.restore(); }
});

test("only authenticated members write; public updates/comments invalidate the landing feed", async () => {
  let signedIn = false;
  let role = "DEVELOPER";
  const writes: Array<Record<string, unknown>> = [];
  const refreshed: string[] = [];
  const tx = {
    communityPost: { count: async () => 0, create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); }, findUnique: async () => ({ id: "post-test", hidden: false, publicVisible: true }) },
    communityComment: { count: async () => 0, create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); } },
  };
  const modules = [
    mock.module("../lib/member.ts", { namedExports: { requireMember: async (required?: string) => { if (!signedIn || required && role !== required) throw new Error("Sign in with the required workspace."); return { id: "real-member", role }; } } }),
    mock.module("../lib/quest-ledger.ts", { namedExports: { serializable: async (work: (db: typeof tx) => Promise<unknown>) => work(tx) } }),
    mock.module("next/cache", { namedExports: { revalidatePath: (path: string) => refreshed.push(path) } }),
  ];
  try {
    const { publishPost, publishComment } = await import(`../app/actions/communityActions.ts?access=${randomUUID()}`);
    await assert.rejects(publishPost("Public developer progress update", true), /Sign in/);
    await assert.rejects(publishComment("post-test", "A useful tester comment"), /Sign in/);
    assert.equal(writes.length, 0);
    signedIn = true;
    await publishPost("Public developer progress update", true);
    assert.equal(writes[0].publicVisible, true);
    await publishPost("Older client without an explicit public choice");
    assert.equal(writes[1].publicVisible, false);
    role = "TESTER";
    await assert.rejects(publishPost("Tester must not publish developer updates", true), /workspace/);
    await publishComment("post-test", "A useful tester comment");
    assert.equal(writes[2].authorId, "real-member");
    assert.equal(writes[2].postId, "post-test");
    assert.ok(refreshed.includes("/"));
    assert.ok(refreshed.includes("/community/[id]"));
  } finally { for (const item of modules.reverse()) item.restore(); }
});