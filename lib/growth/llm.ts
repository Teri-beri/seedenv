import { GoogleGenAI, type Content, type FunctionDeclaration } from "@google/genai";
import type { z } from "zod";
import type { AdapterMode, GrowthConfig } from "@/lib/growth/config";
import type { GrowthLogger } from "@/lib/growth/log";
import { withRetry } from "@/lib/growth/retry";
import { toGeminiSchema } from "@/lib/growth/schemas";

export type GrowthTool = { declaration: FunctionDeclaration; execute: (args: Record<string, unknown>) => Promise<unknown> };
type Models = Pick<GoogleGenAI, "models">["models"];

export type StructuredRequest<T> = { agent: string; system: string; prompt: string; schema: z.ZodType<T>; temperature?: number; mock: () => T };
export type ToolLoopRequest = { agent: string; system: string; prompt: string; tools: Record<string, GrowthTool>; maxRounds?: number; mock: (tools: Record<string, GrowthTool>) => Promise<string> };

export class LlmUnavailableError extends Error {}

export function createLlm(config: GrowthConfig["llm"], logger: GrowthLogger, models?: Models) {
  const mode: AdapterMode = models ? "live" : config.mode;
  const client = mode === "live" ? models ?? new GoogleGenAI({ apiKey: config.apiKey }).models : null;
  const call = (agent: string, request: Parameters<Models["generateContent"]>[0]) => withRetry(() => client!.generateContent({ ...request, config: { ...request.config, abortSignal: AbortSignal.timeout(90_000) } }), { label: `llm:${agent}`, logger });

  function guard(agent: string) {
    if (mode === "disabled") throw new LlmUnavailableError(`LLM is not configured for ${agent}; set GEMINI_API_KEY.`);
  }

  return {
    mode,
    // Asks for JSON matching the schema, validates with Zod, and feeds validation errors back for up to two repair attempts.
    async generateStructured<T>({ agent, system, prompt, schema, temperature = 0.6, mock }: StructuredRequest<T>): Promise<T> {
      guard(agent);
      if (mode === "mock") return schema.parse(mock());
      const contents: Content[] = [{ role: "user", parts: [{ text: prompt }] }];
      let lastIssues = "";
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const response = await call(agent, { model: config.model, contents, config: { systemInstruction: system, temperature, responseMimeType: "application/json", responseJsonSchema: toGeminiSchema(schema), maxOutputTokens: 8192 } });
        const raw = response.text ?? "";
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          lastIssues = "Response was not valid JSON.";
        }
        if (parsed !== undefined) {
          const result = schema.safeParse(parsed);
          if (result.success) return result.data;
          lastIssues = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("\n");
        }
        logger.warn("llm_schema_repair", { agent, attempt, issues: lastIssues.slice(0, 800) });
        contents.push({ role: "model", parts: [{ text: raw.slice(0, 30_000) }] }, { role: "user", parts: [{ text: `Your JSON failed validation:\n${lastIssues}\nReturn the complete corrected JSON object only.` }] });
      }
      throw new Error(`${agent} output failed schema validation after 3 attempts: ${lastIssues.slice(0, 500)}`);
    },

    // Function-calling loop: the model decides which tools to call; the server executes them and returns results until the model answers.
    async runTools({ agent, system, prompt, tools, maxRounds = 6, mock }: ToolLoopRequest): Promise<string> {
      guard(agent);
      if (mode === "mock") return mock(tools);
      const contents: Content[] = [{ role: "user", parts: [{ text: prompt }] }];
      const functionDeclarations = Object.values(tools).map((tool) => tool.declaration);
      for (let round = 0; round < maxRounds; round += 1) {
        const response = await call(agent, { model: config.model, contents, config: { systemInstruction: system, temperature: 0.3, tools: [{ functionDeclarations }], maxOutputTokens: 4096 } });
        const calls = response.functionCalls ?? [];
        if (!calls.length) return response.text?.trim() ?? "";
        const modelContent = response.candidates?.[0]?.content;
        if (modelContent) contents.push(modelContent);
        const parts = await Promise.all(calls.map(async (fn) => {
          const tool = fn.name ? tools[fn.name] : undefined;
          let result: unknown;
          try {
            result = tool ? await tool.execute((fn.args ?? {}) as Record<string, unknown>) : { error: `Unknown tool ${fn.name}` };
          } catch (error) {
            logger.warn("tool_failed", { agent, tool: fn.name, error: error instanceof Error ? error.message : String(error) });
            result = { error: "Tool call failed; continue with the data you have." };
          }
          logger.debug("tool_called", { agent, tool: fn.name });
          return { functionResponse: { id: fn.id, name: fn.name, response: { result } } };
        }));
        contents.push({ role: "user", parts });
      }
      logger.warn("tool_rounds_exhausted", { agent, maxRounds });
      contents.push({ role: "user", parts: [{ text: "Stop calling tools and give your recommendation now using the data above." }] });
      const final = await call(agent, { model: config.model, contents, config: { systemInstruction: system, temperature: 0.3, maxOutputTokens: 4096 } });
      return final.text?.trim() ?? "";
    },
  };
}

export type GrowthLlm = ReturnType<typeof createLlm>;
