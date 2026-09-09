import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser(roleHint: UserRole = "TESTER") {
  const configuredUserId = process.env.SEEDENV_PREVIEW_USER_ID;
  if (configuredUserId) {
    const user = await prisma.user.findUnique({ where: { id: configuredUserId } });
    if (user) return user;
  }

  return prisma.user.upsert({
    where: { email: roleHint === "DEVELOPER" ? "preview.developer@seedenv.dev" : "preview.tester@seedenv.dev" },
    update: { role: roleHint },
    create: {
      email: roleHint === "DEVELOPER" ? "preview.developer@seedenv.dev" : "preview.tester@seedenv.dev",
      username: roleHint === "DEVELOPER" ? "PreviewBuilder" : "PreviewRider",
      role: roleHint,
    },
  });
}