import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/tools/swarm-detector" },
  title: "Swarm Detector // SeedEnv QA & Trust Suite",
  description:
    "Audit comment streams across TikTok, X, Reddit, and custom applications to detect synchronized bot swarms and astroturfing campaigns.",
  openGraph: {
    title: "SeedEnv Universal Swarm & Astroturf Detector",
    description:
      "Deterministic heuristic audit engine for detecting coordinated inauthentic behavior across social feeds and dev staging platforms.",
    url: "https://seedenv.com/tools/swarm-detector",
    siteName: "SeedEnv",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SeedEnv Universal Swarm & Astroturf Detector",
    description: "Detect coordinated comment swarms and astroturfing across any platform.",
  },
};

export default function SwarmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
