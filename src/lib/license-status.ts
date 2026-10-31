/** Shared licence / registry status helpers. No path aliases — safe for Node tests and seed. */

export const LICENSE_STATUSES = ["unverified", "matched", "expired", "suspended"] as const;
export type LicenseStatus = (typeof LICENSE_STATUSES)[number];

export const REGISTRY_MATCH_STATES = ["unmatched", "pending", "matched", "mismatch"] as const;
export type RegistryMatchState = (typeof REGISTRY_MATCH_STATES)[number];

export function normalizeLicenseStatus(raw?: string | null): LicenseStatus {
  const v = (raw || "").trim().toLowerCase();
  if (v === "matched" || v === "active") return "matched";
  if (v === "expired") return "expired";
  if (v === "suspended" || v === "revoked") return "suspended";
  return "unverified";
}

export function normalizeMatchState(raw?: string | null): RegistryMatchState {
  const v = (raw || "").trim().toLowerCase();
  if (v === "matched") return "matched";
  if (v === "pending") return "pending";
  if (v === "mismatch") return "mismatch";
  return "unmatched";
}

/** Operator / admin review — the only way a stub province may stay matched. */
export const OPERATOR_LICENSE_SOURCES = ["admin", "provider"] as const;

export function isOperatorLicenseSource(source?: string | null) {
  const v = (source || "").trim().toLowerCase();
  return (OPERATOR_LICENSE_SOURCES as readonly string[]).includes(v);
}

export function isLocalCatalogSource(source?: string | null) {
  return (source || "").trim().toLowerCase() === "local_catalog";
}

/**
 * Neon returns timestamptz as a Date. Optional `.trim()` throws in Safari
 * when the value is present but not a string, which takes down search and saved.
 */
export function licenceVerifiedStamp(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  return "";
}

/**
 * Parent-facing "Licence verified" only after an operator confirmation.
 * A catalogue snapshot, a blank timestamp, or an expired/suspended licence never qualifies.
 */
export type LicenceCoverageCounts = { listings: number; verified: number };

/** Share of public listings with an operator licence check. Null when the province has no rows. */
export function licenceCoveragePercent(row: LicenceCoverageCounts): number | null {
  const listings = Math.max(0, Math.floor(row.listings) || 0);
  const verified = Math.max(0, Math.floor(row.verified) || 0);
  if (!listings) return null;
  return Math.round((Math.min(verified, listings) / listings) * 1000) / 10;
}

/** Visible suffix for the licence badge, such as "verified on Oct 31, 2026". */
export function licenceVerifiedExtra(formattedDate: string, phrase: string): string {
  const date = formattedDate.trim();
  const lead = phrase.trim();
  if (!date || !lead) return "";
  return `${lead} ${date}`;
}

export function showLicenceVerifiedBadge(input: {
  licenseStatus?: string | null;
  registryMatchState?: string | null;
  licenseVerificationSource?: string | null;
  licenseVerifiedAt?: unknown;
}): boolean {
  const status = normalizeLicenseStatus(input.licenseStatus);
  if (status === "expired" || status === "suspended") return false;
  if (!isOperatorLicenseSource(input.licenseVerificationSource)) return false;
  if (!licenceVerifiedStamp(input.licenseVerifiedAt)) return false;
  return status === "matched" || input.registryMatchState === "matched";
}
