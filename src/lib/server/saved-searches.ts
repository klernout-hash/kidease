import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { clampRadiusKm } from "@/lib/proximity";
import {
  cleanSearchName,
  defaultSearchName,
  isAgeBand,
  isValidSearchOrigin,
  MAX_SAVED_SEARCHES,
  parseSavedSearchFilters,
  type AgeBand,
  type SavedSearch,
  type SavedSearchFilters,
  type SearchAlertNotice,
  type SearchAlertPrefs,
} from "@/lib/saved-search";
import { nid } from "@/lib/utils";

type SavedSearchRow = {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  center_label: string;
  radius_km: number;
  age_band: string;
  filters: unknown;
  alerts_enabled: number | boolean;
  last_checked_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type NoticeRow = {
  id: string;
  saved_search_id: string | null;
  daycare_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  read_at: string | Date | null;
  created_at: string | Date;
};

function iso(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function mapSearch(row: SavedSearchRow): SavedSearch {
  return {
    id: row.id,
    name: row.name,
    centerLat: Number(row.center_lat),
    centerLng: Number(row.center_lng),
    centerLabel: row.center_label,
    radiusKm: clampRadiusKm(Number(row.radius_km)),
    ageBand: isAgeBand(row.age_band) ? row.age_band : "any",
    filters: parseSavedSearchFilters(row.filters),
    alertsEnabled: row.alerts_enabled === 1 || row.alerts_enabled === true,
    lastCheckedAt: iso(row.last_checked_at),
    createdAt: iso(row.created_at) || new Date().toISOString(),
    updatedAt: iso(row.updated_at) || new Date().toISOString(),
  };
}

function mapNotice(row: NoticeRow): SearchAlertNotice {
  return {
    id: row.id,
    savedSearchId: row.saved_search_id,
    daycareId: row.daycare_id,
    kind: row.kind === "vacancy_reconfirmed" ? "vacancy_reconfirmed" : "new_centre",
    title: row.title,
    body: row.body || "",
    readAt: iso(row.read_at),
    createdAt: iso(row.created_at) || new Date().toISOString(),
  };
}

export type SaveSearchInput = {
  name?: string;
  centerLat: number;
  centerLng: number;
  centerLabel: string;
  radiusKm: number;
  ageBand?: string;
  filters?: Partial<SavedSearchFilters> | SavedSearchFilters;
};

function validateSaveInput(input: SaveSearchInput) {
  if (!isValidSearchOrigin(input.centerLat, input.centerLng)) {
    throw new Error("Save a real search origin — KidEase does not invent a location.");
  }
  const ageBand: AgeBand = isAgeBand(input.ageBand) ? input.ageBand : "any";
  const radiusKm = clampRadiusKm(input.radiusKm);
  const label = String(input.centerLabel || "").trim().slice(0, 120);
  if (!label) throw new Error("This search needs a place label from search.");
  const name = cleanSearchName(input.name) || defaultSearchName(label, radiusKm, ageBand);
  return {
    name,
    centerLat: input.centerLat,
    centerLng: input.centerLng,
    centerLabel: label,
    radiusKm,
    ageBand,
    filters: parseSavedSearchFilters(input.filters),
  };
}

export const listSavedSearches = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SavedSearch[]> => {
    const sql = await getSql();
    const rows = await sql<SavedSearchRow>`
      select id, name, center_lat, center_lng, center_label, radius_km, age_band,
             filters, alerts_enabled, last_checked_at, created_at, updated_at
      from saved_searches
      where user_id = ${context.userId}
      order by updated_at desc
    `.catch(() => [] as SavedSearchRow[]);
    return rows.map(mapSearch);
  });

export const saveSearch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: SaveSearchInput) => validateSaveInput(input))
  .handler(async ({ context, data }): Promise<SavedSearch> => {
    const sql = await getSql();
    const existing = await sql<{ n: number }>`
      select count(*)::int as n from saved_searches where user_id = ${context.userId}
    `.catch(() => [{ n: 0 }]);
    if ((existing[0]?.n ?? 0) >= MAX_SAVED_SEARCHES) {
      throw new Error(`You can save up to ${MAX_SAVED_SEARCHES} searches. Delete one to add another.`);
    }
    const id = nid("ss");
    const filters = JSON.stringify(data.filters);
    await sql`
      insert into saved_searches (
        id, user_id, name, center_lat, center_lng, center_label,
        radius_km, age_band, filters, alerts_enabled
      ) values (
        ${id}, ${context.userId}, ${data.name}, ${data.centerLat}, ${data.centerLng},
        ${data.centerLabel}, ${data.radiusKm}, ${data.ageBand}, ${filters}::jsonb, 1
      )
    `;
    return {
      id,
      name: data.name,
      centerLat: data.centerLat,
      centerLng: data.centerLng,
      centerLabel: data.centerLabel,
      radiusKm: data.radiusKm,
      ageBand: data.ageBand,
      filters: data.filters,
      alertsEnabled: true,
      lastCheckedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

export const updateSavedSearch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; name?: string; radiusKm?: number; ageBand?: string; alertsEnabled?: boolean; filters?: Partial<SavedSearchFilters> }) => ({
    id: String(input?.id || "").trim(),
    name: input.name != null ? cleanSearchName(input.name) : undefined,
    radiusKm: input.radiusKm != null ? clampRadiusKm(input.radiusKm) : undefined,
    ageBand: input.ageBand != null && isAgeBand(input.ageBand) ? input.ageBand : undefined,
    alertsEnabled: typeof input.alertsEnabled === "boolean" ? input.alertsEnabled : undefined,
    filters: input.filters ? parseSavedSearchFilters(input.filters) : undefined,
  }))
  .handler(async ({ context, data }): Promise<SavedSearch> => {
    if (!data.id) throw new Error("Missing search");
    const sql = await getSql();
    const rows = await sql<SavedSearchRow>`
      select id, name, center_lat, center_lng, center_label, radius_km, age_band,
             filters, alerts_enabled, last_checked_at, created_at, updated_at
      from saved_searches
      where id = ${data.id} and user_id = ${context.userId}
      limit 1
    `;
    const cur = rows[0];
    if (!cur) throw new Error("Search not found");
    const next = mapSearch(cur);
    if (data.name) next.name = data.name;
    if (data.radiusKm != null) next.radiusKm = data.radiusKm;
    if (data.ageBand) next.ageBand = data.ageBand;
    if (data.alertsEnabled != null) next.alertsEnabled = data.alertsEnabled;
    if (data.filters) next.filters = data.filters;
    const filters = JSON.stringify(next.filters);
    await sql`
      update saved_searches set
        name = ${next.name},
        radius_km = ${next.radiusKm},
        age_band = ${next.ageBand},
        filters = ${filters}::jsonb,
        alerts_enabled = ${next.alertsEnabled ? 1 : 0},
        updated_at = now()
      where id = ${data.id} and user_id = ${context.userId}
    `;
    next.updatedAt = new Date().toISOString();
    return next;
  });

