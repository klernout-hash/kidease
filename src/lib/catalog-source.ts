/**
 * When Neon should be the licensed-listing source of truth.
 * JSON (centres.json + extras) stays the cold fallback.
 */

export const CATALOG_SOURCE_ENV = "CATALOG_SOURCE";
export const NEON_CATALOG_MIN_COUNT_ENV = "NEON_CATALOG_MIN_COUNT";

/** Auto-flip to Neon once the public table looks like a national catalogue. */
export const NEON_CATALOG_MIN_COUNT = 10_000;

export type CatalogSource = "auto" | "neon" | "json";

type EnvMap = Record<string, string | undefined>;

export function catalogSourceFromEnv(env: EnvMap = process.env): CatalogSource {
  const raw = String(env[CATALOG_SOURCE_ENV] || "auto")
    .trim()
    .toLowerCase();
  if (raw === "neon" || raw === "json") return raw;
  return "auto";
}

export function neonCatalogMinCount(env: EnvMap = process.env): number {
  const raw = Number(env[NEON_CATALOG_MIN_COUNT_ENV]);
  if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
  return NEON_CATALOG_MIN_COUNT;
}

/**
 * Prefer Neon when the operator forced it and at least one public row exists,
 * or when auto mode sees a national-scale public count.
 */
export function preferNeonCatalog(input: {
  source?: CatalogSource;
  neonAvailable: boolean;
  publicCount: number;
  minCount?: number;
}): boolean {
  if (!input.neonAvailable) return false;
  const count = Number(input.publicCount) || 0;
  if (count <= 0) return false;
  const source = input.source ?? "auto";
  if (source === "json") return false;
  if (source === "neon") return true;
  return count >= (input.minCount ?? NEON_CATALOG_MIN_COUNT);
}
