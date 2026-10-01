/**
 * Server-only LLM wrapper. Callers pass already-scrubbed text.
 * A timeout, a missing key, or a bad response returns ok: false. It never throws.
 */

import { createHash } from "node:crypto";
import type { ZodType } from "zod";
import { readMemoryCache, writeMemoryCache } from "./cache.ts";
import { costMicros, DEFAULT_INPUT_USD_PER_M, DEFAULT_OUTPUT_USD_PER_M } from "./cost.ts";
import { scrubText } from "./pii.ts";
import { allowAiCall } from "./rate-limit.ts";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MODEL = "grok-4-1-fast-non-reasoning";
const GATEWAY_MODEL = "spacexai/grok-4.1-fast-non-reasoning";
const XAI_URL = "https://api.x.ai/v1/chat/completions";
const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

function resolveEndpoint(env: Record<string, string | undefined>): { url: string; apiKey: string; model: string } | null {
  const gatewayKey = env.AI_GATEWAY_API_KEY?.trim();
  if (gatewayKey) return { url: GATEWAY_URL, apiKey: gatewayKey, model: gatewayModel(env.XAI_MODEL) };
  const apiKey = env.XAI_API_KEY?.trim();
  if (!apiKey) return null;
  return { url: XAI_URL, apiKey, model: env.XAI_MODEL?.trim() || DEFAULT_MODEL };
}

/** Gateway ids are creator/model. The direct xAI id uses hyphens, not dots. */
function gatewayModel(raw: string | undefined): string {
  const model = raw?.trim();
  if (!model || model === DEFAULT_MODEL) return GATEWAY_MODEL;
  if (model.includes("/")) return model;
  return `spacexai/${model}`;
}

export type AiLogRow = {
  feature: string;
  ok: boolean;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  latencyMs: number;
  cacheHit: boolean;
  error?: string;
};

export type AiDeps = {
  fetchImpl?: typeof fetch;
  now?: () => number;
  log?: (row: AiLogRow) => Promise<void> | void;
  readCache?: (key: string) => Promise<string | null> | string | null;
  writeCache?: (key: string, body: string) => Promise<void> | void;
  env?: Record<string, string | undefined>;
};

export type AiSuccess<T> = { ok: true; data: T; cached: boolean; text: string };
export type AiFailure = { ok: false; error: "unconfigured" | "rate_limited" | "timeout" | "invalid" | "upstream" };
export type AiResult<T> = AiSuccess<T> | AiFailure;

function envOf(deps?: AiDeps): Record<string, string | undefined> {
  return deps?.env ?? (typeof process !== "undefined" ? process.env : {});
}

export function aiCacheKey(feature: string, system: string, user: string): string {
  return createHash("sha256").update(`${feature}\n${system}\n${user}`).digest("hex");
}

function parseContent(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

export async function callAi<T = string>(input: {
  feature: string;
  system: string;
  user: string;
  schema?: ZodType<T>;
  timeoutMs?: number;
  maxTokens?: number;
  /** A data URL the model may look at. It is not logged. */
  imageDataUrl?: string | null;
  userId?: string | null;
  ipHash?: string | null;
  deps?: AiDeps;
}): Promise<AiResult<T>> {
  const now = input.deps?.now ?? Date.now;
  const started = now();
  const env = envOf(input.deps);
  const feature = input.feature.trim() || "unknown";
  const image = safeImageDataUrl(input.imageDataUrl);
  const system = scrubText(input.system);
  const user = scrubText(input.user);
  const cacheUser = image ? `${user}\n${createHash("sha256").update(image).digest("hex")}` : user;
  const finish = async (result: AiResult<T>, extra: Partial<AiLogRow> = {}): Promise<AiResult<T>> => {
    await input.deps?.log?.({
      feature,
      ok: result.ok,
      inputTokens: extra.inputTokens ?? 0,
      outputTokens: extra.outputTokens ?? 0,
      costMicros: extra.costMicros ?? 0,
      latencyMs: Math.max(0, now() - started),
      cacheHit: extra.cacheHit ?? false,
      error: result.ok ? undefined : result.error,
    });
    return result;
  };

  if (!allowAiCall({ userId: input.userId, ipHash: input.ipHash, now: started })) {
    return finish({ ok: false, error: "rate_limited" });
  }

  const key = aiCacheKey(feature, system, cacheUser);
  const cached = await (input.deps?.readCache?.(key) ?? readMemoryCache(key, started));
  if (cached) {
    const parsed = applySchema(cached, input.schema);
    if (parsed.ok) return finish({ ok: true, data: parsed.data, cached: true, text: cached }, { cacheHit: true });
  }

  const endpoint = resolveEndpoint(env);
  if (!endpoint) return finish({ ok: false, error: "unconfigured" });

  const { url, apiKey, model } = endpoint;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = input.deps?.fetchImpl ?? fetch;
  let lastError: AiFailure["error"] = "upstream";
  let inputTokens = 0;
  let outputTokens = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          ...(input.maxTokens && input.maxTokens > 0 ? { max_tokens: Math.floor(input.maxTokens) } : {}),
          messages: [
            { role: "system", content: system },
            { role: "user", content: image ? [{ type: "text", text: user }, { type: "image_url", image_url: { url: image } }] : user },
          ],
        }),
        signal: controller.signal,
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = "upstream";
        continue;
      }
      if (!response.ok) return finish({ ok: false, error: "upstream" });
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      inputTokens = body.usage?.prompt_tokens ?? 0;
      outputTokens = body.usage?.completion_tokens ?? 0;
      const text = parseContent(body.choices?.[0]?.message?.content ?? "");
      const parsed = applySchema(text, input.schema);
      if (!parsed.ok) return finish({ ok: false, error: "invalid" }, tokenCost(env, inputTokens, outputTokens));
      const stored = input.schema ? JSON.stringify(parsed.data) : text;
      writeMemoryCache(key, stored, started);
      await input.deps?.writeCache?.(key, stored);
      return finish(
        { ok: true, data: parsed.data, cached: false, text: stored },
        tokenCost(env, inputTokens, outputTokens),
      );
    } catch (err) {
      lastError = err instanceof Error && err.name === "AbortError" ? "timeout" : "upstream";
    } finally {
      clearTimeout(timer);
    }
  }
  return finish({ ok: false, error: lastError }, tokenCost(env, inputTokens, outputTokens));
}

function tokenCost(env: Record<string, string | undefined>, inputTokens: number, outputTokens: number) {
  return {
    inputTokens,
    outputTokens,
    costMicros: costMicros({
      inputTokens,
      outputTokens,
      inputUsdPerM: numberEnv(env.XAI_INPUT_USD_PER_M, DEFAULT_INPUT_USD_PER_M),
      outputUsdPerM: numberEnv(env.XAI_OUTPUT_USD_PER_M, DEFAULT_OUTPUT_USD_PER_M),
    }),
  };
}

function safeImageDataUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value || value.length > 480_000) return null;
  if (!/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) return null;
  return value;
}

function numberEnv(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function applySchema<T>(text: string, schema?: ZodType<T>): { ok: true; data: T } | { ok: false } {
  if (!schema) return { ok: true, data: text as T };
  try {
    const json = JSON.parse(text) as unknown;
    const parsed = schema.safeParse(json);
    if (!parsed.success) return { ok: false };
    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false };
  }
}