export const deleteSavedSearch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input?.id || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("Missing search");
    const sql = await getSql();
    await sql`
      delete from saved_searches where id = ${data.id} and user_id = ${context.userId}
    `;
    return { ok: true as const };
  });

export const getSearchAlertPrefs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SearchAlertPrefs> => {
    const sql = await getSql();
    const rows = await sql<{ email_enabled: number | boolean; in_app_enabled: number | boolean; updated_at: string | Date | null }>`
      select email_enabled, in_app_enabled, updated_at
      from search_alert_prefs
      where user_id = ${context.userId}
      limit 1
    `.catch(() => []);
    const row = rows[0];
    if (!row) {
      return { emailEnabled: true, inAppEnabled: true, updatedAt: null };
    }
    return {
      emailEnabled: row.email_enabled !== 0 && row.email_enabled !== false,
      inAppEnabled: row.in_app_enabled !== 0 && row.in_app_enabled !== false,
      updatedAt: iso(row.updated_at),
    };
  });

export const saveSearchAlertPrefs = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { emailEnabled?: boolean; inAppEnabled?: boolean }) => ({
    emailEnabled: Boolean(input?.emailEnabled),
    inAppEnabled: Boolean(input?.inAppEnabled),
  }))
  .handler(async ({ context, data }): Promise<SearchAlertPrefs> => {
    const sql = await getSql();
    await sql`
      insert into search_alert_prefs (user_id, email_enabled, in_app_enabled, updated_at)
      values (${context.userId}, ${data.emailEnabled ? 1 : 0}, ${data.inAppEnabled ? 1 : 0}, now())
      on conflict (user_id) do update set
        email_enabled = excluded.email_enabled,
        in_app_enabled = excluded.in_app_enabled,
        updated_at = now()
    `;
    return {
      emailEnabled: data.emailEnabled,
      inAppEnabled: data.inAppEnabled,
      updatedAt: new Date().toISOString(),
    };
  });

export const listSearchAlertNotices = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<SearchAlertNotice[]> => {
    const sql = await getSql();
    const rows = await sql<NoticeRow>`
      select id, saved_search_id, daycare_id, kind, title, body, read_at, created_at
      from search_alert_notices
      where user_id = ${context.userId}
      order by created_at desc
      limit 40
    `.catch(() => [] as NoticeRow[]);
    return rows.map(mapNotice);
  });

export const previewSavedSearchMatches = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { id: string }) => ({ id: String(input?.id || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("Missing search");
    const sql = await getSql();
    const rows = await sql<SavedSearchRow>`
      select id, name, center_lat, center_lng, center_label, radius_km, age_band,
             filters, alerts_enabled, last_checked_at, created_at, updated_at
      from saved_searches
      where id = ${data.id} and user_id = ${context.userId}
      limit 1
    `;
    const row = rows[0];
    if (!row) throw new Error("Search not found");
    const search = mapSearch(row);
    const { findAlertCandidatesForSearch } = await import("@/lib/server/search-alerts");
    const candidates = await findAlertCandidatesForSearch(search);
    return { search, candidates };
  });

export const markSearchAlertRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; all?: boolean }) => ({
    id: String(input?.id || "").trim(),
    all: Boolean(input?.all),
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    if (data.all) {
      await sql`
        update search_alert_notices set read_at = now()
        where user_id = ${context.userId} and read_at is null
      `;
    } else if (data.id) {
      await sql`
        update search_alert_notices set read_at = now()
        where id = ${data.id} and user_id = ${context.userId}
      `;
    }
    return { ok: true as const };
  });
