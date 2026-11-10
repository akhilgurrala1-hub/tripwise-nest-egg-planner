/**
 * Which Gemini model each AI task runs on, and how hard it thinks. Every call goes
 * to Google's Gemini API (free tier) with the project's own key.
 *
 * Optional environment variables change the defaults without a code change:
 * - AI_PLANNER_MODEL / AI_CHAT_MODEL: a Gemini model id, e.g. "gemini-3.8-flash"
 * - AI_PLANNER_EFFORT / AI_CHAT_EFFORT: "low" (default), "medium" or "high"
 * - AI_FALLBACK_MODELS: comma-separated Gemini ids tried when the first is busy
 *
 * Free-tier quotas are per model and per day, so the fallbacks are other free
 * models: when one is busy or used up, the next still answers.
 */
export const DEFAULT_MODEL = "gemini-3.6-flash";

export type AiTask = "planner" | "chat";
export type Effort = "low" | "medium" | "high";

/**
 * A Gemini or Gemma id, with an optional "google/" or "models/" prefix (dropped).
 * Anything else, such as an old gateway id like "openai/gpt-6-astra", is ignored.
 */
export function geminiModel(raw: string | undefined): string | null {
  const v = (raw ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^(google|models)\//i, "")
    .toLowerCase();
  return /^(gemini|gemma)-[a-z0-9][a-z0-9.-]*$/.test(v) ? v : null;
}

export function modelFor(task: AiTask, env: Record<string, string | undefined> = process.env) {
  return (
    geminiModel(env[task === "planner" ? "AI_PLANNER_MODEL" : "AI_CHAT_MODEL"]) ?? DEFAULT_MODEL
  );
}

export function effortFor(
  task: AiTask,
  env: Record<string, string | undefined> = process.env,
): Effort {
  const v = env[task === "planner" ? "AI_PLANNER_EFFORT" : "AI_CHAT_EFFORT"]?.trim().toLowerCase();
  return v === "medium" || v === "high" ? v : "low";
}

/** Provider options for every call: Gemini maps reasoning_effort onto its thinking level. */
export function reasoningOptions(
  task: AiTask,
  env: Record<string, string | undefined> = process.env,
) {
  return { openai: { reasoningEffort: effortFor(task, env) } };
}
