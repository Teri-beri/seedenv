import { publicPageMetadata } from "@/lib/seo";

export const metadata = {
  ...publicPageMetadata("Free Swarm Detector & Comment Analysis", "Analyze pasted comments for repetition and coordination signals. Free browser-local SwarmForensics analysis without login. Heuristic results are not proof of bot activity.", "/tools/swarm-detector"),
  robots: { index: true, follow: true },
};

export default function SwarmLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
