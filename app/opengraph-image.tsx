import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "SeedEnv - High-Signal Beta Testing & App Store Readiness";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: "72px 80px",
          backgroundColor: "#0F1117",
          backgroundImage: "linear-gradient(135deg, rgba(16,185,129,0.14) 0%, rgba(15,17,23,0) 55%)",
          color: "#F8FAFC",
          fontFamily: "sans-serif",
          borderTop: "8px solid #34D399",
        }}
      >
        <div style={{ display: "flex", color: "#6EE7B7", fontSize: 22, marginBottom: 24 }}>seedenv.com</div>
        <div style={{ display: "flex", fontSize: 112, fontWeight: 700, lineHeight: 1.1 }}>SeedEnv</div>
        <div style={{ display: "flex", maxWidth: 980, fontSize: 42, lineHeight: 1.3, marginTop: 24 }}>
          High-Signal Beta Testing &amp; App Store Readiness
        </div>
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            marginTop: 40,
            padding: "14px 24px",
            borderRadius: 32,
            border: "1px solid #34D399",
            backgroundColor: "rgba(16,185,129,0.1)",
            color: "#A7F3D0",
            fontSize: 23,
            boxShadow: "0 0 32px rgba(52,211,153,0.15)",
          }}
        >
          For Developers &amp; Verified Testers
        </div>
      </div>
    ),
    size,
  );
}