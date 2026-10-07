import { expireSlots } from "@/app/actions/submissionActions";
import { sweepCampaignFunding } from "@/lib/slot-funding";
import { retryPendingAudits } from "@/lib/ai/qa-audit";
import { sweepCampaignSyntheses } from "@/lib/ai/campaign-synthesis";
import { autoApprovalEnabled, autoApproveOverdueSubmissions } from "@/lib/submission-approval";

const warn = (label: string) => (error: unknown) => console.warn(`SeedEnv ${label} sweep failed:`, error instanceof Error ? error.message : error);

if (autoApprovalEnabled()) {
  const sweep = () => {
    autoApproveOverdueSubmissions().catch(warn("auto-approval"));
  };
  setTimeout(sweep, 60_000).unref?.();
  setInterval(sweep, 15 * 60_000).unref?.();
}

// Releases abandoned claims first so ended cohorts refund every slot nobody is using.
if (process.env.NODE_ENV === "production" && process.env.SEEDENV_DISABLE_FUNDING_SWEEP !== "1") {
  const sweep = () => {
    expireSlots().catch(warn("slot expiry")).finally(() => sweepCampaignFunding().catch(warn("cohort funding")));
  };
  setTimeout(sweep, 90_000).unref?.();
  setInterval(sweep, 10 * 60_000).unref?.();
}

// Retries failed or missed AI submission audits and writes missing release reports. Advisory only.
if (process.env.NODE_ENV === "production" && process.env.GEMINI_API_KEY && process.env.SEEDENV_DISABLE_QA_AI !== "1") {
  const sweep = () => {
    retryPendingAudits().catch(warn("AI audit retry")).finally(() => sweepCampaignSyntheses().catch(warn("AI release report")));
  };
  setTimeout(sweep, 120_000).unref?.();
  setInterval(sweep, 10 * 60_000).unref?.();
}
