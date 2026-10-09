import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { encode, type JWT } from "next-auth/jwt";
import { NextRequest } from "next/server";

test("encrypted sessions are rejected after revocation, including at the route proxy", async () => {
  let account: { sessionVersion: number; role: "TESTER" | "DEVELOPER" } | null = { sessionVersion: 0, role: "TESTER" };
  let failDatabase = false;
  let sessionCookie = "";
  const previousSecret = process.env.NEXTAUTH_SECRET;
  const secret = "isolated-session-test-secret-not-a-production-credential";
  process.env.NEXTAUTH_SECRET = secret;
  const database = mock.module("../lib/prisma.ts", {
    namedExports: { prisma: { user: { findUnique: async () => {
      if (failDatabase) throw new Error("Database unavailable");
      return account;
    } } } },
  });
  const requestScope = mock.module("next/headers", {
    namedExports: {
      cookies: async () => ({ getAll: () => [{ name: "next-auth.session-token", value: sessionCookie }] }),
      headers: async () => new Headers(),
    },
  });
  try {
    const { decodeSessionToken, validateSessionToken } = await import("../lib/session-security");
    const { proxy } = await import("../proxy");
    const jwt: JWT = { id: "member-1", role: "TESTER", sessionVersion: 0 };
    const encrypted = await encode({ token: jwt, secret });
    assert.equal((await decodeSessionToken({ token: encrypted, secret }))?.id, "member-1");
    const request = () => new NextRequest("http://localhost/account", {
      headers: { cookie: `next-auth.session-token=${encrypted}` },
    });
    assert.equal((await proxy(request())).headers.get("x-middleware-next"), "1");
    account.role = "DEVELOPER";
    assert.equal((await validateSessionToken(jwt))?.role, "DEVELOPER");
    account.sessionVersion = 1;
    assert.equal(await decodeSessionToken({ token: encrypted, secret }), null);
    assert.equal((await proxy(request())).headers.get("location"), "http://localhost/auth/signin?callbackUrl=%2Faccount");
    assert.equal(await validateSessionToken({ id: "member-1", role: "TESTER" }), null);
    assert.equal(await validateSessionToken({ ...jwt, sessionVersion: -1 }), null);
    assert.equal(await validateSessionToken({ ...jwt, sessionVersion: 0.5 }), null);
    account = null;
    assert.equal(await validateSessionToken(jwt), null);
    failDatabase = true;
    await assert.rejects(validateSessionToken(jwt), /Database unavailable/);
    assert.equal((await proxy(request())).headers.get("location"), "http://localhost/auth/signin?callbackUrl=%2Faccount");
    failDatabase = false;
    account = { sessionVersion: 3, role: "TESTER" };
    const { authOptions } = await import("../lib/auth-options");
    const callback = authOptions.callbacks?.jwt;
    assert.ok(callback);
    const user = { id: "member-1", role: "TESTER" as const, sessionVersion: 3 };
    const issued = await callback({ token: { ...jwt }, user, account: null, trigger: "signIn" });
    assert.equal(issued.sessionVersion, 3);
    const { default: NextAuth } = await import("next-auth");
    const handler = NextAuth(authOptions);
    const issuedCookie = await encode({ token: issued, secret });
    sessionCookie = issuedCookie;
    const sessionRequest = () => new NextRequest("http://localhost/api/auth/session", {
      headers: { cookie: `next-auth.session-token=${issuedCookie}` },
    });
    const context = { params: Promise.resolve({ nextauth: ["session"] }) };
    const liveSession = await handler(sessionRequest(), context);
    assert.equal(liveSession.status, 200);
    assert.equal((await liveSession.json()).user.id, "member-1");
    account.sessionVersion = 4;
    const revokedSession = await handler(sessionRequest(), context);
    assert.equal(revokedSession.status, 200);
    assert.deepEqual(await revokedSession.json(), {}, "revoked session must expose neither identity nor private data");
    assert.equal(await validateSessionToken(issued), null);
    await assert.rejects(async () => callback({ token: { ...jwt }, user, account: null, trigger: "signIn" }), /session changed during sign-in/);
  } finally {
    requestScope.restore();
    database.restore();
    if (previousSecret === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = previousSecret;
  }
});

test("password changes and sign-out-everywhere durably increment the session version", async () => {
  let consumed = 1;
  let updates: Array<{ data: { passwordHash?: string; sessionVersion?: { increment: number } } }> = [];
  const user = { id: "member-1", passwordHash: "existing-hash", role: "TESTER" };
  const db = {
    user: { update: async (input: typeof updates[number]) => { updates.push(input); return user; } },
    verificationToken: { deleteMany: async () => ({ count: consumed }) },
  };
  const modules = [
    mock.module("../lib/auth.ts", { namedExports: { getCurrentUser: async () => user } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: { ...db, $transaction: async (work: (tx: typeof db) => Promise<unknown>) => work(db) } } }),
  ];
  try {
    const actions = await import(`../app/actions/accountActions.ts?session-security=${randomUUID()}`);
    assert.deepEqual(await actions.changePasswordAfterEmailVerification({
      token: "single-use-test-token", password: "StrongPassword123", confirmPassword: "StrongPassword123",
    }), { ok: true });
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].data.sessionVersion, { increment: 1 });
    assert.ok(updates[0].data.passwordHash);
    consumed = 0;
    const expired = await actions.changePasswordAfterEmailVerification({
      token: "expired-token", password: "StrongPassword123", confirmPassword: "StrongPassword123",
    });
    assert.equal(expired.ok, false);
    assert.equal(updates.length, 1, "failed verification must not change password or sessions");
    updates = [];
    assert.deepEqual(await actions.revokeAllAccountSessions(), { ok: true });
    assert.deepEqual(updates[0].data, { sessionVersion: { increment: 1 } });
    updates = [];
    user.passwordHash = "";
    assert.deepEqual(await actions.setAccountPassword({
      password: "StrongPassword123", confirmPassword: "StrongPassword123",
    }), { ok: true });
    assert.deepEqual(updates[0].data.sessionVersion, { increment: 1 });
  } finally {
    for (const item of modules.reverse()) item.restore();
  }
});
