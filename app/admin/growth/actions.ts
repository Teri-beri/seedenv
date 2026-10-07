"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { runProductUpdate } from "@/lib/growth/pipeline";
import { productUpdateInputSchema } from "@/lib/growth/schemas";
import { productionGrowthContext } from "@/lib/growth/server";
import { prisma } from "@/lib/prisma";

const back = (kind: "ok" | "error", message: string) => redirect(`/admin/growth?${kind}=${encodeURIComponent(message)}`);

export async function draftProductUpdate(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=%2Fadmin%2Fgrowth");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (user?.role !== "ADMIN") redirect("/");

  const link = String(formData.get("linkUrl") ?? "").trim();
  const parsed = productUpdateInputSchema.safeParse({ details: String(formData.get("details") ?? ""), linkUrl: link || undefined });
  if (!parsed.success) back("error", parsed.error.issues[0]?.message ?? "Check the update details and link.");

  const ctx = productionGrowthContext();
  if (ctx.config.llm.mode === "disabled") back("error", "GEMINI_API_KEY is not set, so posts can't be drafted.");
  let outcome: { kind: "ok" | "error"; message: string };
  try {
    const result = await runProductUpdate(ctx, parsed.data!);
    outcome = { kind: "ok", message: `Drafted ${result.socialPostIds.length} posts${result.notified ? " and sent the review card" : ""}. Review them below.` };
  } catch (error) {
    console.error("[growth] product update failed", error);
    outcome = { kind: "error", message: `Drafting failed: ${error instanceof Error ? error.message.slice(0, 160) : "unknown error"}` };
  }
  revalidatePath("/admin/growth");
  back(outcome.kind, outcome.message);
}
