export const SWARM_API_PLAN_IDS = ["SANDBOX", "STARTER", "GROWTH", "SCALE"] as const;
export type SwarmApiPlanId = (typeof SWARM_API_PLAN_IDS)[number];
export type PaidSwarmApiPlanId = Exclude<SwarmApiPlanId, "SANDBOX">;

export type SwarmApiPlan = {
  id: SwarmApiPlanId;
  name: string;
  priceCents: number;
  monthlyChecks: number;
  perMinute: number;
  maxKeys: number;
  webhooks: boolean;
  lookupKey: string | null;
  blurb: string;
};

export const SWARM_API_PLANS: Record<SwarmApiPlanId, SwarmApiPlan> = {
  SANDBOX: { id: "SANDBOX", name: "Sandbox", priceCents: 0, monthlyChecks: 500, perMinute: 30, maxKeys: 2, webhooks: false, lookupKey: null, blurb: "Wire it up and test with real traffic. No card required." },
  STARTER: { id: "STARTER", name: "Starter", priceCents: 1900, monthlyChecks: 10_000, perMinute: 120, maxKeys: 5, webhooks: true, lookupKey: "seedenv_swarm_api_starter_monthly", blurb: "Indie apps and small communities." },
  GROWTH: { id: "GROWTH", name: "Growth", priceCents: 4900, monthlyChecks: 50_000, perMinute: 300, maxKeys: 10, webhooks: true, lookupKey: "seedenv_swarm_api_growth_monthly", blurb: "Busy comment sections and growing forums." },
  SCALE: { id: "SCALE", name: "Scale", priceCents: 14900, monthlyChecks: 250_000, perMinute: 600, maxKeys: 25, webhooks: true, lookupKey: "seedenv_swarm_api_scale_monthly", blurb: "High-volume platforms and marketplaces." },
};

export const PAID_SWARM_API_PLANS = SWARM_API_PLAN_IDS.filter((id): id is PaidSwarmApiPlanId => id !== "SANDBOX");

export function isPaidPlanId(value: unknown): value is PaidSwarmApiPlanId {
  return typeof value === "string" && (PAID_SWARM_API_PLANS as readonly string[]).includes(value);
}

export function planForLookupKey(lookupKey: string | null | undefined): PaidSwarmApiPlanId | null {
  return PAID_SWARM_API_PLANS.find((id) => SWARM_API_PLANS[id].lookupKey === lookupKey) ?? null;
}

// Stripe statuses that keep paid limits; anything else (past_due, unpaid, canceled, incomplete) falls back to the sandbox.
const ENTITLED_STATUSES = new Set(["active", "trialing"]);

export function effectivePlan(account: { plan: string; subscriptionStatus: string | null }): SwarmApiPlan {
  if (isPaidPlanId(account.plan) && account.subscriptionStatus && ENTITLED_STATUSES.has(account.subscriptionStatus)) {
    return SWARM_API_PLANS[account.plan];
  }
  return SWARM_API_PLANS.SANDBOX;
}

export function usagePeriod(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

export function nextPeriodReset(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
