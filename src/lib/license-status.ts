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
