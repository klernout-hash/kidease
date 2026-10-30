/**
 * Area waitlist: save a place on saved_searches (kind waitlist_area) and
 * match it when a daycare posts a spot or the hourly search-alerts job runs.
 *
 * Channels:
 *   - in-app bell now (search_alert_notices)
 *   - email only when FEATURE_AREA_WAITLIST_ALERTS is on (default off)
 *   - SMS only when FEATURE_SMS is on, CASL SMS consent is stored, and the
 *     parent has plus_plan=alerts (parentAlertsEntitled). Kyle still needs to
 *     decide if area texts should stay on that paid gate. This file does not
 *     change parentAlertsEntitled.
 *   - push only when FEATURE_PUSH is on. No send while it is off.
 *
 * Geocoding uses the local Canadian city and postal-prefix table, then
 * Photon (OpenStreetMap). No Google.
 */
import { getSql, type Sql } from "@/lib/db";
import { geocode, haversineKm } from "@/lib/geo";
import { PHOTON_USER_AGENT, photonSearchUrl, photonToPlace, type PhotonFeature } from "@/lib/photon";
import { areaWaitlistAlertsEnabled } from "@/lib/features";
import { isPublicListing, listingVisibilityInputFromDb } from "@/lib/listing-visibility";
import { parentAlertsEntitled } from "@/lib/parent-plus";
import { showsParentBrowseActions, navRoleForSession } from "@/lib/role-access";
import { isAlertQuietHours, winnipegDayKey } from "@/lib/search-alert-policy";
import { sendTransactionalMail } from "@/lib/transactional-mail";
import { nid } from "@/lib/utils";
import {
  AREA_WAITLIST_CAP,
  AREA_WAITLIST_KIND,
  areaPlaceQuery,
  areaSpotKey,
  areaWaitlistLetter,
  areaWaitlistSms,
  normalizeCanadianPostal,
  planAreaWaitlistHits,
  type AreaWaitlistHit,
  type AreaWaitlistPrior,
  type AreaWaitlistSpot,
  type AreaWaitlistWatch,
} from "@/lib/area-waitlist";
import type { SpotAgeBand } from "@/lib/spot-alert-match";

const AGE_BANDS = new Set(["any", "infant", "toddler", "preschool"]);

type PlaceHit = { lat: number; lng: number; label: string; postalCode: string | null };

let ensured = false;

export async function ensureAreaWaitlistSchema(sql: Sql) {
  if (ensured) return;
  const statements = [
    `alter table saved_searches add column if not exists kind text not null default 'search'`,
    `alter table saved_searches add column if not exists start_date date`,
    `alter table saved_searches add column if not exists postal_code text`,
    `create table if not exists area_waitlist_sends (
      id text primary key,
      user_id text not null,
      saved_search_id text,
      daycare_id text not null,
      spot_key text not null,
      age_group text not null,
      in_app int not null default 0,
      emailed int not null default 0,
      sms_sent int not null default 0,
      created_at timestamptz not null default now()
    )`,
    `create unique index if not exists area_waitlist_sends_once on area_waitlist_sends (user_id, daycare_id, spot_key)`,
  ];
  try {
    for (const statement of statements) await sql.query(statement);
    await sql.query(`
      do $$
      begin
        if exists (select 1 from pg_constraint where conname = 'search_alert_notices_kind_chk') then
          alter table search_alert_notices drop constraint search_alert_notices_kind_chk;
        end if;
        alter table search_alert_notices
          add constraint search_alert_notices_kind_chk
          check (kind in ('new_centre', 'vacancy_reconfirmed', 'waitlist_pulse', 'request_reply', 'area_waitlist'));
      end $$
    `);
    ensured = true;
  } catch {
    /* migration 0107 is the source of truth; retry next call */
  }
}

function appOrigin() {
  return (process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca").replace(/\/$/, "");
}

function iso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  return text || null;
}

function asBand(raw: string): SpotAgeBand {
  return AGE_BANDS.has(raw) ? (raw as SpotAgeBand) : "any";
}

