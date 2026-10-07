"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { auditSubmission } from "@/lib/ai/qa-audit";
import { prisma } from "@/lib/prisma";

const back = (kind: "ok" | "error", message: string) => redirect(`/admin/qa?${kind}=${encodeURIComponent(message)}`);

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=%2Fadmin%2Fqa");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true } });
  if (user?.role !== "ADMIN") redirect("/");
  return user;
}

export async function clearFraudFlag(formData: FormData) {
  const admin = await requireAdmin();
  const submissionId = String(formData.get("submissionId") ?? "");
  const cleared = await prisma.submissionAudit.updateMany({ where: { submissionId, status: "FLAGGED_FRAUD", humanClearedAt: null }, data: { humanClearedAt: new Date(), humanClearedById: admin.id } });
  revalidatePath("/admin/qa");
  revalidatePath("/console");
  back(cleared.count ? "ok" : "error", cleared.count ? "Flag cleared. Normal auto-approval timing resumes." : "That flag was already cleared or no longer exists.");
}

export async function retryAudit(formData: FormData) {
  await requireAdmin();
  const submissionId = String(formData.get("submissionId") ?? "");
  const outcome = await auditSubmission(submissionId, { force: true });
  revalidatePath("/admin/qa");
  revalidatePath("/console");
  back(outcome.ok ? "ok" : "error", outcome.ok ? `Audit complete: ${outcome.status.toLowerCase().replaceAll("_", " ")}.` : outcome.skipped ?? `Audit failed again: ${(outcome.error ?? "unknown error").slice(0, 160)}`);
}
