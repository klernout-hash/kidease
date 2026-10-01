/**
 * Server-side PostHog read. The browser SDK stays off until Allow, so this
 * is what production actually evaluates. Ranking uses the same read.
 */

import { flagsHost } from "../flags.ts";
import {
  parseAiFlagSnapshot,
  sanitizeAiDistinctId,
  SERVER_FLAG_KEYS,
  type AiFlagSnapshot,
} from "./flag-gate.ts";

const TTL_MS = 30_000;
const TIMEOUT_MS = 4_000;
const REPORT_GAP_MS = 60_000;

type CacheRow = { at: number; snapshot: AiFlagSnapshot };

const cache = new Map<string, CacheRow>();
const inflight = new Map<string, Promise<AiFlagSnapshot>>();
let reportedAt = 0;

export function resetAiFlagFetchForTests(): void {
  cache.clear();
  inflight.clear();
  reportedAt = 0;
}

function projectKey(env: Record<string, string | undefined>): string {
  return String(env.POSTHOG_FLAGS_KEY || env.VITE_PUBLIC_POSTHOG_KEY || "").trim();
}

async function reportFlagCalls(input: {
  host: string;
  apiKey: string;
  distinctId: string;
  snapshot: AiFlagSnapshot;
  fetchImpl: typeof fetch;
}): Promise<void> {
  const batch = SERVER_FLAG_KEYS.map((key) => {
    const value = input.snapshot.flags[key];
    return {
      event: "$feature_flag_called",
      distinct_id: input.distinctId,
      properties: {
        distinct_id: input.distinctId,
        $feature_flag: key,
        $feature_flag_response: value === true,
      },
    };
  });
  if (!batch.length) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    await input.fetchImpl(`${input.host}/batch/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: input.apiKey, batch }),
      signal: controller.signal,
    });
  } catch {
    /* The visible decision already stands. */
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAiFeatureFlags(input: {
  distinctId?: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<AiFlagSnapshot> {
  const env = input.env ?? (typeof process !== "undefined" ? process.env : {});
  const distinctId = sanitizeAiDistinctId(input.distinctId);
  const now = input.now ?? Date.now();
  const hit = cache.get(distinctId);
  if (hit && now - hit.at < TTL_MS) return hit.snapshot;
  const pending = inflight.get(distinctId);
  if (pending) return pending;
  const run = loadAiFeatureFlags({ distinctId, env, fetchImpl: input.fetchImpl ?? fetch, now });
  inflight.set(distinctId, run);
  try {
    return await run;
  } finally {
    inflight.delete(distinctId);
  }
}

async function loadAiFeatureFlags(input: {
  distinctId: string;
  env: Record<string, string | undefined>;
  fetchImpl: typeof fetch;
  now: number;
}): Promise<AiFlagSnapshot> {
  const apiKey = projectKey(input.env);
  if (!apiKey) return { reached: false, flags: {} };
  const host = flagsHost(input.env).replace(/\/$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await input.fetchImpl(`${host}/flags?v=2`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        distinct_id: input.distinctId,
        flag_keys: [...SERVER_FLAG_KEYS],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { reached: false, flags: {} };
    const snapshot = parseAiFlagSnapshot(await res.json(), SERVER_FLAG_KEYS);
    if (!snapshot.reached) return snapshot;
    cache.set(input.distinctId, { at: input.now, snapshot });
    if (reportedAt === 0 || input.now - reportedAt >= REPORT_GAP_MS) {
      reportedAt = input.now;
      await reportFlagCalls({
        host,
        apiKey,
        distinctId: input.distinctId,
        snapshot,
        fetchImpl: input.fetchImpl,
      });
    }
    return snapshot;
  } catch {
    return { reached: false, flags: {} };
  } finally {
    clearTimeout(timer);
  }
}
