import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma, type User } from "@prisma/client";
import { conversationPair, isDeveloper, messageBody } from "../lib/social-connections";

test("canonical conversation pairs and message validation", () => {
  assert.deepEqual(conversationPair("z", "a"), conversationPair("a", "z"));
  assert.throws(() => conversationPair("a", "a"), /yourself/);
  assert.equal(messageBody.parse(" hello "), "hello");
  assert.equal(messageBody.safeParse(" ").success, false);
  assert.equal(messageBody.safeParse("a".repeat(2001)).success, false);
  assert.equal(isDeveloper({ role: "TESTER", developerWorkspaceEnabled: false }), false);
  assert.equal(isDeveloper({ role: "TESTER", developerWorkspaceEnabled: true }), true);
});

test("social actions reject malformed input and surface auth failures without writes", async () => {
  const errors: unknown[][] = [];
  const modules = [
    mock.module("../lib/member.ts", { namedExports: { requireMember: async () => { throw new Error("No session"); } } }),
    mock.module("next/cache", { namedExports: { revalidatePath: () => {} } }),
  ];
  const logger = mock.method(console, "error", (...args: unknown[]) => errors.push(args));
  try {
    const { sendMessage, followMember, saveMessageSettings } = await import(`../app/actions/socialActions.ts?validation=${randomUUID()}`);
    assert.equal((await sendMessage("user", " ")).ok, false);
    assert.equal((await followMember("../admin", true, true)).ok, false);
    const outcome = await saveMessageSettings(true);
    assert.equal(outcome.ok, false);
    assert.match(outcome.message, /signed in/);
    assert.equal(errors.length, 1);
  } finally {
    logger.mock.restore();
    for (const item of modules.reverse()) item.restore();
  }
});