function parseStart(raw: unknown): string | null | "bad" {
  const text = String(raw || "").trim().slice(0, 10);
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "bad";
  const ts = Date.parse(`${text}T12:00:00Z`);
  if (!Number.isFinite(ts)) return "bad";
  const days = Math.round((ts - Date.now()) / 86_400_000);
  if (days < -1 || days > 540) return "bad";
  return text;
}

async function parentMayJoin(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<{ role: string | null }>`
    select role from profiles where user_id = ${userId} limit 1
  `.catch(() => [] as Array<{ role: string | null }>);
  const { listAccessibleDaycareIds } = await import("@/lib/server/centre-access");
  const centres = await listAccessibleDaycareIds(sql, userId).catch(() => [] as string[]);
  const role = navRoleForSession({
    role: rows[0]?.role,
    ownsCentre: centres.length > 0,
    activeMember: false,
  });
  return showsParentBrowseActions(role);
}

export async function resolveAreaPlace(raw: string): Promise<PlaceHit | null> {
  const query = areaPlaceQuery(raw);
  if (query.length < 2) return null;
  const postal = normalizeCanadianPostal(query);
  const local = geocode(postal || query);
  if (local && Number.isFinite(local.lat) && Number.isFinite(local.lng)) {
    return { lat: local.lat, lng: local.lng, label: local.label, postalCode: postal };
  }
  const remote = await photonAreaSearch(query);
  if (!remote) return null;
  return { lat: remote.lat, lng: remote.lng, label: remote.label, postalCode: postal };
}

