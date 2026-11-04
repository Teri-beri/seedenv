import { z } from "zod";

export const freeTools = [
  { path: "/tools/swarm-detector", name: "SwarmForensics", description: "Audit pasted comment streams for coordinated activity.", tag: "Trust & safety" },
  { path: "/tools/viewport-check", name: "Viewport Check", description: "Preview your site at real-world mobile and desktop sizes.", tag: "Responsive QA" },
  { path: "/tools/qa-checklist", name: "QA Checklist", description: "Generate a practical release checklist for your next build.", tag: "Release readiness" },
] as const;

export const toolUrlSchema = z.string().trim().max(2000).transform((value, ctx) => {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid URL");
    return url.toString();
  } catch {
    ctx.addIssue({ code: "custom", message: "Enter a full HTTP or HTTPS URL without embedded credentials." });
    return z.NEVER;
  }
});

export function sprintHandoffPath(url?: string | null) {
  const parsed = toolUrlSchema.safeParse(url);
  return `/dashboard/projects/new${parsed.success ? `?${new URLSearchParams({ url: parsed.data })}` : ""}`;
}

export const viewportPresets = [
  { name: "Small mobile", width: 360, height: 800 },
  { name: "Modern mobile", width: 393, height: 852 },
  { name: "Tablet", width: 768, height: 1024 },
  { name: "Laptop", width: 1440, height: 900 },
  { name: "Wide desktop", width: 1920, height: 1080 },
] as const;

export const qaChecklistGroups = {
  core: { label: "Core flows", checks: ["Complete the primary user journey from a fresh account.", "Verify empty, loading, error and offline states.", "Check keyboard navigation, focus order and screen-reader labels.", "Test 360px mobile, tablet and desktop layouts.", "Confirm invalid inputs show actionable inline errors."] },
  auth: { label: "Accounts & access", checks: ["Test signup, sign-in, sign-out and password recovery.", "Verify expired sessions and protected routes.", "Confirm one account cannot read another account's private data."] },
  commerce: { label: "Payments & commerce", checks: ["Use sandbox payments to test success, decline and cancellation.", "Retry submission without duplicate charges or orders.", "Verify receipts, totals, taxes and refund eligibility."] },
  mobile: { label: "Real-device testing", checks: ["Test touch targets and virtual-keyboard behavior.", "Reproduce on physical iOS and Android devices.", "Check orientation changes, slow networks and low-power mode."] },
} as const;
export type ChecklistGroup = keyof typeof qaChecklistGroups;

export function checklistMarkdown(url: string | null, groups: ChecklistGroup[]) {
  return ["# Release QA checklist", ...(url ? [`Target: ${url}`] : []), "", ...groups.flatMap((key) => [`## ${qaChecklistGroups[key].label}`, ...qaChecklistGroups[key].checks.map((check) => `- [ ] ${check}`), ""]), "Generated with SeedEnv: https://seedenv.com/tools/qa-checklist"].join("\n");
}

export const bugSeverities = ["CRITICAL", "MAJOR", "MINOR"] as const;
export const structuredBugSchema = z.object({
  title: z.string().trim().min(8, "Use at least 8 characters for the bug title.").max(160),
  severity: z.enum(bugSeverities),
  reproSteps: z.array(z.string().trim().min(3).max(500)).min(2, "Add at least two reproduction steps.").max(20),
});
export type StructuredBug = z.infer<typeof structuredBugSchema>;
export function feedbackWithBug(feedback: string, bug?: StructuredBug | null) {
  return bug ? `${feedback}\n\nBug: ${bug.title}\nSeverity: ${bug.severity}\nSteps to reproduce:\n${bug.reproSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")}` : feedback;
}
export const publicReportInputSchema = structuredBugSchema.extend({
  summary: z.string().trim().min(12).max(2000),
  includeMedia: z.boolean(),
});
export type PublicReportInput = z.infer<typeof publicReportInputSchema>;

export function githubReportMarkdown(report: { id: string; title: string; deviceModel: string; osVersion: string; severity: string; reproSteps: string[] }) {
  const text = (value: string) => value.replace(/[\r\n]+/g, " ").replace(/[\\`*_[\]<>#!|]/g, "\\$&");
  const url = `https://seedenv.com/report/${encodeURIComponent(report.id)}`;
  return ["### Verified Bug Report via SeedEnv", `- **Device:** ${text(report.deviceModel)} (${text(report.osVersion)})`, `- **Issue:** ${text(report.title)}`, `- **Severity:** ${text(report.severity)}`, `- **Full Dossier & Screen Recording:** [${url}](${url})`, "", "#### Steps to reproduce", ...report.reproSteps.map((step, index) => `${index + 1}. ${text(step)}`)].join("\n");
}

export const TESTER_REFERRAL_BOUNTY_CENTS = 100;
export const testerReferralVerificationCopy = "A verified email, completed tester profile and structured bug report with verified physical-device signals are required. The campaign developer must approve the bug; automatic, admin-override and inviter approvals do not qualify. One $1 reward per invited tester; no monthly cash cap.";
