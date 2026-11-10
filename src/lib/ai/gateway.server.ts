/**
 * Calls to Google's Gemini API through its OpenAI-compatible endpoint, with the
 * project's own key (free tier). Each task tries its model,
 * then other free models, so one busy model or a used-up daily quota doesn't break
 * the feature. Never retried: a cancel, a timeout, a bad key, or running out of
 * paid credit (402).
 */
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { geminiModel, modelFor, reasoningOptions, type AiTask } from "./models.server";

export const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
/** Free models tried after the configured one; overridable with AI_FALLBACK_MODELS. */
export const DEFAULT_FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite",
];

/** Where the key may be saved. GEMINI_API_KEY is the documented one. */
const KEY_NAMES = [
  "GEMINI_API_KEY",
  "GEMINI_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_AI_API_KEY",
  "GOOGLE_API_KEY",
  "GOOGLE_AI_STUDIO_KEY",
];

/** The Gemini key from the environment (Vercel), cleaned of pasted spaces or quotes. */
export function geminiKey(env: Record<string, string | undefined> = process.env): string | null {
  for (const name of KEY_NAMES) {
    const key = (env[name] ?? "")
      .trim()
      .replace(/^["']|["']$/g, "")
      .trim();
    if (key) return key;
  }
  return null;
}

export interface AiAttempt {
  label: string;
  model: LanguageModel;
  providerOptions?: ReturnType<typeof reasoningOptions>;
}

export function fallbackModels(env: Record<string, string | undefined> = process.env): string[] {
  const list = (env["AI_FALLBACK_MODELS"] ?? "")
    .split(",")
    .map((s) => geminiModel(s))
    .filter((s): s is string => !!s);
  return list.length ? list : DEFAULT_FALLBACK_MODELS;
}

/** The attempts for a task, in order: the task's model, then each fallback once. */
export function aiAttempts(apiKey: string, task: AiTask): AiAttempt[] {
  const provider = createOpenAI({ baseURL: GEMINI_URL, apiKey, name: "gemini" });
  const models = [modelFor(task), ...fallbackModels()];
  return [...new Set(models)].map((m) => ({
    label: m,
    model: provider.chat(m),
    providerOptions: reasoningOptions(task),
  }));
}

/** HTTP status and the service's own message for a failed call, safe to show. */
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
        // Gemini wraps errors in a one-item array; the OpenAI shape is a plain object.
        const parsed = JSON.parse(x.responseBody) as unknown;
        const body = (Array.isArray(parsed) ? parsed[0] : parsed) as {
          message?: string;
          error?: { message?: string } | string;
        };
        detail =
          body?.message ??
          (typeof body?.error === "string" ? body.error : body?.error?.message) ??
          "";
      } catch {
        detail = x.responseBody.slice(0, 200);
      }
    }
  }
  if (!detail) detail = (chain[0] as { message?: string })?.message ?? "";
  // Gemini answers a wrong key with 400; treat it as the auth error it is.
  if (status === 400 && /api key not valid|api_key_invalid/i.test(detail)) status = 401;
  // Never echo anything that looks like a key back to the browser.
  detail = detail
    .replace(/(sk|key|token)[-_a-z0-9]{12,}/gi, "[hidden]")
    .replace(/AIza[-_a-z0-9]{20,}/gi, "[hidden]")
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
 * when they all fail: a busy or rate-limited answer only if nothing said more.
 */
export async function withFallbacks<T>(
  attempts: AiAttempt[],
  call: (attempt: AiAttempt) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let best: unknown = null;
  for (const attempt of attempts) {
    try {
      return await call(attempt);
    } catch (err) {
      if (signal?.aborted || isAbort(err)) throw err;
      const { status, detail } = aiErrorInfo(err);
      console.error(`AI attempt failed: ${attempt.label}`, status, detail);
      // A bad key or no paid credit: every other model would fail the same way.
      if (status === 401 || status === 402 || status === 403) throw err;
      // Prefer a real reason over "busy" (503) or "quota used up" (429).
      const bestStatus = best ? aiErrorInfo(best).status : 0;
      if (!best || ((bestStatus === 429 || bestStatus === 503) && status !== 429 && status !== 503))
        best = err;
    }
  }
  throw best;
}
