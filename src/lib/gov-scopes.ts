/**
 * Province scope for a government account.
 * FEATURE_GOV_SCOPES defaults off. Off does not sign the person out.
 * Totals never include a name, a street, or a child.
 */
import { govScopesEnabled, type EnvMap } from "./features.ts";
import { isProvinceCode } from "./gov/places.ts";

export type GovCentreRow = {
  province?: string | null;
  openSpots?: number | null;
};

export type GovScopeView =
  | { show: false; reason: "not_gov"; province: null }
  | { show: true; reason: "off" | "missing" | "unsupported"; province: null }
  | { show: true; reason: "ok"; province: string };

export function normalizeGovProvince(value: string | null | undefined): string | null {
  const code = String(value || "").trim().toUpperCase();
  return isProvinceCode(code) ? code : null;
}

export function govScopeView(input: {
  /** Supplied by government authentication, never a client/profile selection. */
  actor?: { province: string; national: boolean } | null;
  enabled?: boolean;
  env?: EnvMap;
}): GovScopeView {
  if (!input.actor) return { show: false, reason: "not_gov", province: null };
  const enabled = input.enabled ?? govScopesEnabled(input.env);
  if (!enabled) return { show: true, reason: "off", province: null };
  if (input.actor.national) return { show: true, reason: "unsupported", province: null };
  const province = normalizeGovProvince(input.actor.province);
  if (!province) return { show: true, reason: "missing", province: null };
  return { show: true, reason: "ok", province };
}

export function rowsInProvince<T extends { province?: string | null }>(rows: readonly T[], province: string): T[] {
  const code = normalizeGovProvince(province);
  if (!code) return [];
  return rows.filter((row) => normalizeGovProvince(row.province) === code);
}

export function summarizeProvince(rows: readonly GovCentreRow[], province: string): {
  province: string;
  centres: number;
  openSpots: number;
} {
  const mine = rowsInProvince(rows, province);
  return {
    province: normalizeGovProvince(province) || province,
    centres: mine.length,
    openSpots: mine.reduce((sum, row) => sum + (Number(row.openSpots) || 0), 0),
  };
}
