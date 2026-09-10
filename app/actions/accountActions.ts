"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const accountSettingsSchema = z.object({
  name: z.string().trim().max(80).optional(),
  username: z.string().trim().min(2).max(40),
  avatarUrl: z.string().trim().url().optional().or(z.literal("")),
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
