/**
 * Chunked catalogue seed runner. Used by the ops script and /api/seed-catalog.
 * Never logs phone / email / website values.
 */

import { DAYCARE_UPSERT_SQL, daycareUpsertParams, type CatalogUpsertInput } from "./catalog-upsert.ts";
import { isAdminOnlyListing, type ListingVisibilityInput } from "./listing-visibility.ts";
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

/**
 * Local + Vercel Preview keep the claim-lab ghost. Vercel Production and
 * NODE_ENV=production do not write fixtures. Override with ALLOW_TEST_LISTINGS=1|0.
 */
export function allowSeedTestListings(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const flag = (env.ALLOW_TEST_LISTINGS || "").trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  if ((env.VERCEL_ENV || "").trim() === "production") return false;
  if ((env.NODE_ENV || "").trim() === "production" && (env.VERCEL_ENV || "").trim() !== "preview") {
    return false;
  }
  return true;
}

export function catalogRowsForSeed<T extends ListingVisibilityInput>(
  rows: T[],
  env: Record<string, string | undefined> = process.env,
): T[] {
  if (allowSeedTestListings(env)) return rows;
  return rows.filter((row) => !isAdminOnlyListing(row));
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
