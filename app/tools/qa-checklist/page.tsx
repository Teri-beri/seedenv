import { ToolShell } from "@/components/tools/tool-shell";
import { QaChecklist } from "@/components/tools/qa-checklist";
import { publicPageMetadata } from "@/lib/seo";
import { freeTools } from "@/lib/organic-growth";

export const metadata = { ...publicPageMetadata("Free QA Checklist Generator", "Generate a copy-ready release QA checklist for mobile, web, signup and payment flows. Free Markdown testing plan with no signup or credit card.", "/tools/qa-checklist"), robots: { index: true, follow: true } };

export default function Page() {
  return <ToolShell tool={freeTools[2]} title="QA Checklist" description="Turn your release surface into a practical testing plan. Choose the flows you ship, get instant Markdown, and bring the checklist straight into your repo."><QaChecklist /></ToolShell>;
}
