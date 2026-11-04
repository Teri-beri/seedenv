import { ToolShell } from "@/components/tools/tool-shell";
import { QaChecklist } from "@/components/tools/qa-checklist";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata("Free QA Checklist Generator", "Generate a copy-ready release QA checklist for mobile, web, signup and payment flows. Free Markdown testing plan with no signup or credit card.", "/tools/qa-checklist");

export default function Page() {
  return <ToolShell title="QA Checklist" description="Turn your release surface into a practical testing plan. Choose the flows you ship, get instant Markdown, and bring the checklist straight into your repo."><QaChecklist /></ToolShell>;
}
