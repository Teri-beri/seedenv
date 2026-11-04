"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/member";
import { serializable } from "@/lib/quest-ledger";
import { publishBugReport, unpublishBugReport } from "@/lib/public-bug-reports";
import type { PublicReportInput } from "@/lib/organic-growth";

export async function shareBugReport(submissionId: string, input: PublicReportInput | null) {
  try {
    const developer = await requireMember("DEVELOPER");
    const report = await serializable((tx) => input === null
      ? unpublishBugReport(tx, developer.id, submissionId)
      : publishBugReport(tx, developer.id, submissionId, input));
    revalidatePath(`/report/${report.id}`, "page");
    revalidatePath("/sitemap.xml");
    revalidatePath("/console");
    return { ok: true as const, report };
  } catch (error) {
    console.error("SeedEnv public report sharing failed:", error);
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not update report sharing. Try again." };
  }
}
