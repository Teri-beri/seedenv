import { z } from "zod";
import { supportRequestSchema, type SupportRequest } from "@/lib/enterprise-rules";

export const issueTypes = [
  "UI or visual issue",
  "Broken feature or bug",
  "Slow or unresponsive",
  "Other",
] as const;

export type IssueType = (typeof issueTypes)[number];
export type IssueReportDraft = {
  type: IssueType;
  subject: string;
  details: string;
  steps: string;
  expected: string;
  viewport?: { width: number; height: number };
};

const issueReportSchema = z.object({
  type: z.enum(issueTypes),
  subject: supportRequestSchema.shape.subject,
  details: z.string().trim().min(20, "Describe what happened in at least 20 characters.").max(2000),
  steps: z.string().trim().max(1200),
  expected: z.string().trim().max(1200),
  viewport: z.object({
    width: z.number().int().min(0).max(100000),
    height: z.number().int().min(0).max(100000),
  }).optional(),
  route: supportRequestSchema.shape.route,
});

export function buildIssueSupportRequest(draft: IssueReportDraft, route: string) {
  const parsed = issueReportSchema.safeParse({ ...draft, route });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message = issue?.path[0] === "subject"
      ? "Enter a title between 4 and 150 characters."
      : issue?.path[0] === "route"
        ? "The current page could not be included. Refresh and try again."
        : issue?.message || "Check the report details and try again.";
    return { ok: false as const, message };
  }

  const { type, subject, details, steps, expected, viewport } = parsed.data;
  const message = [
    `Issue type: ${type}`,
    `What happened:\n${details}`,
    ...(steps ? [`Steps to reproduce:\n${steps}`] : []),
    ...(expected ? [`Expected behavior:\n${expected}`] : []),
    ...(viewport ? [`Viewport: ${viewport.width} x ${viewport.height} CSS px`] : []),
  ].join("\n\n");
  const request = supportRequestSchema.safeParse({ category: "Technical Bug", subject, message, route: parsed.data.route });
  if (!request.success) return { ok: false as const, message: "The report could not be prepared. Check the fields and try again." };
  return { ok: true as const, data: request.data };
}

export function issueReportMailto(request: SupportRequest) {
  const subject = `[SeedEnv issue] ${request.subject.replace(/[\r\n]+/g, " ")}`;
  const body = `${request.message}\n\nPage: ${request.route}`;
  return `mailto:terimus@seedenv.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
