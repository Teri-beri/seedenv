"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sealGitHubToken, verifyGitHubToken } from "@/lib/github-issues";

const tokenSchema = z.string().trim().min(20).max(255).regex(/^(github_pat_|ghp_)[A-Za-z0-9_]+$/, "Paste a GitHub personal access token (github_pat_… or ghp_…).");

export type GitHubTokenResult = { ok: true; login: string | null } | { ok: false; message: string };

export async function saveGitHubToken(token: string): Promise<GitHubTokenResult> {
  const user = await getCurrentUser("DEVELOPER");
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message || "Invalid token." };
  let login: string | null;
  try {
    login = await verifyGitHubToken(parsed.data);
  } catch {
    return { ok: false, message: "Could not reach GitHub to verify the token. Try again." };
  }
  if (!login) return { ok: false, message: "GitHub rejected this token. Check that it has not expired." };
  try {
    await prisma.user.update({ where: { id: user.id }, data: { githubTokenEncrypted: sealGitHubToken(parsed.data) } });
  } catch {
    return { ok: false, message: "Token encryption is not configured on this server." };
  }
  revalidatePath("/account");
  return { ok: true, login };
}

export async function removeGitHubToken(): Promise<GitHubTokenResult> {
  const user = await getCurrentUser("DEVELOPER");
  await prisma.user.update({ where: { id: user.id }, data: { githubTokenEncrypted: null } });
  revalidatePath("/account");
  return { ok: true, login: null };
}
