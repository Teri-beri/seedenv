import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { emptyAiDraftInputs, launchWizardDraftSchema, type LaunchWizardDraft } from "../lib/launch-wizard-draft";

const draft: LaunchWizardDraft = {
  version: 1,
  form: {
    title: "G", platform: "TESTFLIGHT", appUrl: "unfinished url", iconUrl: "",
    targetVibe: "Social & UGC", description: "", totalSlots: 25, bountyPerTaskUsd: 4,
    instructions: [{ instructionTitle: "", instructionDetail: "", proofType: "SCREENSHOT", minimumRep: 0 }],
    discoveryAllowed: false, discoveryMinRep: 0, cohortType: "STANDARD_QA", hardwareStrict: true,
  },
  step: 2, highestStep: 2, topUpTesters: 5, iconFileName: "icon.png",
  ai: { ...emptyAiDraftInputs, description: "Unfinished app description", open: true },
};

test("wizard draft retains incomplete fields, tasks, progress and AI inputs", () => {
  assert.deepEqual(launchWizardDraftSchema.parse(JSON.parse(JSON.stringify(draft))), draft);
  assert.equal(launchWizardDraftSchema.safeParse({ ...draft, step: 3 }).success, false);
  assert.equal(launchWizardDraftSchema.safeParse({ ...draft, form: { ...draft.form, title: "x".repeat(91) } }).success, false);
  const parsed = launchWizardDraftSchema.parse({ ...draft, form: { ...draft.form, platformFeeWaived: true } });
  assert.equal("platformFeeWaived" in parsed.form, false);
});

test("account autosave isolates drafts, rejects stale revisions and never creates campaigns or payments", async () => {
  let revision = 0;
  let drafts: Record<string, LaunchWizardDraft> = {};
  let allowed = true;
  let race = false;
  const calls: string[] = [];
  const tx = {
    user: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        calls.push(where.id);
        return { launchWizardDrafts: structuredClone(drafts), launchWizardDraftRevision: revision };
      },
      updateMany: async ({ where, data }: { where: { id: string; launchWizardDraftRevision: number }; data: { launchWizardDrafts: Record<string, LaunchWizardDraft> } }) => {
        if (race || where.launchWizardDraftRevision !== revision) return { count: 0 };
        assert.equal(where.id, "authenticated-developer");
        drafts = data.launchWizardDrafts;
        revision += 1;
        return { count: 1 };
      },
    },
    appCampaign: { findFirst: async ({ where }: { where: { developerId: string } }) => {
      assert.equal(where.developerId, "authenticated-developer");
      return allowed ? { id: "owned-draft" } : null;
    } },
  };
  const mocks = [
    mock.module("../lib/member.ts", { namedExports: { requireMember: async (role: string) => {
      assert.equal(role, "DEVELOPER");
      return { id: "authenticated-developer" };
    } } }),
    mock.module("../lib/prisma.ts", { namedExports: { prisma: { $transaction: async (work: (database: typeof tx) => Promise<unknown>) => work(tx) } } }),
  ];
  try {
    const { saveLaunchWizardDraft } = await import(`../app/actions/launchDraftActions.ts?test=${randomUUID()}`);
    assert.deepEqual(await saveLaunchWizardDraft({ expectedRevision: 0, draft }), { revision: 1 });
    assert.deepEqual(drafts.new, draft);
    await assert.rejects(saveLaunchWizardDraft({ expectedRevision: 0, draft: { ...draft, iconFileName: "stale.png" } }), /another tab or device/);
    assert.equal(drafts.new.iconFileName, "icon.png");
    await saveLaunchWizardDraft({ expectedRevision: 1, sourceDraftId: "owned-draft", draft });
    assert.deepEqual(drafts["campaign:owned-draft"], draft);
    allowed = false;
    await assert.rejects(saveLaunchWizardDraft({ expectedRevision: 2, sourceDraftId: "foreign-draft", draft }), /no longer an editable draft/);
    race = true;
    await assert.rejects(saveLaunchWizardDraft({ expectedRevision: 2, draft }), /another tab or device/);
    race = false;
    await saveLaunchWizardDraft({ expectedRevision: 2, draft: null });
    assert.equal(drafts.new, undefined);
    assert.deepEqual(drafts["campaign:owned-draft"], draft);
    assert.ok(calls.every((id) => id === "authenticated-developer"));
  } finally {
    mocks.reverse().forEach((item) => item.restore());
  }
});
