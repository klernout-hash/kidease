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

export type CatalogRuntime = {
  preferred: boolean;
  runtime: "neon" | "json";
  publicCount: number;
  minCount: number;
  source: CatalogSource;
  reason: string;
};

/**
 * Operator-facing honesty for Admin. Neon is SoT when preferred.
 * Git JSON / Drive CSV are seed or emergency fallback — never reintroduced
 * as runtime truth just because a master file exists.
 */
export function describeCatalogRuntime(input: {
  source?: CatalogSource;
  neonAvailable: boolean;
  publicCount: number;
  minCount?: number;
}): CatalogRuntime {
  const source = input.source ?? "auto";
  const publicCount = Number(input.publicCount) || 0;
  const minCount = input.minCount ?? NEON_CATALOG_MIN_COUNT;
  const preferred = preferNeonCatalog({ ...input, source, publicCount, minCount });
  if (preferred) {
    return {
      preferred: true,
      runtime: "neon",
      publicCount,
      minCount,
      source,
      reason: `Neon is the licensed catalogue source of truth (${publicCount.toLocaleString("en-CA")} public rows). Git JSON and Drive CSV are seed-only.`,
    };
  }
  if (source === "json") {
    return {
      preferred: false,
      runtime: "json",
      publicCount,
      minCount,
      source,
      reason: "CATALOG_SOURCE=json emergency fallback. Neon is not being read. Drive CSV is still not runtime truth.",
    };
  }
  if (!input.neonAvailable) {
    return {
      preferred: false,
      runtime: "json",
      publicCount,
      minCount,
      source,
      reason: "Neon unreachable. Bundled JSON is the cold fallback until the national table is available.",
    };
  }
  if (publicCount <= 0) {
    return {
      preferred: false,
      runtime: "json",
      publicCount,
      minCount,
      source,
      reason: "Neon has no public rows yet. Seed from centres.json; do not treat Drive / Git CSV as runtime truth.",
    };
  }
  return {
    preferred: false,
    runtime: "json",
    publicCount,
    minCount,
    source,
    reason: `Neon public count (${publicCount.toLocaleString("en-CA")}) is below the national threshold (${minCount.toLocaleString("en-CA")}). JSON is the cold fallback.`,
  };
}
