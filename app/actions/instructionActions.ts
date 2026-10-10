"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/member";
import { serializable } from "@/lib/quest-ledger";
import { editCohortDirections, editDirectionsSchema, InstructionEditError } from "@/lib/instruction-versions";

export async function saveCohortDirections(data: unknown) {
  const member = await requireMember("DEVELOPER");
  const parsed = editDirectionsSchema.safeParse(data);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message || "Invalid directions." };
  try {
    const version = await serializable((tx) => editCohortDirections(tx, member.id, parsed.data));
    for (const path of ["/console", "/applications", "/dashboard", "/admin/proof-reviews", "/"]) revalidatePath(path);
    return { ok: true as const, revision: version.revision };
  } catch (error) {
    if (error instanceof InstructionEditError) return { ok: false as const, error: error.message };
    console.error("Cohort directions save failed", error);
    return { ok: false as const, error: "Directions could not be saved. Please reload and try again." };
  }
}
