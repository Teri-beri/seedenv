import type { Metadata } from "next";
import { MobilePairResume } from "@/components/tester/MobilePairResume";

export const metadata: Metadata = {
  title: "Connect testing phone",
  description: "Securely connect a mobile device to an active SeedEnv validation mission.",
  robots: { index: false, follow: false },
};

export default async function PairMissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MobilePairResume pairSessionId={id} />;
}
