import { ToolShell } from "@/components/tools/tool-shell";
import { ViewportCheck } from "@/components/tools/viewport-check";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata("Free Responsive Viewport Checker", "Preview a website at 360px mobile, tablet and desktop sizes. Copy a responsive QA matrix without signup. Browser-local, free developer tool by SeedEnv.", "/tools/viewport-check");

export default function Page() {
  return <ToolShell title="Viewport Check" description="See your site at real-world CSS viewport sizes, then copy a testing matrix. Preview locally in your browser; cross-origin pages are not automatically inspected."><ViewportCheck /></ToolShell>;
}