test("requests, follows, blocks, email fanout and history permissions (sandbox PostgreSQL)", {
  skip: process.env.RUN_SOCIAL_DB_TESTS !== "1",
}, async () => {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.ok(url.hostname.startsWith("dpg-db4khrcs728c73flrip0-a") && url.pathname === "/seedenv_staging_db", "Only the isolated sandbox is allowed.");
  const db = new PrismaClient();
  const marker = `social-${randomUUID()}`;
  const users: User[] = [];
  const campaignIds: string[] = [];
  let member: User;
  let emailFailure = false;
  const deliveries: Array<{ subject: string; text: string; key: string }> = [];
  const sendEmail = async (input: { subject: string; text: string }, key: string) => {
    if (emailFailure) throw new Error("Mock provider outage");
    deliveries.push({ ...input, key });
  };
  const modules = [
    mock.module("../lib/prisma.ts", { namedExports: { prisma: new Proxy(db, {
      get(target, key) {
        if (key === "followerEmail") return new Proxy(target.followerEmail, {
          get(delegate, property) {
            if (property === "findMany") return (args: Prisma.FollowerEmailFindManyArgs) => delegate.findMany({ ...args, where: { ...args.where, recipientId: { in: users.map(user => user.id) } } });
            return Reflect.get(delegate, property);
          },
        });
        return Reflect.get(target, key);
      },
    }) } }),
    mock.module("../lib/member.ts", { namedExports: { requireMember: async () => member } }),
    mock.module("next/cache", { namedExports: { revalidatePath: () => {} } }),
    mock.module("next/navigation", { namedExports: { notFound: () => { throw new Error("NOT_FOUND"); } } }),
  ];
  try {
    const { serializable } = await import("../lib/quest-ledger");
    const { sendDirectMessage, reviewMessageRequest, setFollowing, setMemberBlock, queueFollowerEmails } = await import("../lib/social-connections");
    const { deliverFollowerEmails } = await import("../lib/follower-emails");
    const { sendMessage, reportMessage, saveMessageSettings } = await import(`../app/actions/socialActions.ts?db=${marker}`);
    const makeUser = async (role: "DEVELOPER" | "TESTER", verified = true) => {
      const user = await db.user.create({ data: { email: `${marker}-${users.length}@example.invalid`, username: `Social_${users.length}_${marker.slice(-8).replaceAll("-", "")}`, role, developerWorkspaceEnabled: role === "DEVELOPER", testerWorkspaceEnabled: role === "TESTER", emailVerified: verified ? new Date() : null } });
      users.push(user);
      return user;
    };
    const developer = await makeUser("DEVELOPER");
    const tester = await makeUser("TESTER");
    const outsider = await makeUser("TESTER");
    const unverified = await makeUser("TESTER", false);
    member = tester;
    const request = await sendMessage(developer.id, "Hello, I have a question about your cohort.");
    assert.ok(request.ok && request.conversationId);
    const threadId = request.conversationId;
    assert.equal(await db.directMessage.count({ where: { conversationId: threadId } }), 1);
    assert.equal((await sendMessage(developer.id, "Another message before acceptance")).ok, false);
    await assert.rejects(serializable(tx => reviewMessageRequest(tx, tester.id, threadId, "ACCEPTED")), /Only the recipient/);
    await assert.rejects(serializable(tx => reviewMessageRequest(tx, outsider.id, threadId, "ACCEPTED")), /Only the recipient/);
    await serializable(tx => reviewMessageRequest(tx, developer.id, threadId, "ACCEPTED"));
    member = developer;
    assert.equal((await saveMessageSettings(false)).ok, true);
    assert.equal((await sendMessage(tester.id, "Thank you, here are the details.")).ok, true);
    await assert.rejects(serializable(tx => sendDirectMessage(tx, outsider.id, developer.id, "New contact")), /not accepting/);
    await db.user.update({ where: { id: developer.id }, data: { messageRequestsEnabled: true } });
    const concurrent = await Promise.allSettled([
      serializable(tx => sendDirectMessage(tx, outsider.id, developer.id, "Concurrent request A")),
      serializable(tx => sendDirectMessage(tx, outsider.id, developer.id, "Concurrent request B")),
    ]);
    assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
    const outsiderThread = await db.directConversation.findFirstOrThrow({ where: { requesterId: outsider.id } });
    assert.equal(await db.directMessage.count({ where: { conversationId: outsiderThread.id } }), 1);
    await serializable(tx => reviewMessageRequest(tx, developer.id, outsiderThread.id, "DECLINED"));
    await assert.rejects(serializable(tx => sendDirectMessage(tx, outsider.id, developer.id, "Retry declined")), /declined/);
    member = outsider;
    assert.equal((await reportMessage(threadId, "Not my private conversation")).ok, false);
    member = tester;
    assert.equal((await reportMessage(threadId, "Please review this conversation")).ok, true);
    assert.ok(await db.supportTicket.findFirst({ where: { userId: tester.id, subject: "Private message report" } }));

    await serializable(tx => setFollowing(tx, tester.id, developer.id, true, true));
    await serializable(tx => setFollowing(tx, unverified.id, developer.id, true, true));
    await serializable(tx => setFollowing(tx, outsider.id, tester.id, true, true));
    const testerFollow = await db.userFollow.findUniqueOrThrow({ where: { followerId_followingId: { followerId: outsider.id, followingId: tester.id } } });
    assert.equal(testerFollow.emailUpdates, false);
    await assert.rejects(serializable(tx => setFollowing(tx, tester.id, tester.id, true, true)), /yourself/);
    const post = await db.communityPost.create({ data: { authorId: developer.id, body: "Private original update, not included in the email", publicVisible: false } });
    await serializable(tx => queueFollowerEmails(tx, developer.id, `post:${post.id}`, `/community/${post.id}`, "A developer update"));
    await serializable(tx => queueFollowerEmails(tx, developer.id, `post:${post.id}`, `/community/${post.id}`, "Duplicate event"));
    assert.equal(await db.followerEmail.count({ where: { eventKey: `post:${post.id}` } }), 1);
    const delivery = await deliverFollowerEmails(30, sendEmail);
    assert.equal(delivery.sent, 1);
    assert.equal(deliveries.length, 1);
    assert.ok(!deliveries[0].text.includes(post.body));
    assert.ok(deliveries[0].text.includes("/account?tab=connections"));
    assert.equal((await deliverFollowerEmails(30, sendEmail)).sent, 0);
    assert.ok(deliveries[0].key.startsWith("follower-email-"));
    const nextPost = await db.communityPost.create({ data: { authorId: developer.id, body: "Another update" } });
    await serializable(tx => queueFollowerEmails(tx, developer.id, `post:${nextPost.id}`, `/community/${nextPost.id}`, "Second update"));
    await serializable(tx => setFollowing(tx, tester.id, developer.id, true, false));
    assert.ok((await db.followerEmail.findFirstOrThrow({ where: { eventKey: `post:${nextPost.id}` } })).cancelledAt);
    await serializable(tx => setFollowing(tx, tester.id, developer.id, true, true));
    const outagePost = await db.communityPost.create({ data: { authorId: developer.id, body: "Provider outage test" } });
    await serializable(tx => queueFollowerEmails(tx, developer.id, `post:${outagePost.id}`, `/community/${outagePost.id}`, "Retry update"));
    emailFailure = true;
    const log = mock.method(console, "error", () => {});
    try { assert.equal((await deliverFollowerEmails(30, sendEmail)).failed, 1); } finally { log.mock.restore(); }
    const failed = await db.followerEmail.findFirstOrThrow({ where: { eventKey: `post:${outagePost.id}` } });
    assert.equal(failed.sentAt, null);
    assert.match(failed.lastError || "", /outage/);
    assert.equal(failed.attempts, 1);
    emailFailure = false;
    await db.followerEmail.update({ where: { id: failed.id }, data: { nextAttemptAt: new Date(0) } });
    assert.equal((await deliverFollowerEmails(30, sendEmail)).sent, 1);

    const campaign = await db.appCampaign.create({ data: { developerId: developer.id, title: "Social email lifecycle", platform: "WEB_STAGING", appUrl: "https://example.invalid", targetVibe: "Test", description: "Sandbox only", totalBudgetUsd: 0, bountyPerTaskUsd: 0, platformFeeUsd: 0, totalSlots: 1, status: "ACTIVE", expiresAt: new Date(Date.now() + 86400000) } });
    campaignIds.push(campaign.id);
    await serializable(tx => queueFollowerEmails(tx, developer.id, `cohort:${campaign.id}`, `/cohorts/${campaign.id}`, "New cohort"));
    await serializable(tx => setMemberBlock(tx, tester.id, developer.id, true));
    assert.equal(await db.userFollow.count({ where: { followerId: tester.id, followingId: developer.id } }), 0);
    assert.ok((await db.followerEmail.findFirstOrThrow({ where: { eventKey: `cohort:${campaign.id}` } })).cancelledAt);
    await assert.rejects(serializable(tx => sendDirectMessage(tx, developer.id, tester.id, "Blocked message")), /unavailable/);
    await assert.rejects(serializable(tx => setFollowing(tx, developer.id, tester.id, true, true)), /unavailable/);
    await serializable(tx => setMemberBlock(tx, tester.id, developer.id, false));
    await assert.rejects(serializable(tx => sendDirectMessage(tx, developer.id, tester.id, "After unblock")), /declined/);
    assert.equal(await db.directMessage.count({ where: { conversationId: threadId } }), 2, "History stays intact.");
    await db.directConversation.update({ where: { id: threadId }, data: { status: "ACCEPTED" } });
    await db.directMessage.createMany({ data: Array.from({ length: 59 }, () => ({ id: randomUUID(), conversationId: threadId, senderId: tester.id, body: "Hourly cap fixture" })) });
    await assert.rejects(serializable(tx => sendDirectMessage(tx, tester.id, developer.id, "Message 61")), /hourly/);
    for (let i = 0; i < 9; i++) {
      const recipient = await makeUser("TESTER");
      await db.directConversation.create({ data: { ...conversationPair(outsider.id, recipient.id), requesterId: outsider.id } });
    }
    await assert.rejects(serializable(tx => sendDirectMessage(tx, outsider.id, unverified.id, "Request 11")), /ten new/);
  } finally {
    if (campaignIds.length) await db.appCampaign.deleteMany({ where: { id: { in: campaignIds } } });
    if (users.length) await db.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    for (const item of modules.reverse()) item.restore();
    await db.$disconnect();
  }
});
