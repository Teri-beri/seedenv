import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Prisma } from "@prisma/client";

function assertSerializableProps(node: unknown) {
  if (Array.isArray(node)) { node.forEach(assertSerializableProps); return; }
  if (!isValidElement<Record<string, unknown>>(node)) return;
  for (const [key, value] of Object.entries(node.props)) {
    assert.notEqual(typeof value, "function", `Server-rendered ${key} must not pass a closure to a client component.`);
    if (key === "children") assertSerializableProps(value);
  }
}

test("message pages preserve request gates, private history membership and serializable client props", async () => {
  const a = { id: "developer", username: "Builder", role: "DEVELOPER", avatarUrl: null, developerWorkspaceEnabled: true, testerWorkspaceEnabled: false };
  const b = { ...a, id: "tester", username: "Tester", role: "TESTER", developerWorkspaceEnabled: false, testerWorkspaceEnabled: true };
  let status = "REQUESTED";
  const reads: Prisma.DirectConversationFindFirstArgs[] = [];
  const modules = [
    mock.module("next/navigation", { namedExports: { notFound: () => { throw new Error("NOT_FOUND"); } } }),
    mock.module("next/link", { defaultExport: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as string) }),
    mock.module("../components/social-controls.tsx", { namedExports: {
      BlockMemberButton: () => createElement("button", null, "Block member"),
      RequestReviewButtons: () => createElement("div", null, "Accept request / Decline"),
      MessageComposer: () => createElement("textarea", { "aria-label": "Composer" }),
    } }),
    mock.module("../components/message-report.tsx", { namedExports: { MessageReport: () => createElement("button", null, "Report") } }),
    mock.module("../components/message-refresh.tsx", { namedExports: { MessageRefresh: () => createElement("button", null, "Refresh inbox") } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: {
      directConversation: {
        findMany: async () => [],
        count: async () => 1,
        findFirst: async (query: Prisma.DirectConversationFindFirstArgs) => {
          reads.push(query);
          if (JSON.stringify(query.where).includes("outsider")) return null;
          return { id: "thread", participantAId: a.id, participantBId: b.id, requesterId: b.id, status, participantA: a, participantB: b };
        },
      },
      userBlock: { findFirst: async () => null },
      directMessage: { findMany: async () => [{ id: "m1", senderId: b.id, body: "Private request body", createdAt: new Date("2026-10-10") }] },
    } } }),
  ];
  try {
    const { MessageInbox } = await import("../components/message-inbox");
    const requested = await MessageInbox({ memberId: a.id, params: { thread: "thread" } });
    assertSerializableProps(requested);
    const recipient = renderToStaticMarkup(requested);
    assert.match(recipient, /Accept request/);
    assert.doesNotMatch(recipient, /aria-label="Composer"/);
    const sender = renderToStaticMarkup(await MessageInbox({ memberId: b.id, params: { thread: "thread" } }));
    assert.match(sender, /cannot send another message yet/);
    await assert.rejects(MessageInbox({ memberId: "outsider", params: { thread: "thread" } }), /NOT_FOUND/);
    assert.deepEqual(reads[0].where, { id: "thread", OR: [{ participantAId: a.id }, { participantBId: a.id }] });
    status = "ACCEPTED";
    const accepted = await MessageInbox({ memberId: a.id, params: { thread: "thread" } });
    assertSerializableProps(accepted);
    assert.match(renderToStaticMarkup(accepted), /aria-label="Composer"/);
    status = "DECLINED";
    assert.doesNotMatch(renderToStaticMarkup(await MessageInbox({ memberId: a.id, params: { thread: "thread" } })), /aria-label="Composer"/);
  } finally { for (const item of modules.reverse()) item.restore(); }
});
