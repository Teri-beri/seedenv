import type { UserRole } from "@prisma/client";

export function workspaceHome(role: UserRole | undefined): "/console" | "/dashboard" {
  return role === "DEVELOPER" || role === "ADMIN" ? "/console" : "/dashboard";
}
