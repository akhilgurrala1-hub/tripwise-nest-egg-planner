/**
 * Calls to the Lovable AI gateway, with fallbacks so one unavailable model or
 * request style doesn't break the feature:
 *   1. the configured model through the Responses API, with reasoning on
 *   2. the same model through plain chat completions
 *   3. fallback models (cheap, widely available), through chat completions
 * Only failures another attempt could fix are retried: never a cancel, a timeout,
 * running out of credits (402) or being rate limited (429).
 */
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { modelFor, reasoningOptions, type AiTask } from "./models.server";
import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
/** Used when the configured model fails; overridable with AI_FALLBACK_MODELS (comma-separated). */
export const DEFAULT_FALLBACK_MODELS = ["google/gemini-3.7-flash", "google/gemini-2.5-flash"];

export interface AiAttempt {
  label: string;
  model: LanguageModel;
  providerOptions?: ReturnType<typeof reasoningOptions>;
}

export function fallbackModels(env: Record<string, string | undefined> = process.env): string[] {
  const list = (env["AI_FALLBACK_MODELS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9-]+\/[a-z0-9][a-z0-9.\-:]*$/i.test(s));
  return list.length ? list : DEFAULT_FALLBACK_MODELS;
}

/** The attempts for a task, in order. */
export function aiAttempts(apiKey: string, task: AiTask): AiAttempt[] {
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  const primary = modelFor(task);
  return [
    {
      label: `${primary} (responses)`,
      model: provider.responses(primary),
      providerOptions: reasoningOptions(task),
    },
    { label: `${primary} (chat)`, model: provider.chat(primary) },
    ...fallbackModels()
      .filter((m) => m !== primary)
      .map((m) => ({ label: m, model: provider.chat(m) })),
  ];
}

/** HTTP status and the gateway's own message for a failed call, safe to show. */
export function aiErrorInfo(err: unknown): { status: number; detail: string } {
  const chain: unknown[] = [];
  for (let e: unknown = err, i = 0; e && i < 5; i++) {
    chain.push(e);
    e =
      (e as { cause?: unknown; lastError?: unknown }).lastError ?? (e as { cause?: unknown }).cause;
  }
  let status = 0;
  let detail = "";
  for (const e of chain) {
    const x = e as {
      statusCode?: number;
      status?: number;
      responseBody?: string;
      message?: string;
    };
    status ||= Number(x.statusCode ?? x.status) || 0;
    if (!detail && x.responseBody) {
      try {
        const body = JSON.parse(x.responseBody) as {
          message?: string;
          error?: { message?: string } | string;
        };
        detail =
          body.message ?? (typeof body.error === "string" ? body.error : body.error?.message) ?? "";
      } catch {
        detail = x.responseBody.slice(0, 200);
      }
    }
  }
  if (!detail) detail = (chain[0] as { message?: string })?.message ?? "";
  // Never echo anything that looks like a key back to the browser.
  detail = detail
    .replace(/(sk|key|token)[-_a-z0-9]{12,}/gi, "[hidden]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return { status: status || 500, detail };
}

const isAbort = (err: unknown) => {
  const name = (err as { name?: string })?.name;
  return name === "AbortError" || name === "TimeoutError";
};

/**
 * Run `call` with each attempt until one succeeds. Throws the most useful error
 * (the first attempt's, unless a later one says more) when they all fail.
 */
export async function withFallbacks<T>(
  attempts: AiAttempt[],
  call: (attempt: AiAttempt) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let first: unknown = null;
  for (const attempt of attempts) {
    try {
      return await call(attempt);
    } catch (err) {
      if (signal?.aborted || isAbort(err)) throw err;
      first ??= err;
      const { status } = aiErrorInfo(err);
      console.error(`AI attempt failed: ${attempt.label}`, status, aiErrorInfo(err).detail);
      // Out of credits or rate limited: another model won't help, and would spend more.
      if (status === 402 || status === 429) throw err;
    }
  }
  throw first;
}
