import { z } from "zod";

const flag = z.enum(["true", "false"]).optional().transform((value) => value === "true");
const number = (fallback: number) => z.coerce.number().positive().optional().transform((value) => value ?? fallback);

const envSchema = z.object({
  NODE_ENV: z.string().optional(),
  GROWTH_ENABLED: flag,
  GROWTH_ALLOW_MOCKS: flag,
  GROWTH_SEED_KEYWORDS: z.string().optional(),
  GROWTH_CONTENT_MIN_INTERVAL_DAYS: z.coerce.number().min(0).max(60).optional(),
  GROWTH_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  GROWTH_APPROVAL_SECRET: z.string().min(32).optional(),
  GEMINI_API_KEY: z.string().optional(),
  GROWTH_LLM_MODEL: z.string().optional(),
  DATAFORSEO_LOGIN: z.string().optional(),
  DATAFORSEO_PASSWORD: z.string().optional(),
  DATAFORSEO_LOCATION_CODE: z.coerce.number().int().optional(),
  AYRSHARE_API_KEY: z.string().optional(),
  CMS_PUBLISH_WEBHOOK_URL: z.string().url().optional(),
  CMS_PUBLISH_WEBHOOK_SECRET: z.string().optional(),
  META_ADS_ACCESS_TOKEN: z.string().optional(),
  META_AD_ACCOUNT_ID: z.string().regex(/^(act_)?\d+$/).optional(),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).optional(),
  META_CONVERSION_ACTION: z.string().optional(),
  AD_LOOKBACK: z.enum(["today", "yesterday", "last_3d", "last_7d"]).optional(),
  AD_THRESHOLD_CPA: number(25),
  AD_MIN_SPEND: number(10),
  AD_ALERT_RATIO: z.coerce.number().min(0.1).max(1).optional().transform((value) => value ?? 0.8),
  AD_KILLSWITCH_ENFORCE: flag,
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
});

export type GrowthConfig = ReturnType<typeof loadGrowthConfig>;
export type AdapterMode = "live" | "mock" | "disabled";

const DEFAULT_KEYWORDS = ["beta testing platform", "find beta testers for app", "testflight beta testers", "google play 12 testers 14 days", "paid app testing", "usability testing for mobile apps"];

export function loadGrowthConfig(env: Record<string, string | undefined> = process.env) {
  const parsed = envSchema.safeParse(Object.fromEntries(Object.entries(env).map(([key, value]) => [key, value === "" ? undefined : value])));
  if (!parsed.success) throw new Error(`Invalid growth configuration: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`);
  const e = parsed.data;
  const production = e.NODE_ENV === "production";
  // Missing credentials fall back to mocks only outside production (or when explicitly allowed), so production never stores fabricated data.
  const mode = (configured: boolean): AdapterMode => configured ? "live" : !production || e.GROWTH_ALLOW_MOCKS ? "mock" : "disabled";
  return {
    enabled: e.GROWTH_ENABLED,
    production,
    siteUrl: (e.GROWTH_SITE_URL ?? e.NEXT_PUBLIC_APP_URL ?? "https://seedenv.com").replace(/\/$/, ""),
    seedKeywords: e.GROWTH_SEED_KEYWORDS ? e.GROWTH_SEED_KEYWORDS.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean) : DEFAULT_KEYWORDS,
    approvalSecret: e.GROWTH_APPROVAL_SECRET,
    contentMinIntervalDays: e.GROWTH_CONTENT_MIN_INTERVAL_DAYS ?? 6,
    llm: { mode: mode(Boolean(e.GEMINI_API_KEY)), apiKey: e.GEMINI_API_KEY, model: e.GROWTH_LLM_MODEL ?? "gemini-3.1-flash-lite" },
    keywords: { mode: mode(Boolean(e.DATAFORSEO_LOGIN && e.DATAFORSEO_PASSWORD)), login: e.DATAFORSEO_LOGIN, password: e.DATAFORSEO_PASSWORD, locationCode: e.DATAFORSEO_LOCATION_CODE ?? 2840 },
    social: { mode: mode(Boolean(e.AYRSHARE_API_KEY)), apiKey: e.AYRSHARE_API_KEY },
    cms: { publishWebhookUrl: e.CMS_PUBLISH_WEBHOOK_URL, publishWebhookSecret: e.CMS_PUBLISH_WEBHOOK_SECRET },
    ads: {
      mode: mode(Boolean(e.META_ADS_ACCESS_TOKEN && e.META_AD_ACCOUNT_ID)),
      accessToken: e.META_ADS_ACCESS_TOKEN,
      accountId: e.META_AD_ACCOUNT_ID ? (e.META_AD_ACCOUNT_ID.startsWith("act_") ? e.META_AD_ACCOUNT_ID : `act_${e.META_AD_ACCOUNT_ID}`) : undefined,
      graphVersion: e.META_GRAPH_VERSION ?? "v26.0",
      conversionAction: e.META_CONVERSION_ACTION ?? "offsite_conversion.fb_pixel_complete_registration",
      lookback: e.AD_LOOKBACK ?? "last_3d",
      thresholdCpa: e.AD_THRESHOLD_CPA,
      minSpend: e.AD_MIN_SPEND,
      alertRatio: e.AD_ALERT_RATIO,
      enforce: e.AD_KILLSWITCH_ENFORCE,
    },
    notify: { slackWebhookUrl: e.SLACK_WEBHOOK_URL, discordWebhookUrl: e.DISCORD_WEBHOOK_URL, telegramBotToken: e.TELEGRAM_BOT_TOKEN, telegramChatId: e.TELEGRAM_CHAT_ID },
  };
}
