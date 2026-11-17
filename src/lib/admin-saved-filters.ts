/**
 * Named views on the admin lists. A saved filter is the tab, status,
 * province, and whether documents are waiting. Nothing is invented.
 */

import { isAdminStatFilter, type AdminStatFilter } from "./admin-stat-filter.ts";

export const ADMIN_FILTER_PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"] as const;

export type AdminSavedFilter = {
  id: string;
  name: string;
  tab: string;
  stat?: AdminStatFilter;
  province?: string;
  docs: boolean;
};

const STORAGE_KEY = "kidease-admin-saved-filters";

function cleanName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 60);
}

function provinceCode(value: unknown): string | undefined {
  const code = String(value || "").trim().toUpperCase();
  return (ADMIN_FILTER_PROVINCES as readonly string[]).includes(code) ? code : undefined;
}

export function parseSavedFilter(value: unknown): AdminSavedFilter | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { id?: unknown; name?: unknown; tab?: unknown; stat?: unknown; province?: unknown; docs?: unknown };
  const name = cleanName(String(row.name || ""));
  const id = cleanName(String(row.id || "")).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
  const tab = cleanName(String(row.tab || "queue")).slice(0, 40);
  if (!name || !id || !tab) return null;
  const statRaw = typeof row.stat === "string" ? row.stat : undefined;
  return {
    id,
    name,
    tab,
    stat: isAdminStatFilter(statRaw) ? statRaw : undefined,
    province: provinceCode(row.province),
    docs: row.docs === true,
  };
}

export function readSavedFilters(raw: string | null): AdminSavedFilter[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((row) => {
      const filter = parseSavedFilter(row);
      return filter ? [filter] : [];
    }).slice(0, 20);
  } catch {
    return [];
  }
}

export function saveNamedFilter(current: readonly AdminSavedFilter[], filter: AdminSavedFilter): AdminSavedFilter[] {
  const next = current.filter((row) => row.id !== filter.id && row.name.toLowerCase() !== filter.name.toLowerCase());
  return [filter, ...next].slice(0, 20);
}

export function deleteNamedFilter(current: readonly AdminSavedFilter[], id: string): AdminSavedFilter[] {
  return current.filter((row) => row.id !== id);
}

export function savedFilterId(name: string): string {
  const id = cleanName(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return id || "view";
}

export function savedFilterStorageKey(): string {
  return STORAGE_KEY;
}

export function centreMatchesSavedView(
  centre: { province?: string | null; claimStatus?: string | null },
  view: { province?: string; docs?: boolean },
  docsWaiting: boolean,
): boolean {
  if (view.province && String(centre.province || "").trim().toUpperCase() !== view.province) return false;
  if (view.docs && !docsWaiting) return false;
  return true;
}
