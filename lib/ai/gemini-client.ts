import { GoogleGenAI, type Content, type Part } from "@google/genai";
import type { z } from "zod";
import { createLogger, type GrowthLogger } from "@/lib/growth/log";
import { withRetry } from "@/lib/growth/retry";
import { toGeminiSchema } from "@/lib/growth/schemas";

// Same model family the live support assistant uses; override per workload with env vars.
export const QA_DEFAULT_TEXT_MODEL = "gemini-3.1-flash-lite";
export const QA_DEFAULT_VISION_MODEL = "gemini-3.1-flash-lite";

export type GeminiModels = Pick<GoogleGenAI, "models">["models"];
export type ModelTier = "text" | "vision";

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export type InlineMedia = { data: Buffer; mimeType: string };

export type StructuredCall<T> = {
  agent: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  tier?: ModelTier;
  media?: InlineMedia[];
  temperature?: number;
  maxOutputTokens?: number;
};

export type GeminiClient = {
  readonly configured: boolean;
  modelFor(tier: ModelTier): string;
  generateStructured<T>(call: StructuredCall<T>): Promise<T>;
};

export type GeminiClientOptions = {
  apiKey?: string;
  models?: GeminiModels;
  textModel?: string;
  visionModel?: string;
  logger?: GrowthLogger;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

export function createGeminiClient(options: GeminiClientOptions = {}): GeminiClient {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  const models = options.models ?? (apiKey ? new GoogleGenAI({ apiKey }).models : null);
  const logger = options.logger ?? createLogger({ scope: "qa-ai" });
  const textModel = options.textModel ?? process.env.GEMINI_QA_TEXT_MODEL ?? QA_DEFAULT_TEXT_MODEL;
  const visionModel = options.visionModel ?? process.env.GEMINI_QA_VISION_MODEL ?? QA_DEFAULT_VISION_MODEL;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const modelFor = (tier: ModelTier) => (tier === "vision" ? visionModel : textModel);

  return {
    configured: Boolean(models),
    modelFor,
    // JSON-mode call validated with Zod; validation errors are fed back to the model for up to two repairs.
    async generateStructured<T>({ agent, system, prompt, schema, tier = "text", media = [], temperature = 0.2, maxOutputTokens = 4096 }: StructuredCall<T>): Promise<T> {
      if (!models) throw new AiUnavailableError("GEMINI_API_KEY is not configured.");
      const model = modelFor(tier);
      const parts: Part[] = [...media.map((item) => ({ inlineData: { data: item.data.toString("base64"), mimeType: item.mimeType } })), { text: prompt }];
      const contents: Content[] = [{ role: "user", parts }];
      const responseJsonSchema = toGeminiSchema(schema);
      let issues = "";
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const response = await withRetry(
          () => models.generateContent({ model, contents, config: { systemInstruction: system, temperature, responseMimeType: "application/json", responseJsonSchema, maxOutputTokens, abortSignal: AbortSignal.timeout(timeoutMs) } }),
          { label: `qa-ai:${agent}`, logger, attempts: 3, sleep: options.sleep },
        );
        const raw = response.text ?? "";
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          issues = "Response was not valid JSON.";
        }
        if (parsed !== undefined) {
          const result = schema.safeParse(parsed);
          if (result.success) return result.data;
          issues = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n");
        }
        logger.warn("qa_ai_schema_repair", { agent, attempt, issues: issues.slice(0, 600) });
        contents.push({ role: "model", parts: [{ text: raw.slice(0, 20_000) }] }, { role: "user", parts: [{ text: `Your JSON failed validation:\n${issues}\nReturn the complete corrected JSON object only.` }] });
      }
      throw new Error(`${agent} output failed schema validation after 3 attempts: ${issues.slice(0, 400)}`);
    },
  };
}

let shared: GeminiClient | null = null;

export function getGeminiClient() {
  shared ??= createGeminiClient();
  return shared;
}

// Untrusted user text goes inside clearly delimited blocks so instructions inside it are treated as data.
export function untrusted(label: string, value: string | null | undefined, max = 4000) {
  const text = (value ?? "").replace(/<\/?untrusted[^>]*>/gi, "").slice(0, max);
  return `<untrusted name="${label}">\n${text || "(empty)"}\n</untrusted>`;
}
