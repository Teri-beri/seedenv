import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function requireMember(role?: "TESTER" | "DEVELOPER") {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Sign in to continue.");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) throw new Error("Account not found.");
  if (role && user.role !== role && user.role !== "ADMIN") throw new Error(`Switch to your ${role.toLowerCase()} workspace first.`);
  return user;
}
