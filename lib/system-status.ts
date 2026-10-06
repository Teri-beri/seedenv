import { prisma } from "@/lib/prisma";

export type ServiceState = "operational" | "degraded";
export type OverallState = "operational" | "degraded";

export type ServiceStatus = {
  id: string;
  name: string;
  description: string;
  state: ServiceState;
};

export type SystemStatus = {
  overall: OverallState;
  services: ServiceStatus[];
  checkedAt: string;
};

type Env = Record<string, string | undefined>;

const CACHE_TTL_MS = 30_000;
const DATABASE_TIMEOUT_MS = 3_000;

const present = (value: string | undefined) => Boolean(value?.trim());

export function evaluateServices(env: Env, databaseReachable: boolean): ServiceStatus[] {
  const states: Record<string, boolean> = {
    core: databaseReachable,
    payments: present(env.STRIPE_SECRET_KEY) && present(env.STRIPE_WEBHOOK_SECRET),
    telemetry: present(env.SUPABASE_URL) && present(env.SUPABASE_SERVICE_ROLE_KEY),
    notifications: Boolean(env.RESEND_API_KEY?.trim().startsWith("re_")),
  };
  return [
    { id: "core", name: "Core API & Database", description: "Cohort persistence, schema migrations, and user authentication." },
    { id: "payments", name: "Stripe Escrow & Payout Rail", description: "Webhook listeners, funds escrowing, and Stripe Connect transfers." },
    { id: "telemetry", name: "Validation Telemetry Processing", description: "Video proof upload pipelines, crash log parsing, and S3 storage." },
    { id: "notifications", name: "Notification & Dispatch Bus", description: "Tester email alerts, cohort drop webhooks, and push telemetry." },
  ].map((service) => ({ ...service, state: states[service.id] ? "operational" : "degraded" }));
}

export function summarize(services: ServiceStatus[]): OverallState {
  return services.every((service) => service.state === "operational") ? "operational" : "degraded";
}

async function databaseReachable() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Database health check timed out")), DATABASE_TIMEOUT_MS); }),
    ]);
    return true;
  } catch (error) {
    console.error("SeedEnv status database check failed:", error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const globalForStatus = globalThis as typeof globalThis & { __seedenvStatus?: { value: SystemStatus; expires: number } };

// Cached briefly so public status traffic can't turn into a database ping storm.
export async function getSystemStatus(): Promise<SystemStatus> {
  const cached = globalForStatus.__seedenvStatus;
  if (cached && cached.expires > Date.now()) return cached.value;
  const services = evaluateServices(process.env, await databaseReachable());
  const value: SystemStatus = { overall: summarize(services), services, checkedAt: new Date().toISOString() };
  globalForStatus.__seedenvStatus = { value, expires: Date.now() + CACHE_TTL_MS };
  return value;
}