async function photonAreaSearch(query: string) {
  try {
    const res = await fetch(photonSearchUrl(query, undefined, 1), {
      headers: { Accept: "application/json", "User-Agent": PHOTON_USER_AGENT },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { features?: PhotonFeature[] };
    const feature = body.features?.[0];
    if (!feature) return null;
    return photonToPlace(feature, query);
  } catch {
    return null;
  }
}

export async function joinAreaWaitlistForUser(
  userId: string,
  data: { place: string; radiusKm: number; ageGroup: string; startDate?: string },
) {
    if (!data.place) return { ok: false as const, error: "missing" as const };
    const start = parseStart(data.startDate);
    if (start === "bad") return { ok: false as const, error: "date" as const };
    const age = AGE_BANDS.has(data.ageGroup) ? data.ageGroup : "";
    if (!age) return { ok: false as const, error: "age" as const };
    const sql = await getSql();
    await ensureAreaWaitlistSchema(sql);
    if (!(await parentMayJoin(sql, userId))) return { ok: false as const, error: "daycare" as const };
    const place = await resolveAreaPlace(data.place);
    if (!place) return { ok: false as const, error: "place" as const };
    const existing = await sql<{ id: string }>`
      select id from saved_searches
      where user_id = ${userId}
        and kind = ${AREA_WAITLIST_KIND}
        and alerts_enabled = 1
        and age_band = ${age}
        and radius_km = ${data.radiusKm}
        and lower(center_label) = ${place.label.toLowerCase()}
      limit 1
    `.catch(() => [] as Array<{ id: string }>);
    if (existing[0]) {
      await sql`
        update saved_searches
        set start_date = ${start}, postal_code = ${place.postalCode}, updated_at = now()
        where id = ${existing[0].id} and user_id = ${userId}
      `;
      return { ok: true as const, id: existing[0].id, already: true };
    }
    const count = await sql<{ n: number }>`
      select count(*)::int as n from saved_searches
      where user_id = ${userId} and kind = ${AREA_WAITLIST_KIND} and alerts_enabled = 1
    `.catch(() => [{ n: 0 }]);
    if ((count[0]?.n ?? 0) >= AREA_WAITLIST_CAP) return { ok: false as const, error: "cap" as const };
    const id = nid("aw");
    const name = `Area waitlist · ${place.label}`.slice(0, 80);
    await sql`
      insert into saved_searches (
        id, user_id, name, center_lat, center_lng, center_label,
        radius_km, age_band, filters, alerts_enabled, kind, start_date, postal_code, last_checked_at
      ) values (
        ${id}, ${userId}, ${name}, ${place.lat}, ${place.lng}, ${place.label},
        ${data.radiusKm}, ${age}, ${"{}"}::jsonb, 1, ${AREA_WAITLIST_KIND}, ${start}, ${place.postalCode}, now()
      )
    `;
    return { ok: true as const, id, already: false };
}

export async function removeAreaWaitlistForUser(userId: string, id: string) {
    if (!id) return { ok: false as const, error: "missing" as const };
    const sql = await getSql();
    await ensureAreaWaitlistSchema(sql);
    const rows = await sql<{ id: string }>`
      delete from saved_searches
      where id = ${id} and user_id = ${userId} and kind = ${AREA_WAITLIST_KIND}
      returning id
    `.catch(() => [] as Array<{ id: string }>);
    if (!rows[0]) return { ok: false as const, error: "missing" as const };
    return { ok: true as const };
}

type WatchRow = {
  id: string;
  user_id: string;
  center_lat: number;
  center_lng: number;
  center_label: string;
  radius_km: number;
  age_band: string;
  start_date: string | Date | null;
  last_checked_at: string | Date | null;
};

function mapWatch(row: WatchRow): AreaWaitlistWatch {
  const start = iso(row.start_date);
  return {
    id: row.id,
    userId: row.user_id,
    lat: Number(row.center_lat),
    lng: Number(row.center_lng),
    radiusKm: Number(row.radius_km) || 10,
    ageBand: asBand(row.age_band),
    startDate: start ? start.slice(0, 10) : null,
    checkedAt: iso(row.last_checked_at),
    label: row.center_label,
  };
}

async function loadWatches(sql: Sql, limit: number): Promise<AreaWaitlistWatch[]> {
  const rows = await sql<WatchRow>`
    select id, user_id, center_lat, center_lng, center_label, radius_km, age_band, start_date, last_checked_at
    from saved_searches
    where kind = ${AREA_WAITLIST_KIND} and alerts_enabled = 1
    order by last_checked_at nulls first
    limit ${limit}
  `.catch(() => [] as WatchRow[]);
  return rows.map(mapWatch);
}

type SpotRow = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  spots_infant: number | null;
  spots_toddler: number | null;
  spots_preschool: number | null;
  age_min_months: number | null;
  age_max_months: number | null;
  ages_confirmed: number | boolean | null;
  last_vacancy_updated_at: string | Date | null;
  visibility?: string | null;
  is_test?: number | boolean | null;
  is_demo?: number | boolean | null;
  claim_status?: string | null;
  license_number?: string | null;
  address?: string | null;
  province?: string | null;
  fact_source?: string | null;
  merged_into?: string | null;
  import_fault?: string | null;
  listing_active?: number | boolean | null;
};

function rowToSpot(row: SpotRow, now: Date, force: boolean): AreaWaitlistSpot | null {
  if (!isPublicListing(listingVisibilityInputFromDb(row))) return null;
  const vacancyAt = force ? now.toISOString() : iso(row.last_vacancy_updated_at);
  return {
    listingId: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city || "",
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    agesKnown: row.ages_confirmed === 1 || row.ages_confirmed === true,
    ageMinMonths: Number(row.age_min_months) || 0,
    ageMaxMonths: Number(row.age_max_months) || 0,
    spotsInfant: Number(row.spots_infant) || 0,
    spotsToddler: Number(row.spots_toddler) || 0,
    spotsPreschool: Number(row.spots_preschool) || 0,
    vacancyAt,
  };
}

async function loadDaycareSpot(sql: Sql, daycareId: string, now: Date, force: boolean): Promise<AreaWaitlistSpot[]> {
  const rows = await sql<SpotRow>`
    select id, slug, name, city, lat, lng, spots_infant, spots_toddler, spots_preschool,
           age_min_months, age_max_months, ages_confirmed, last_vacancy_updated_at,
           visibility, is_test, is_demo, claim_status, license_number, address, province,
           fact_source, merged_into, import_fault, listing_active
    from daycares
    where id = ${daycareId}
    limit 1
  `.catch(() => [] as SpotRow[]);
  const spot = rows[0] ? rowToSpot(rows[0], now, force) : null;
  return spot ? [spot] : [];
}

async function loadSpotsNear(watches: AreaWaitlistWatch[]): Promise<AreaWaitlistSpot[]> {
  const { queryCentresInRadius } = await import("@/lib/server/search-alerts");
  const byId = new Map<string, AreaWaitlistSpot>();
  for (const watch of watches) {
    const rows = await queryCentresInRadius({ lat: watch.lat, lng: watch.lng }, watch.radiusKm).catch(() => []);
    for (const row of rows) {
      if (byId.has(row.id)) continue;
      byId.set(row.id, {
        listingId: row.id,
        slug: row.slug,
        name: row.name,
        city: row.city || "",
        lat: Number(row.lat),
        lng: Number(row.lng),
        distanceKm: Number(row.distance_km),
        agesKnown: row.ages_confirmed === 1 || row.ages_confirmed === true,
        ageMinMonths: Number(row.age_min_months) || 0,
        ageMaxMonths: Number(row.age_max_months) || 0,
        spotsInfant: Number(row.spots_infant) || 0,
        spotsToddler: Number(row.spots_toddler) || 0,
        spotsPreschool: Number(row.spots_preschool) || 0,
        vacancyAt: iso(row.last_vacancy_updated_at),
      });
    }
  }
  return [...byId.values()];
}

async function loadPrior(sql: Sql): Promise<AreaWaitlistPrior[]> {
  const rows = await sql<{
    user_id: string;
    daycare_id: string;
    spot_key: string;
    created_at: string | Date;
  }>`
    select user_id, daycare_id, spot_key, created_at
    from area_waitlist_sends
    where created_at > now() - interval '21 days'
    order by created_at desc
    limit 2000
  `.catch(() => []);
  return rows.map((row) => ({
    userId: row.user_id,
    daycareId: row.daycare_id,
    spotKey: row.spot_key,
    day: winnipegDayKey(row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at))),
  }));
}

