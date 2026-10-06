"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0D12", color: "#f4f4f5", fontFamily: "system-ui, -apple-system, sans-serif", textAlign: "center", padding: "24px" }}>
        <main>
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#fbbf24" }}>SeedEnv is temporarily unavailable</p>
          <h1 style={{ fontSize: 28, fontWeight: 600, margin: "12px 0" }}>Something went wrong on our side</h1>
          <p style={{ color: "#a1a1aa", fontSize: 14, lineHeight: 1.6, maxWidth: 420, margin: "0 auto" }}>Please try again in a moment. If the problem continues, email terimus@seedenv.com{error.digest ? ` and include reference ${error.digest}` : ""}.</p>
          <div style={{ marginTop: 28, display: "flex", gap: 12, justifyContent: "center" }}>
            <button type="button" onClick={reset} style={{ background: "#f4f4f5", color: "#09090b", border: 0, borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>Try again</button>
            {/* A full reload is intentional: the root layout failed to render. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ color: "#d4d4d8", border: "1px solid #27272a", borderRadius: 8, padding: "8px 16px", textDecoration: "none" }}>Home</a>
          </div>
        </main>
      </body>
    </html>
  );
}
