import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PlatformType, TaskProofType } from "@prisma/client";
import type { CampaignInput } from "../app/actions/campaignActions";

test("mission preview keeps empty drafts honest and renders edited mission details", async () => {
  const serverOnly = mock.module("server-only", { namedExports: {} });
  try {
    const { LaunchPreview } = await import("../components/developer-studio");
    const draft: CampaignInput = {
      title: "", platform: PlatformType.TESTFLIGHT, appUrl: "", iconUrl: "",
      targetVibe: "", description: "", totalSlots: 5, bountyPerTaskUsd: 5,
      discoveryAllowed: false, discoveryMinRep: 0, cohortType: "STANDARD_QA",
      hardwareStrict: true, instructions: [], estimatedMinutes: null, testerPerk: "",
    };
    const render = (form: CampaignInput) => renderToStaticMarkup(createElement(LaunchPreview, { form }));
    const empty = render(draft);
    assert.match(empty, /Your next great release/);
    assert.match(empty, /Audience not selected/);
    assert.match(empty, /Nothing is published yet/);
    assert.match(empty, /task checklist will appear here/);
    assert.doesNotMatch(empty, /View seed mission|iPhone|Pixel|Live testers/);
    const filled = render({
      ...draft, title: "Payment & checkout", description: "<script>not executable</script>",
      targetVibe: "Fintech Trust", platform: PlatformType.WEB_STAGING,
      estimatedMinutes: 12, testerPerk: "Pro access",
      instructions: Array.from({ length: 4 }, (_, index) => ({
        instructionTitle: `Task ${index + 1}`, instructionDetail: "Verify the flow",
        proofType: TaskProofType.SCREENSHOT, minimumRep: 0,
      })),
    });
    assert.match(filled, /Payment &amp; checkout/);
    assert.match(filled, /&lt;script&gt;not executable&lt;\/script&gt;/);
    assert.match(filled, /Browser/);
    assert.match(filled, /12 min/);
    assert.match(filled, /Task 3/);
    assert.match(filled, /\+1 more task/);
    assert.doesNotMatch(filled, /Task 4/);
    assert.match(filled, /Tester perk: Pro access/);
    assert.match(filled, /Reward per approved tester/);
  } finally {
    serverOnly.restore();
  }
});
