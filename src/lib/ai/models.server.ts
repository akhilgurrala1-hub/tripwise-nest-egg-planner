/**
 * Which model each AI task runs on, and how hard it thinks. Defaults keep today's
 * cost; a stronger model can be switched on without a code change by setting
 * these secrets in Lovable Cloud (every call goes through the Lovable AI gateway):
 *
 * - AI_PLANNER_MODEL / AI_CHAT_MODEL: a gateway model id, e.g. "openai/gpt-6-astra"
 * - AI_PLANNER_EFFORT / AI_CHAT_EFFORT: "low" (default), "medium" or "high"
 *
 * More effort or a bigger model gives better plans but spends more AI credits per
 * request, so raise them only once the budget allows.
 */
export const DEFAULT_MODEL = "openai/gpt-6-astra";

export type AiTask = "planner" | "chat";
export type Effort = "low" | "medium" | "high";

const MODEL_ID = /^[a-z0-9-]+\/[a-z0-9][a-z0-9.\-:]*$/i;

export function modelFor(task: AiTask, env: Record<string, string | undefined> = process.env) {
  const v = env[task === "planner" ? "AI_PLANNER_MODEL" : "AI_CHAT_MODEL"]?.trim() ?? "";
  return MODEL_ID.test(v) ? v : DEFAULT_MODEL;
}

export function effortFor(
  task: AiTask,
  env: Record<string, string | undefined> = process.env,
): Effort {
  const v = env[task === "planner" ? "AI_PLANNER_EFFORT" : "AI_CHAT_EFFORT"]?.trim().toLowerCase();
  return v === "medium" || v === "high" ? v : "low";
}

/** Provider options shared by every call: reasoning on, nothing stored by the provider. */
export function reasoningOptions(task: AiTask) {
  return {
    openai: {
      forceReasoning: true,
      reasoningEffort: effortFor(task),
      reasoningSummary: "auto",
      store: false,
      include: ["reasoning.encrypted_content"],
    },
  };
}
