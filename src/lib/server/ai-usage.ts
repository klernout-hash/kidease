import { getSql } from "@/lib/db";
import { AI_CACHE_TTL_MS } from "@/lib/ai/cache";
import type { AiLogRow } from "@/lib/ai/client";
import { summarizeAiCalls, type AiFeatureUsage } from "@/lib/ai/usage";
import { nid } from "@/lib/utils";

export async function logAiCall(row: AiLogRow) {
  try {
    const sql = await getSql();
    await sql`
      insert into ai_calls (
        id, feature, ok, input_tokens, output_tokens, cost_micros, latency_ms, cache_hit, error
      ) values (
        ${nid("ai")},
        ${row.feature.slice(0, 80)},
        ${row.ok},
        ${row.inputTokens},
        ${row.outputTokens},
        ${row.costMicros},
        ${row.latencyMs},
        ${row.cacheHit},
        ${row.error ?? null}
      )
    `;
  } catch (err) {
    console.error("[kidease-ai] log skipped", err instanceof Error ? err.message : "failed");
  }
}

export async function readAiCache(key: string): Promise<string | null> {
  try {
    const sql = await getSql();
    const rows = await sql<{ response_text: string }>`
      select response_text from ai_cache
      where cache_key = ${key} and expires_at > now()
      limit 1
    `;
    return rows[0]?.response_text ?? null;
  } catch {
    return null;
  }
}

export async function writeAiCache(feature: string, key: string, body: string) {
  try {
    const sql = await getSql();
    const expires = new Date(Date.now() + AI_CACHE_TTL_MS).toISOString();
    await sql`
      insert into ai_cache (cache_key, feature, response_text, expires_at)
      values (${key}, ${feature.slice(0, 80)}, ${body}, ${expires})
      on conflict (cache_key) do update
        set response_text = excluded.response_text,
            expires_at = excluded.expires_at
    `;
  } catch (err) {
    console.error("[kidease-ai] cache skipped", err instanceof Error ? err.message : "failed");
  }
}

export async function listAiUsage(): Promise<AiFeatureUsage[]> {
  try {
    const sql = await getSql();
    const rows = await sql<{
      feature: string;
      ok: boolean;
      cost_micros: number;
    }>`
      select feature, ok, cost_micros
      from ai_calls
      where created_at > now() - interval '30 days'
    `;
    return summarizeAiCalls(
      rows.map((row) => ({
        feature: row.feature,
        ok: Boolean(row.ok),
        costMicros: Number(row.cost_micros) || 0,
      })),
    );
  } catch (err) {
    console.error("[kidease-ai] usage skipped", err instanceof Error ? err.message : "failed");
    return [];
  }
}
