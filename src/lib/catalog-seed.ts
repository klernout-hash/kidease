/**
 * Chunked catalogue seed runner. Used by the ops script and /api/seed-catalog.
 * Never logs phone / email / website values.
 */

import { DAYCARE_UPSERT_SQL, daycareUpsertParams, type CatalogUpsertInput } from "./catalog-upsert.ts";
import { localCatalogMatchIds, persistLocalLicenseMatches } from "./server/license-match.ts";

export type SeedSql = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

export type SeedChunkResult = {
  attempted: number;
  upserted: number;
  failed: number;
  offset: number;
  nextOffset: number;
  total: number;
  done: boolean;
};

export function clampSeedLimit(raw: number, fallback = 200, max = 500) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, Math.floor(n));
}

export function clampSeedOffset(raw: number, total: number) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(total, Math.floor(n));
}

export async function seedCatalogChunk(
  sql: SeedSql,
  rows: CatalogUpsertInput[],
  opts: { offset?: number; limit?: number; concurrency?: number } = {},
): Promise<SeedChunkResult> {
  const total = rows.length;
  const offset = clampSeedOffset(opts.offset ?? 0, total);
  const limit = clampSeedLimit(opts.limit ?? 200);
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 24, 40));
  const slice = rows.slice(offset, offset + limit);
  let upserted = 0;
  let failed = 0;
  for (let i = 0; i < slice.length; i += concurrency) {
    const batch = slice.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((row) => sql.query(DAYCARE_UPSERT_SQL, daycareUpsertParams(row))),
    );
    for (const result of results) {
      if (result.status === "fulfilled") upserted += 1;
      else failed += 1;
    }
  }
  const matchedIds = localCatalogMatchIds(slice);
  if (matchedIds.length > 0) {
    try {
      await persistLocalLicenseMatches(sql, matchedIds);
    } catch {
      /* Read-time overlay still badges MB matches. Persist is best-effort. */
    }
  }
  const nextOffset = offset + slice.length;
  return {
    attempted: slice.length,
    upserted,
    failed,
    offset,
    nextOffset,
    total,
    done: nextOffset >= total,
  };
}
