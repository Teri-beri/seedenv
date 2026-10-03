import "server-only";
import { requireMember } from "@/lib/member";
export { requireClipRoom } from "@/lib/clipper-lifecycle";

export function clippersEnabled() {
  return process.env.CLIPPERS_ENABLED === "true";
}

export function requireClippers() {
  if (!clippersEnabled()) throw new Error("Clippers is not enabled. An administrator must apply its migration and configure private storage and payment webhooks first.");
}

export async function clipMember(role?: "TESTER" | "DEVELOPER") {
  requireClippers();
  return requireMember(role);
}
