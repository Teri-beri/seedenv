import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { GITHUB_REPO_PATTERN } from "@/lib/github-issue-format";

function tokenKey() {
  const dedicated = Buffer.from(process.env.GITHUB_TOKEN_KEY || "", "base64");
  if (dedicated.length === 32) return dedicated;
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("GitHub export needs GITHUB_TOKEN_KEY or NEXTAUTH_SECRET to encrypt tokens.");
  return Buffer.from(hkdfSync("sha256", secret, "seedenv-github-token", "seedenv:github-token:v1", 32));
}

export function sealGitHubToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString("base64");
}

export function unsealGitHubToken(value: string) {
  const buffer = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", tokenKey(), buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(-16));
  return Buffer.concat([decipher.update(buffer.subarray(12, -16)), decipher.final()]).toString("utf8");
}

const githubHeaders = (token: string) => ({
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "User-Agent": "SeedEnv-Issue-Export",
  "X-GitHub-Api-Version": "2022-11-28",
});

export async function verifyGitHubToken(token: string) {
  const response = await fetch("https://api.github.com/user", { headers: githubHeaders(token), cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;
  const body = await response.json() as { login?: string };
  return body.login || null;
}

export async function createGitHubIssue(token: string, repo: string, issue: { title: string; body: string }) {
  if (!GITHUB_REPO_PATTERN.test(repo)) throw new Error("The cohort's GitHub repo must use the owner/repo format.");
  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ title: issue.title, body: issue.body }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 201) {
    const created = await response.json() as { html_url?: string };
    if (!created.html_url) throw new Error("GitHub created the issue but returned no link.");
    return created.html_url;
  }
  if (response.status === 401) throw new GitHubExportError("GitHub rejected the saved token. Update it in Settings.", 401);
  if (response.status === 403 || response.status === 404) throw new GitHubExportError(`The saved token cannot create issues in ${repo}. Grant Issues: read and write on that repository.`, 403);
  if (response.status === 410) throw new GitHubExportError(`Issues are disabled on ${repo}.`, 409);
  throw new GitHubExportError(`GitHub returned HTTP ${response.status}. Try again shortly.`, 502);
}

export class GitHubExportError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
