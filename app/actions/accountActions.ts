"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const accountSettingsSchema = z.object({
  name: z.string().trim().max(80).optional(),
  username: z.string().trim().min(2).max(40),
  avatarUrl: z.string().trim().url().optional().or(z.literal("")),
  bio: z.string().trim().max(240).optional(),
  portfolioUrl: z.string().trim().url().optional().or(z.literal("")),
  companyName: z.string().trim().max(100).optional(),
  productUrl: z.string().trim().url().optional().or(z.literal("")),
});

export type AccountSettingsInput = z.infer<typeof accountSettingsSchema>;

export async function updateAccountSettings(data: AccountSettingsInput) {
  const user = await getCurrentUser();
  const input = accountSettingsSchema.parse(data);

  return prisma.user.update({
    where: { id: user.id },
    data: {
      name: input.name || null,
      username: input.username,
      avatarUrl: input.avatarUrl || null,
      image: input.avatarUrl || user.image || null,
      bio: input.bio || null,
      portfolioUrl: input.portfolioUrl || null,
      companyName: input.companyName || null,
      productUrl: input.productUrl || null,
    },
    select: {
      id: true,
      name: true,
      username: true,
      avatarUrl: true,
      role: true,
    },
  });
}

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function setAccountPassword(data: { password: string; confirmPassword: string; currentPassword?: string }): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (data.password !== data.confirmPassword) return { ok: false, message: "Passwords do not match." };

  const problem = validatePassword(data.password);
  if (problem) return { ok: false, message: problem };

  if (user.passwordHash) {
    const currentMatches = data.currentPassword ? await verifyPassword(data.currentPassword, user.passwordHash) : false;
    if (!currentMatches) return { ok: false, message: "Current password is incorrect." };
  }

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(data.password) } });
  return { ok: true };
}

const onboardingUsernameSchema = z.string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(32, "Username must be 32 characters or fewer.")
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only use letters, numbers, and underscores.");

export async function saveOnboardingProfile(data: AccountSettingsInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = accountSettingsSchema.extend({ username: onboardingUsernameSchema }).safeParse(data);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message || "Check your profile details." };

  const input = parsed.data;
  if (user.role === "DEVELOPER" && !input.companyName) return { ok: false, message: "Company or studio name is required." };

  const usernameTaken = await prisma.user.findFirst({
    where: { username: { equals: input.username, mode: "insensitive" }, id: { not: user.id } },
    select: { id: true },
  });
  if (usernameTaken) return { ok: false, message: "That username is already taken." };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: input.name || null,
      username: input.username,
      bio: input.bio || null,
      portfolioUrl: input.portfolioUrl || null,
      companyName: user.role === "DEVELOPER" ? input.companyName || null : null,
      productUrl: user.role === "DEVELOPER" ? input.productUrl || null : null,
    },
  });
  return { ok: true };
}
