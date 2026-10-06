const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres", "db"]);

export function isLocalDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl) return false;
  try {
    return LOCAL_HOSTS.has(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
}

// Seed scripts write demo data; refuse to touch shared or production databases unless explicitly overridden.
export function assertSeedTargetIsSafe(reason: string) {
  if (isLocalDatabaseUrl(process.env.DATABASE_URL) && process.env.NODE_ENV !== "production") return;
  if (process.env.ALLOW_REMOTE_SEED === "I_UNDERSTAND") return;
  console.error(`Refusing to seed: ${reason}.`);
  console.error("DATABASE_URL is not a local database (or NODE_ENV=production). Set ALLOW_REMOTE_SEED=I_UNDERSTAND to override.");
  process.exit(1);
}