async function profileLocale(sql: Sql, userId: string): Promise<"en" | "fr"> {
  const rows = await sql<{ locale: string | null }>`
    select locale from profiles where user_id = ${userId} limit 1
  `.catch(() => [] as Array<{ locale: string | null }>);
  return String(rows[0]?.locale || "").toLowerCase().startsWith("fr") ? "fr" : "en";
}

async function deliverHit(sql: Sql, hit: AreaWaitlistHit, now: Date) {
  const inserted = await sql<{ id: string }>`
    insert into area_waitlist_sends (
      id, user_id, saved_search_id, daycare_id, spot_key, age_group, in_app, emailed, sms_sent
    ) values (
      ${nid("aws")}, ${hit.userId}, ${hit.watchId}, ${hit.daycareId}, ${hit.spotKey}, ${hit.ageBand}, 0, 0, 0
    )
    on conflict (user_id, daycare_id, spot_key) do nothing
    returning id
  `.catch(() => [] as Array<{ id: string }>);
  const sendId = inserted[0]?.id;
  if (!sendId) return false;
  const locale = await profileLocale(sql, hit.userId);
  const href = `/daycare/${hit.slug}`;
  const title = locale === "fr" ? `Place possiblement libre à ${hit.name}` : `Possible open spot at ${hit.name}`;
  const body = locale === "fr"
    ? `Environ ${hit.distanceKm} km de ${hit.label}. Ce n'est pas une place réservée.`
    : `About ${hit.distanceKm} km from ${hit.label}. This is not a reserved spot.`;
  await sql`
    insert into search_alert_notices (id, user_id, saved_search_id, daycare_id, kind, title, body, link_path)
    values (
      ${nid("san")}, ${hit.userId}, ${hit.watchId}, ${hit.daycareId}, ${"area_waitlist"},
      ${title.slice(0, 140)}, ${body.slice(0, 280)}, ${href}
    )
  `.catch(() => undefined);
  await sql`update area_waitlist_sends set in_app = 1 where id = ${sendId}`.catch(() => undefined);

  const zone = await familyZone(sql, hit.userId);
  const quiet = isAlertQuietHours(now, zone);
  await sendAreaEmail(sql, { ...hit, sendId, locale, quiet });
  await sendAreaSms(sql, { ...hit, sendId, quiet });
  // Push stays on FEATURE_PUSH in the saved-search job. This module does not
  // import the push sender, so the parent pages that load the join action
  // do not pull that server code into the browser bundle.
  return true;
}

