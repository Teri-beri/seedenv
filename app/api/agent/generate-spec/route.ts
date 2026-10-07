import { NextResponse } from "next/server";
import { AiUnavailableError, getGeminiClient } from "@/lib/ai/gemini-client";
import { runSpecArchitectAgent, specArchitectInputSchema } from "@/lib/ai/agents/spec-architect.agent";
import { allowAgentCall, jsonError, noStore, parseJsonBody, resolveAgentCaller } from "@/lib/ai/agent-route";
import { createLogger } from "@/lib/growth/log";

export const maxDuration = 90;
const logger = createLogger({ scope: "qa-ai" });

// Drafts a cohort blueprint for the campaign wizard. Nothing is saved; the developer edits and submits the form as usual.
export async function POST(request: Request) {
  const caller = await resolveAgentCaller(request, { allowCron: false });
  if (caller instanceof NextResponse) return caller;
  if (caller.kind !== "member" || (caller.role !== "DEVELOPER" && !caller.admin)) return jsonError("Switch to your developer workspace to draft cohorts.", 403);
  const body = await parseJsonBody(request, specArchitectInputSchema);
  if (body instanceof NextResponse) return body;
  if (!allowAgentCall(`spec:${caller.id}`, 10, Number(process.env.QA_AI_DAILY_LIMIT || 2000))) return jsonError("You've drafted a lot of cohorts this hour. Try again later.", 429);
  try {
    const blueprint = await runSpecArchitectAgent(getGeminiClient(), body);
    return NextResponse.json({ blueprint }, { headers: noStore });
  } catch (error) {
    logger.error("qa_ai_admin_alert", { agent: "spec-architect", error });
    if (error instanceof AiUnavailableError) return jsonError("AI drafting is not available right now. Fill in the form manually.", 503);
    return jsonError("The AI draft could not be generated right now. Try again, or fill in the form manually.", 503);
  }
}
