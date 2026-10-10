import Link from "next/link";
import { requirePromoOperator } from "@/lib/cohort-promos";
import { prisma } from "@/lib/prisma";
import { CohortPromoManager } from "@/components/cohort-promo-manager";

export const dynamic = "force-dynamic";

export default async function CohortPromosPage() {
  await requirePromoOperator();
  const codes = await prisma.cohortPromoCode.findMany({ where: { ownerId: null }, orderBy: { createdAt: "desc" }, take: 100 });
  return <main className="min-h-screen bg-[#0A0D12] px-4 py-8 text-white">
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/console?view=billing" className="inline-flex min-h-11 items-center text-sm text-zinc-400">Back to console</Link>
      <h1 className="text-2xl font-semibold">Cohort promo codes</h1>
      <p className="text-sm text-zinc-400">Private code management for the verified owner and administrators. Showing the latest 100 codes.</p>
      <CohortPromoManager codes={codes.map((code) => ({ ...code, expiresAt: code.expiresAt?.toISOString() ?? null }))} />
    </div>
  </main>;
}
