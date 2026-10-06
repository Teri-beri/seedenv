import { autoApprovalEnabled, autoApproveOverdueSubmissions } from "@/lib/submission-approval";

if (autoApprovalEnabled()) {
  const sweep = () => {
    autoApproveOverdueSubmissions().catch((error) => console.warn("SeedEnv auto-approval sweep failed:", error instanceof Error ? error.message : error));
  };
  setTimeout(sweep, 60_000).unref?.();
  setInterval(sweep, 15 * 60_000).unref?.();
}