async function familyZone(sql: Sql, userId: string): Promise<string | null> {
  const rows = await sql<{ time_zone: string | null }>`
    select time_zone from profiles where user_id = ${userId} limit 1
  `.catch(() => [] as Array<{ time_zone: string | null }>);
  const zone = String(rows[0]?.time_zone || "").trim();
  return zone || null;
}

async function sendAreaEmail(
  sql: Sql,
  hit: AreaWaitlistHit & { sendId: string; locale: "en" | "fr"; quiet: boolean },
) {
  if (!areaWaitlistAlertsEnabled()) {
    await sql`update area_waitlist_sends set emailed = 1 where id = ${hit.sendId}`.catch(() => undefined);
    return;
  }
  if (hit.quiet) return;
  const { lookupUser } = await import("@/lib/server/notify");
  const { evaluateCaslSend } = await import("@/lib/server/casl-consent");
  const { isSuppressed } = await import("@/lib/server/email-suppressions");
  const user = await lookupUser(hit.userId).catch(() => ({ email: null as string | null }));
  const email = String(user.email || "").trim();
  if (!email) {
    await sql`update area_waitlist_sends set emailed = 1 where id = ${hit.sendId}`.catch(() => undefined);
    return;
  }
  const casl = await evaluateCaslSend({ userId: hit.userId, channel: "email", purpose: "service", address: email });
  if (!casl.ok || (await isSuppressed(email))) {
    await sql`update area_waitlist_sends set emailed = 1 where id = ${hit.sendId}`.catch(() => undefined);
    return;
  }
  const origin = appOrigin();
  const letter = areaWaitlistLetter({
    locale: hit.locale,
    centre: hit.name,
    city: hit.city,
    place: hit.label,
    km: hit.distanceKm,
    ageBand: hit.ageBand,
    url: `${origin}/daycare/${hit.slug}`,
    manageUrl: `${origin}/parent?tab=waitlists`,
  });
  const sent = await sendTransactionalMail({
    to: email,
    subject: letter.subject,
    text: letter.text,
    html: letter.html,
    purpose: "area_waitlist",
  }).catch(() => null);
  if (sent && (sent.status === "sent" || sent.status === "logged")) {
    await sql`update area_waitlist_sends set emailed = 1 where id = ${hit.sendId}`.catch(() => undefined);
  }
}

async function sendAreaSms(sql: Sql, hit: AreaWaitlistHit & { sendId: string; quiet: boolean }) {
  const { smsEnabled } = await import("@/lib/features");
  const rows = await sql<{ phone: string | null; plus_plan: string | null; plus_status: string | null }>`
    select phone, plus_plan, plus_status from profiles where user_id = ${hit.userId} limit 1
  `.catch(() => [] as Array<{ phone: string | null; plus_plan: string | null; plus_status: string | null }>);
  // Same paid gate as saved-search SMS. Left unchanged for Kyle to decide.
  const entitled = parentAlertsEntitled(rows[0]?.plus_plan, rows[0]?.plus_status);
  if (!smsEnabled() || !entitled) {
    await sql`update area_waitlist_sends set sms_sent = 1 where id = ${hit.sendId}`.catch(() => undefined);
    return;
  }
  if (hit.quiet) return;
  const { evaluateCaslSend } = await import("@/lib/server/casl-consent");
  const phone = rows[0]?.phone || "";
  const casl = await evaluateCaslSend({ userId: hit.userId, channel: "sms", purpose: "service", address: phone });
  if (!casl.ok) {
    await sql`update area_waitlist_sends set sms_sent = 1 where id = ${hit.sendId}`.catch(() => undefined);
    return;
  }
  const { sendSms } = await import("@/lib/server/sms");
  const sms = await sendSms({
    to: phone,
    body: areaWaitlistSms({ centre: hit.name, city: hit.city }),
    audience: "user",
    consentGranted: true,
  }).catch(() => null);
  if (sms?.ok || sms?.skipped) {
    await sql`update area_waitlist_sends set sms_sent = 1 where id = ${hit.sendId}`.catch(() => undefined);
  }
}

