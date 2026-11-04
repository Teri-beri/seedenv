import { ImageResponse } from "next/og";
import { getPublicBugReport, physicalHardwareVerified } from "@/lib/public-bug-reports";

export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "SeedEnv public bug report";

export default async function Image({ params }: { params: Promise<{ reportId: string }> }) {
  const report = await getPublicBugReport((await params).reportId);
  if (!report) return new Response("Report unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new ImageResponse(
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", background: "#09090b", color: "#e4e4e7", padding: "64px", border: "2px solid #27272a", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24 }}><span style={{ color: "#34d399" }}>SeedEnv / public bug dossier</span><span style={{ color: report.severity === "CRITICAL" ? "#fda4af" : "#fbbf24" }}>{report.severity}</span></div>
      <div style={{ display: "flex", fontSize: 54, fontWeight: 700, lineHeight: 1.2 }}>{report.title.slice(0, 120)}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div style={{ display: "flex", fontSize: 28 }}>{report.deviceModel.slice(0, 55)} / {report.osVersion.slice(0, 40)}</div><div style={{ display: "flex", fontSize: 21, color: "#a1a1aa" }}>{physicalHardwareVerified(report) ? "Physical-device signals verified" : "Developer-published report"} / seedenv.com</div></div>
    </div>,
    { ...size, headers: { "Cache-Control": "no-store" } },
  );
}
