import assert from "node:assert/strict";
import test, { mock } from "node:test";

test("developer onboarding attaches entered referrals, preserves account redirect, and reports eligibility failures", async () => {
  let attached = 0;
  let existing = false;
  let fail = false;
  class ReferralFailure extends Error {}
  class Redirect extends Error {}
  const mocks = [
    mock.module("next-auth", { namedExports: { getServerSession: async () => ({ user: { id: "referred-developer" } }) } }),
    mock.module("next/navigation", { namedExports: { redirect: (path: string) => { throw new Redirect(path); } } }),
    mock.module("../lib/auth-options.ts", { namedExports: { authOptions: {} } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: { user: { findUnique: async () => ({ role: "DEVELOPER", developerWorkspaceEnabled: true, testerWorkspaceEnabled: false, passwordHash: "fixture", _count: { accounts: 0 } }) } } } }),
    mock.module("../lib/member.ts", { namedExports: { requireMember: async () => assert.fail("Tester referral flow must remain separate.") } }),
    mock.module("../lib/quest-ledger.ts", { namedExports: { saveMemberReferral: async () => assert.fail("Developer code must not grant tester XP.") } }),
    mock.module("../lib/validator-handle.ts", { namedExports: { ensureValidatorHandle: async () => assert.fail("Not a tester.") } }),
    mock.module("../lib/billing-transaction.ts", { namedExports: { billingTransaction: async (work: (tx: { developerReferral: { findUnique: () => Promise<unknown> } }) => Promise<unknown>) => work({ developerReferral: { findUnique: async () => existing ? { inviter: { developerReferralCode: "DEV_FIXTURE" } } : null } }) } }),
    mock.module("../lib/developer-referrals.ts", { namedExports: {
      DeveloperReferralError: ReferralFailure,
      attachDeveloperReferral: async (_tx: unknown, userId: string, code: string) => {
        assert.equal(userId, "referred-developer");
        assert.equal(code, "DEV_FIXTURE");
        if (fail) throw new ReferralFailure("Link your referral before your first paid cohort.");
        attached += 1;
      },
    } }),
  ];
  const log = mock.method(console, "error", () => {});
  try {
    const { default: onboarding } = await import("../app/onboarding/page");
    const searchParams = { role: "DEVELOPER", next: "/account?tab=profile&devref=DEV_FIXTURE", devref: "DEV_FIXTURE" };
    await assert.rejects(onboarding({ searchParams: Promise.resolve(searchParams) }), (error) => error instanceof Redirect && error.message === searchParams.next);
    assert.equal(attached, 1);
    existing = true;
    await assert.rejects(onboarding({ searchParams: Promise.resolve(searchParams) }), Redirect);
    assert.equal(attached, 1, "Repeated OAuth/email callbacks do not attach or reward twice.");
    existing = false; fail = true;
    await assert.rejects(onboarding({ searchParams: Promise.resolve(searchParams) }), (error) => error instanceof Redirect && error.message.includes("developerReferralError=Link%20your%20referral%20before"));
    assert.equal(log.mock.callCount(), 1);
    fail = false;
    await assert.rejects(onboarding({ searchParams: Promise.resolve({ role: "DEVELOPER", next: "https://example.invalid" }) }), (error) => error instanceof Redirect && error.message === "/dashboard");
    assert.equal(attached, 1, "No entered developer code means no referral changes.");
  } finally {
    log.mock.restore();
    for (const moduleMock of mocks.reverse()) moduleMock.restore();
  }
});
