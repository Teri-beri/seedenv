import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function getCurrentUser(roleHint: UserRole = "TESTER") {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    const authenticatedUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (authenticatedUser) return authenticatedUser;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Authentication required.");
  }

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
      username: roleHint === "DEVELOPER" ? "PreviewBuilder" : "PreviewSeeder",
      role: roleHint,
    },
  });
}