async function retryQuietMail(sql: Sql, now: Date) {
  if (!areaWaitlistAlertsEnabled()) return;
  const rows = await sql<{
    id: string;
    user_id: string;
    daycare_id: string;
    age_group: string;
    center_label: string | null;
    center_lat: number | null;
    center_lng: number | null;
    name: string;
    slug: string;
    city: string | null;
    lat: number | null;
    lng: number | null;
  }>`
    select s.id, s.user_id, s.daycare_id, s.age_group,
           w.center_label, w.center_lat, w.center_lng,
           d.name, d.slug, d.city, d.lat, d.lng
    from area_waitlist_sends s
    join daycares d on d.id = s.daycare_id
    left join saved_searches w on w.id = s.saved_search_id
    where s.emailed = 0 and s.created_at > now() - interval '3 days'
    order by s.created_at
    limit 30
  `.catch(() => []);
  for (const row of rows) {
    const locale = await profileLocale(sql, row.user_id);
    let km = 0;
    if (row.center_lat != null && row.center_lng != null && row.lat != null && row.lng != null) {
      km = Math.round(haversineKm({ lat: Number(row.center_lat), lng: Number(row.center_lng) }, { lat: Number(row.lat), lng: Number(row.lng) }) * 10) / 10;
    }
    const zone = await familyZone(sql, row.user_id);
    if (isAlertQuietHours(now, zone)) continue;
    await sendAreaEmail(sql, {
      sendId: row.id,
      watchId: "",
      userId: row.user_id,
      daycareId: row.daycare_id,
      slug: row.slug,
      name: row.name,
      city: row.city || "",
      distanceKm: km,
      ageBand: row.age_group,
      label: row.center_label || "",
      spotKey: areaSpotKey(null, { infant: 0, toddler: 0, preschool: 0 }, now),
      locale,
      quiet: false,
    });
  }
  const smsRows = await sql<{ id: string; user_id: string; name: string; city: string | null }>`
    select s.id, s.user_id, d.name, d.city
    from area_waitlist_sends s
    join daycares d on d.id = s.daycare_id
    where s.sms_sent = 0 and s.created_at > now() - interval '3 days'
    order by s.created_at
    limit 30
  `.catch(() => []);
  for (const row of smsRows) {
    const zone = await familyZone(sql, row.user_id);
    if (isAlertQuietHours(now, zone)) continue;
    await sendAreaSms(sql, {
      sendId: row.id,
      watchId: "",
      userId: row.user_id,
      daycareId: "",
      slug: "",
      name: row.name,
      city: row.city || "",
      distanceKm: 0,
      ageBand: "any",
      label: "",
      spotKey: "",
      quiet: false,
    });
  }
}

export async function runAreaWaitlistAlerts(opts?: { dryRun?: boolean; now?: Date; daycareId?: string; force?: boolean }) {
  const now = opts?.now ?? new Date();
  const dryRun = Boolean(opts?.dryRun);
  const sql = await getSql();
  await ensureAreaWaitlistSchema(sql);
  const watches = await loadWatches(sql, opts?.daycareId ? 200 : 40);
  const spots = opts?.daycareId
    ? await loadDaycareSpot(sql, opts.daycareId, now, Boolean(opts.force))
    : await loadSpotsNear(watches);
  const hits = planAreaWaitlistHits({ watches, spots, prior: await loadPrior(sql), now });
  if (dryRun) return { ok: true as const, matched: hits.length, sent: 0 };
  let sent = 0;
  for (const hit of hits) {
    if (await deliverHit(sql, hit, now)) sent += 1;
  }
  if (!opts?.daycareId) {
    for (const watch of watches) {
      await sql`update saved_searches set last_checked_at = now() where id = ${watch.id}`.catch(() => undefined);
    }
  }
  await retryQuietMail(sql, now);
  return { ok: true as const, matched: hits.length, sent };
}

export function queueAreaWaitlistMatch(daycareId: string, force = false) {
  const id = String(daycareId || "").trim();
  if (!id) return;
  void runAreaWaitlistAlerts({ daycareId: id, force }).catch((err) => {
    console.error("[kidease-area-waitlist] match skipped", err instanceof Error ? err.message : "error");
  });
}
