/**
 * Geofence match query + hourly saved-search alerts.
 *
 * Uses the same PostGIS ST_DWithin + st_makepoint(lng, lat) pattern as nearby.ts.
 * Origins come from saved_searches (the parent's live search). Never invent lat/lng.
 *
 * Delivery now:
 *   - in-app family-desk notices
 *   - email via Resend/SendGrid when keyed (else honest stub). List-Unsubscribe. Free.
 * Delivery later (wired no-op until flags + keys):
 *   - sendPushNotification when FEATURE_PUSH is armed + a native token exists
 *   - sendSms when FEATURE_SMS + CASL. www never prompts for push.
 */
import { getSql, dbSource, type Sql } from "@/lib/db";
import { lookupUser } from "@/lib/server/notify";
import { resetMailConfigured } from "@/lib/server/reset-mail-config";
import { nearbyListings } from "@/lib/server/nearby";
import { overlayClaimed } from "@/lib/server/claims";
import { catchmentMatch, clampRadiusKm, distanceKm } from "@/lib/proximity";
import { isPublicListing, listingVisibilityInputFromDb, PUBLIC_LISTING_SQL } from "@/lib/listing-visibility";
import { applyListingReadiness } from "@/lib/listing-readiness";
import {
  isAgeBand,
  isValidSearchOrigin,
  listingMatchesSavedSearch,
  parseSavedSearchFilters,
  type SavedSearchFilters,
  type SearchAlertCandidate,
  type SearchAlertKind,
} from "@/lib/saved-search";
import { nid } from "@/lib/utils";
import { transactionalMailFrom } from "@/lib/mail-from";
import {
  ALERT_TZ,
  alertFacilityType,
  canSendDigestEmail,
  honestAlertCopy,
  planSearchAlertEvents,
  shouldNotifySearchAlert,
  underPushSmsDailyCap,
  winnipegDayKey,
  type PlannedAlertEvent,
} from "@/lib/search-alert-policy";
import { sendPushNotification } from "@/lib/server/push.server";
import { sendSms } from "@/lib/server/sms";

type SavedSearchJobRow = {
  id: string;
  user_id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  center_label: string;
  radius_km: number;
  age_band: string;
  filters: unknown;
  alerts_enabled: number | boolean;
  last_checked_at: string | Date | null;
};

type MatchRow = {
  id: string;
  slug: string;
  name: string;
  city: string;
  province: string;
  postal_code: string;
  lat: number;
  lng: number;
  hours: string | null;
  amenities: string | null;
  age_min_months: number;
  age_max_months: number;
  spots_infant: number;
  spots_toddler: number;
  spots_preschool: number;
  claimed_at: string | Date | null;
  claim_status: string | null;
  ages_confirmed: number | boolean | null;
  last_vacancy_updated_at: string | Date | null;
  created_at: string | Date | null;
  visibility: string | null;
  is_test: number | boolean | null;
  distance_km: number;
};

export const SEARCH_ALERT_MATCH_SQL = `
select id, slug, name, city, province, postal_code, lat, lng, hours, amenities,
  age_min_months, age_max_months, spots_infant, spots_toddler, spots_preschool,
  claimed_at, claim_status, ages_confirmed, last_vacancy_updated_at, created_at,
  visibility, is_test,
  st_distance(location, st_setsrid(st_makepoint($1, $2), 4326)::geography) / 1000.0 as distance_km
from daycares
where location is not null
  and ${PUBLIC_LISTING_SQL}
  and st_dwithin(
    location,
    st_setsrid(st_makepoint($1, $2), 4326)::geography,
    $3
  )
order by location <-> st_setsrid(st_makepoint($1, $2), 4326)::geography
limit 400
`;

export const SEARCH_ALERT_FALLBACK_SQL = `
select id, slug, name, city, province, postal_code, lat, lng, hours, amenities,
  age_min_months, age_max_months, spots_infant, spots_toddler, spots_preschool,
  claimed_at, claim_status, ages_confirmed, last_vacancy_updated_at, created_at,
  visibility, is_test,
  0::float as distance_km
from daycares
where lat is not null and lng is not null
  and ${PUBLIC_LISTING_SQL}
limit 800
`;

const POSTGIS_READY_SQL = `
select exists (
  select 1 from pg_extension where extname = 'postgis'
) and exists (
  select 1 from information_schema.columns
  where table_name = 'daycares' and column_name = 'location'
) as ok
`;

function iso(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  return s || null;
}

async function postgisReady(sql: Sql): Promise<boolean> {
  try {
    const rows = await sql.query<{ ok: boolean }>(POSTGIS_READY_SQL);
    return Boolean(rows[0]?.ok);
  } catch {
    return false;
  }
}

/**
 * Centres inside the saved-search radius. Caller must pass a validated origin.
 * $1 = lng, $2 = lat — same as nearby.ts. Never substitutes Winnipeg or any default.
 */
export async function queryCentresInRadius(
  origin: { lat: number; lng: number },
  radiusKm: number,
): Promise<MatchRow[]> {
  if (!isValidSearchOrigin(origin.lat, origin.lng)) return [];
  const radius = clampRadiusKm(radiusKm);
  const meters = radius * 1000;
  const sql = await getSql();

  if (dbSource === "neon") {
    try {
      if (await postgisReady(sql)) {
        const geo = await sql.query<MatchRow>(SEARCH_ALERT_MATCH_SQL, [origin.lng, origin.lat, meters]);
        return geo.filter((row) => isPublicListing(listingVisibilityInputFromDb(row)));
      }
    } catch {
      /* fall through */
    }
  }

  try {
    const rows = await sql.query<MatchRow>(SEARCH_ALERT_FALLBACK_SQL);
    return rows
      .map((row) => {
        const km = distanceKm(origin, { lat: Number(row.lat), lng: Number(row.lng) });
        return { ...row, distance_km: km };
      })
      .filter((row) => row.distance_km <= radius)
      .filter((row) => isPublicListing(listingVisibilityInputFromDb(row)));
  } catch {
    const nearby = await nearbyListings(origin, radius);
    return nearby.map((d) => ({
      id: d.id,
      slug: d.slug,
      name: d.name,
      city: d.city,
      province: d.province,
      postal_code: d.postalCode,
      lat: d.lat,
      lng: d.lng,
      hours: d.hours,
      amenities: d.amenities,
      age_min_months: d.ageMinMonths,
      age_max_months: d.ageMaxMonths,
      spots_infant: d.spotsInfant,
      spots_toddler: d.spotsToddler,
      spots_preschool: d.spotsPreschool,
      claimed_at: d.feeConfirmed ? new Date().toISOString() : null,
      claim_status: null,
      ages_confirmed: null,
      last_vacancy_updated_at: null,
      created_at: null,
      visibility: d.visibility ?? "public",
      is_test: d.isTest ? 1 : 0,
      distance_km: d.distanceKm ?? distanceKm(origin, d),
    }));
  }
}

function rowToFilterable(row: MatchRow, origin: { lat: number; lng: number }, originFsa?: string) {
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  const km = Number(row.distance_km) || distanceKm(origin, { lat, lng });
  const catchment = catchmentMatch(origin, { lat, lng, postalCode: row.postal_code }, km, originFsa);
  const vacancyAt = iso(row.last_vacancy_updated_at);
  const claimed = Boolean(row.claimed_at);
  const ready = applyListingReadiness({
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameFr: row.name,
    tagline: "",
    taglineFr: "",
    description: "",
    descriptionFr: "",
    address: "",
    city: row.city || "",
    province: row.province || "",
    postalCode: row.postal_code || "",
    lat,
    lng,
    phone: null,
    hours: row.hours || "",
    hoursFr: "",
    ageMinMonths: Number(row.age_min_months) || 0,
    ageMaxMonths: Number(row.age_max_months) || 0,
    infantMonthly: null,
    toddlerMonthly: null,
    preschoolMonthly: null,
    partTimeMonthly: null,
    spotsInfant: Number(row.spots_infant) || 0,
    spotsToddler: Number(row.spots_toddler) || 0,
    spotsPreschool: Number(row.spots_preschool) || 0,
    waitlist: 0,
    ratingX10: 0,
    reviewCount: 0,
    licenseNumber: row.id,
    languages: "en",
    amenities: row.amenities || "",
    photos: [],
    verified: claimed,
    live: claimed,
    claimed,
    claimStatus: row.claim_status,
    lastVacancyUpdatedAt: vacancyAt,
    agesKnown: row.ages_confirmed === 1 || row.ages_confirmed === true,
  });
  return {
    ...ready,
    spotsTotal: (Number(row.spots_infant) || 0) + (Number(row.spots_toddler) || 0) + (Number(row.spots_preschool) || 0),
    inCatchment: catchment.inCatchment,
    distanceKm: Math.round(km * 10) / 10,
    createdAt: iso(row.created_at),
    detailsReady: Boolean((ready as { detailsReady?: boolean }).detailsReady),
    availabilityKnown: Boolean(vacancyAt),
    lastVacancyUpdatedAt: vacancyAt,
  };
}

export async function findMatchingListings(
  origin: { lat: number; lng: number },
  radiusKm: number,
  ageBand: string,
  filters: SavedSearchFilters,
  originLabel?: string,
) {
  if (!isValidSearchOrigin(origin.lat, origin.lng)) return [];
  const rows = await queryCentresInRadius(origin, radiusKm);
  const fsa = (originLabel || "").replace(/\s+/g, "").slice(0, 3).toUpperCase();
  const band = isAgeBand(ageBand) ? ageBand : "any";
  const listed = rows.map((row) => rowToFilterable(row, origin, fsa));
  const overlaid = await overlayClaimed(listed, (item, claimed) => ({
    ...item,
    lastVacancyUpdatedAt: claimed.lastVacancyUpdatedAt ?? item.lastVacancyUpdatedAt,
    claimStatus: claimed.claimStatus ?? item.claimStatus,
    claimed: claimed.claimed ?? item.claimed,
    live: claimed.live,
    detailsReady: claimed.detailsReady ?? item.detailsReady,
    agesKnown: claimed.agesKnown ?? item.agesKnown,
    availabilityKnown: claimed.availabilityKnown ?? item.availabilityKnown,
    spotsInfant: claimed.spotsInfant ?? item.spotsInfant,
    spotsToddler: claimed.spotsToddler ?? item.spotsToddler,
    spotsPreschool: claimed.spotsPreschool ?? item.spotsPreschool,
    spotsTotal:
      (claimed.spotsInfant ?? item.spotsInfant ?? 0) +
      (claimed.spotsToddler ?? item.spotsToddler ?? 0) +
      (claimed.spotsPreschool ?? item.spotsPreschool ?? 0),
  }));
  return overlaid.filter((row) => listingMatchesSavedSearch(row, { ageBand: band, filters }));
}

function amenityString(row: { amenities?: string | null }) {
  return row.amenities || "";
}

export async function findAlertCandidatesForSearch(search: {
  centerLat: number;
  centerLng: number;
  centerLabel: string;
  radiusKm: number;
  ageBand: string;
  filters: SavedSearchFilters;
}): Promise<SearchAlertCandidate[]> {
  if (!isValidSearchOrigin(search.centerLat, search.centerLng)) return [];
  const hits = await findMatchingListings(
    { lat: search.centerLat, lng: search.centerLng },
    search.radiusKm,
    search.ageBand,
    search.filters,
    search.centerLabel,
  );
  return hits.map((hit) => ({
    daycareId: hit.id,
    slug: hit.slug,
    name: hit.name,
    city: hit.city,
    kind: "new_centre" as const,
    distanceKm: hit.distanceKm,
    lastVacancyUpdatedAt: hit.lastVacancyUpdatedAt ?? null,
    createdAt: "createdAt" in hit ? (hit.createdAt as string | null) : null,
  }));
}

type PrefRow = {
  email_enabled: number | boolean;
  in_app_enabled: number | boolean;
  last_email_at: string | Date | null;
};

function prefOn(value: number | boolean | undefined, fallback = true) {
  if (value == null) return fallback;
  return value !== 0 && value !== false;
}

type DigestBucket = {
  userId: string;
  savedSearchId: string;
  searchName: string;
  originLabel: string;
  events: Array<PlannedAlertEvent & { ageBand: string }>;
};

async function countChannelSendsToday(
  sql: Sql,
  userId: string,
  savedSearchId: string,
  channel: "push" | "sms",
  now: Date,
) {
  const day = winnipegDayKey(now);
  const rows = await sql<{ n: number }>`
    select count(*)::int as n
    from search_alert_channel_sends
    where user_id = ${userId}
      and saved_search_id = ${savedSearchId}
      and channel = ${channel}
      and to_char(created_at at time zone ${ALERT_TZ}, 'YYYY-MM-DD') = ${day}
  `.catch(() => [{ n: 0 }]);
  return Number(rows[0]?.n) || 0;
}

async function recordChannelSend(
  sql: Sql,
  input: {
    userId: string;
    savedSearchId: string;
    daycareId: string;
    kind: string;
    channel: "email" | "in_app" | "push" | "sms";
  },
) {
  await sql`
    insert into search_alert_channel_sends (
      id, user_id, saved_search_id, daycare_id, kind, channel
    ) values (
      ${nid("scs")}, ${input.userId}, ${input.savedSearchId}, ${input.daycareId},
      ${input.kind}, ${input.channel}
    )
  `.catch(() => undefined);
}

/**
 * Hourly job (also the Inngest `search-alerts-hourly` step).
 * First pass baselines (notified=0). Later passes emit in-app + digest email.
 * sendPush / sendSms are called and no-op while FEATURE_PUSH / FEATURE_SMS are off.
 */
export async function runSearchAlertJob(opts?: { dryRun?: boolean; now?: Date }) {
  const dryRun = Boolean(opts?.dryRun);
  const now = opts?.now ?? new Date();
  const nowMs = now.getTime();
  const sql = await getSql();
  const searches = await sql<SavedSearchJobRow>`
    select id, user_id, name, center_lat, center_lng, center_label, radius_km,
           age_band, filters, alerts_enabled, last_checked_at
    from saved_searches
    where alerts_enabled = 1
    order by last_checked_at nulls first, updated_at
    limit 80
  `.catch(() => [] as SavedSearchJobRow[]);

  let checked = 0;
  let logged = 0;
  let notified = 0;
  let skippedInvalidOrigin = 0;
  let emailSent = 0;
  let emailStubbed = 0;
  let emailHeldQuiet = 0;
  let pushSkipped = 0;
  let smsSkipped = 0;
  const kinds: Record<SearchAlertKind, number> = {
    new_centre: 0,
    vacancy_reconfirmed: 0,
    waitlist_pulse: 0,
    request_reply: 0,
  };
  const digestByUser = new Map<string, DigestBucket[]>();
  const lastEmailByUser = new Map<string, string | Date | null>();

  for (const search of searches) {
    const lat = Number(search.center_lat);
    const lng = Number(search.center_lng);
    if (!isValidSearchOrigin(lat, lng)) {
      skippedInvalidOrigin += 1;
      console.info("[kidease-search-alerts] skip — invalid origin, not inventing lat/lng", search.id);
      continue;
    }
    const filters = parseSavedSearchFilters(search.filters);
    const matches = await findMatchingListings(
      { lat, lng },
      Number(search.radius_km),
      search.age_band,
      filters,
      search.center_label,
    );
    checked += 1;
    const baseline = !search.last_checked_at;
    const since = search.last_checked_at ? Date.parse(iso(search.last_checked_at) || "") : 0;

    const seenRows = await sql<{
      daycare_id: string;
      kind: string;
      vacancy_updated_at: string | Date | null;
      notified: number | boolean | null;
      seen_at: string | Date | null;
    }>`
      select daycare_id, kind, vacancy_updated_at, notified, seen_at
      from search_alert_candidates
      where saved_search_id = ${search.id}
    `.catch(() => []);
    const seenNew = new Set(seenRows.filter((r) => r.kind === "new_centre").map((r) => r.daycare_id));
    const seenVacancy = new Map(
      seenRows.filter((r) => r.kind === "vacancy_reconfirmed").map((r) => [r.daycare_id, iso(r.vacancy_updated_at)]),
    );
    const lastNotifiedAt = new Map<string, number>();
    for (const row of seenRows) {
      if (row.kind !== "new_centre" && row.kind !== "vacancy_reconfirmed") continue;
      if (row.notified !== 1 && row.notified !== true) continue;
      const ts = Date.parse(iso(row.seen_at) || "");
      if (!Number.isFinite(ts)) continue;
      lastNotifiedAt.set(`${row.daycare_id}:${row.kind}`, ts);
    }

    const events = planSearchAlertEvents({
      baseline,
      sinceMs: Number.isFinite(since) ? since : 0,
      nowMs,
      matches: matches.map((hit) => ({
        id: hit.id,
        slug: hit.slug,
        name: hit.name,
        city: hit.city,
        live: hit.live,
        claimed: hit.claimed,
        agesKnown: hit.agesKnown,
        ageMinMonths: hit.ageMinMonths,
        ageMaxMonths: hit.ageMaxMonths,
        lastVacancyUpdatedAt: hit.lastVacancyUpdatedAt ?? null,
        createdAt: "createdAt" in hit ? (hit.createdAt as string | null) : null,
        distanceKm: hit.distanceKm,
        amenities: amenityString(hit),
        visibility: "visibility" in hit ? ((hit as { visibility?: string | null }).visibility ?? null) : null,
        isTest: "isTest" in hit ? (hit as { isTest?: boolean | number | null }).isTest : null,
      })),
      seen: { seenNew, seenVacancy, lastNotifiedAt },
    });

    for (const ev of events) {
      logged += 1;
      kinds[ev.kind] += 1;
      const id = nid("sac");
      await sql`
        insert into search_alert_candidates (
          id, saved_search_id, daycare_id, kind, distance_km, vacancy_updated_at, notified, email_notified, seen_at
        ) values (
          ${id}, ${search.id}, ${ev.daycareId}, ${ev.kind}, ${ev.distanceKm},
          ${ev.vacancyAt}, ${baseline || dryRun ? 0 : 1}, 0, now()
        )
        on conflict (saved_search_id, daycare_id, kind) do update set
          distance_km = excluded.distance_km,
          vacancy_updated_at = excluded.vacancy_updated_at,
          notified = case when ${baseline || dryRun} then search_alert_candidates.notified else 1 end,
          seen_at = now()
      `.catch(() => undefined);
      console.info("[kidease-search-alerts] candidate", {
        searchId: search.id,
        kind: ev.kind,
        daycareId: ev.daycareId,
        slug: ev.slug,
        distanceKm: ev.distanceKm,
        baseline,
        dryRun,
      });
    }

    if (shouldNotifySearchAlert(baseline, dryRun, events.length)) {
      const prefs = await sql<PrefRow>`
        select email_enabled, in_app_enabled, last_email_at
        from search_alert_prefs where user_id = ${search.user_id} limit 1
      `.catch(() => [] as PrefRow[]);
      const emailOn = prefOn(prefs[0]?.email_enabled);
      const inAppOn = prefOn(prefs[0]?.in_app_enabled);
      lastEmailByUser.set(search.user_id, lastEmailByUser.get(search.user_id) ?? prefs[0]?.last_email_at ?? null);

      const ageBand = isAgeBand(search.age_band) ? search.age_band : "any";
      if (inAppOn) {
        for (const ev of events) {
          const copy = honestAlertCopy({
            kind: ev.kind,
            name: ev.name,
            distanceKm: ev.distanceKm,
            ageBand,
            originLabel: search.center_label,
            facilityType: ev.facilityType,
          });
          await sql`
            insert into search_alert_notices (id, user_id, saved_search_id, daycare_id, kind, title, body, link_path)
            values (
              ${nid("san")}, ${search.user_id}, ${search.id}, ${ev.daycareId}, ${ev.kind},
              ${copy.title}, ${copy.body}, ${`/daycare/${ev.slug}`}
            )
          `.catch(() => undefined);
          await recordChannelSend(sql, {
            userId: search.user_id,
            savedSearchId: search.id,
            daycareId: ev.daycareId,
            kind: ev.kind,
            channel: "in_app",
          });
        }
      }

      if (emailOn) {
        const pending = digestByUser.get(search.user_id) ?? [];
        pending.push({
          userId: search.user_id,
          savedSearchId: search.id,
          searchName: search.name,
          originLabel: search.center_label,
          events: events.map((ev) => ({ ...ev, ageBand })),
        });
        digestByUser.set(search.user_id, pending);
      }

      const { evaluateCaslSend } = await import("@/lib/server/casl-consent");
      const actor = await lookupUser(search.user_id);
      const phoneRows = await sql<{ phone: string | null }>`
        select phone from profiles where user_id = ${search.user_id} limit 1
      `.catch(() => [] as { phone: string | null }[]);
      const smsCasl = await evaluateCaslSend({
        userId: search.user_id,
        channel: "sms",
        purpose: "service",
        address: phoneRows[0]?.phone,
      });
      let pushToday = await countChannelSendsToday(sql, search.user_id, search.id, "push", now);
      let smsToday = await countChannelSendsToday(sql, search.user_id, search.id, "sms", now);
      for (const ev of events) {
        const copy = honestAlertCopy({
          kind: ev.kind,
          name: ev.name,
          distanceKm: ev.distanceKm,
          ageBand,
          originLabel: search.center_label,
          facilityType: ev.facilityType,
        });
        if (underPushSmsDailyCap(pushToday)) {
          const push = await sendPushNotification({
            userId: search.user_id,
            title: copy.title,
            body: copy.body,
          });
          if (push.ok) {
            pushToday += 1;
            await recordChannelSend(sql, {
              userId: search.user_id,
              savedSearchId: search.id,
              daycareId: ev.daycareId,
              kind: ev.kind,
              channel: "push",
            });
          } else {
            pushSkipped += 1;
          }
        } else {
          pushSkipped += 1;
        }
        if (underPushSmsDailyCap(smsToday)) {
          const sms = await sendSms({
            to: phoneRows[0]?.phone || "",
            body: copy.title,
            audience: "user",
            consentGranted: smsCasl.ok,
          });
          if (sms.ok) {
            smsToday += 1;
            await recordChannelSend(sql, {
              userId: search.user_id,
              savedSearchId: search.id,
              daycareId: ev.daycareId,
              kind: ev.kind,
              channel: "sms",
            });
          } else {
            smsSkipped += 1;
          }
        } else {
          smsSkipped += 1;
        }
      }
      notified += events.length;
    }

    if (!dryRun) {
      await sql`
        update saved_searches set last_checked_at = now() where id = ${search.id}
      `.catch(() => undefined);
    }
  }

  const pendingMail = await sql<{
    saved_search_id: string;
    daycare_id: string;
    kind: string;
    distance_km: number;
    user_id: string;
    search_name: string;
    center_label: string;
    age_band: string;
    slug: string;
    daycare_name: string;
    city: string;
    amenities: string | null;
  }>`
    select c.saved_search_id, c.daycare_id, c.kind, c.distance_km,
           s.user_id, s.name as search_name, s.center_label, s.age_band,
           d.slug, d.name as daycare_name, d.city, d.amenities
    from search_alert_candidates c
    join saved_searches s on s.id = c.saved_search_id
    join daycares d on d.id = c.daycare_id
    where c.notified = 1
      and coalesce(c.email_notified, 0) = 0
      and c.kind in ('new_centre', 'vacancy_reconfirmed')
  `.catch(() => []);
  for (const row of pendingMail) {
    if (row.kind !== "new_centre" && row.kind !== "vacancy_reconfirmed") continue;
    const buckets = digestByUser.get(row.user_id) ?? [];
    const already = buckets.some((b) =>
      b.events.some((ev) => ev.daycareId === row.daycare_id && ev.kind === row.kind),
    );
    if (already) continue;
    const ev: PlannedAlertEvent & { ageBand: string } = {
      daycareId: row.daycare_id,
      slug: row.slug,
      name: row.daycare_name,
      city: row.city,
      kind: row.kind,
      distanceKm: Number(row.distance_km) || 0,
      vacancyAt: null,
      facilityType: alertFacilityType({ amenities: row.amenities || "", name: row.daycare_name }),
      ageBand: row.age_band,
    };
    const hit = buckets.find((b) => b.savedSearchId === row.saved_search_id);
    if (hit) hit.events.push(ev);
    else {
      buckets.push({
        userId: row.user_id,
        savedSearchId: row.saved_search_id,
        searchName: row.search_name,
        originLabel: row.center_label,
        events: [ev],
      });
    }
    digestByUser.set(row.user_id, buckets);
  }

  for (const [userId, buckets] of digestByUser) {
    const events = buckets.flatMap((b) =>
      b.events.map((ev) => ({
        name: ev.name,
        city: ev.city,
        kind: ev.kind,
        distanceKm: ev.distanceKm,
        slug: ev.slug,
        title: honestAlertCopy({
          kind: ev.kind,
          name: ev.name,
          distanceKm: ev.distanceKm,
          ageBand: isAgeBand(ev.ageBand) ? ev.ageBand : "any",
          originLabel: buckets[0]?.originLabel,
          facilityType: ev.facilityType,
        }).title,
      })),
    );
    if (!events.length) continue;
    if (!canSendDigestEmail(lastEmailByUser.get(userId) ?? null, now)) {
      emailHeldQuiet += 1;
      console.info("[kidease-search-alerts] email held — quiet hours or already mailed today", userId);
      continue;
    }
    const { evaluateCaslSend } = await import("@/lib/server/casl-consent");
    const actor = await lookupUser(userId);
    const casl = await evaluateCaslSend({
      userId,
      channel: "email",
      purpose: "service",
      address: actor.email,
    });
    if (!casl.ok) {
      console.info("[kidease-search-alerts] email skipped — no CASL consent", userId);
      continue;
    }
    try {
      const mail = await sendSearchAlertEmail({
        userId,
        searchName: buckets.map((b) => b.searchName).filter(Boolean).join(" · ") || "Saved search",
        events,
      });
      if (mail.via === "stub") emailStubbed += 1;
      else emailSent += 1;
      await sql`
        insert into search_alert_prefs (user_id, email_enabled, in_app_enabled, last_email_at, updated_at)
        values (${userId}, 1, 1, now(), now())
        on conflict (user_id) do update set last_email_at = now()
      `.catch(() => undefined);
      for (const bucket of buckets) {
        for (const ev of bucket.events) {
          await sql`
            update search_alert_candidates
            set email_notified = 1
            where saved_search_id = ${bucket.savedSearchId}
              and daycare_id = ${ev.daycareId}
              and kind = ${ev.kind}
          `.catch(() => undefined);
          await recordChannelSend(sql, {
            userId,
            savedSearchId: bucket.savedSearchId,
            daycareId: ev.daycareId,
            kind: ev.kind,
            channel: "email",
          });
        }
      }
    } catch (err) {
      emailStubbed += 1;
      console.error("[kidease-search-alerts] email failed", err);
    }
  }

  const result = {
    ok: true as const,
    dryRun,
    searches: searches.length,
    checked,
    logged,
    notified,
    skippedInvalidOrigin,
    kinds,
    emailSent,
    emailStubbed,
    emailHeldQuiet,
    emailConfigured: resetMailConfigured(),
    pushSkipped,
    smsSkipped,
    // sendPush / sendSms ran; they no-op while flags are off.
    push: "wired-noop" as const,
    sms: "wired-noop" as const,
    tz: ALERT_TZ,
  };
  console.info("[kidease-search-alerts] job", result);
  return result;
}

function escMail(s: string) {
  return [...s]
    .map((ch) => {
      if (ch === "&") return "&#38;";
      if (ch === "<") return "&#60;";
      if (ch === ">") return "&#62;";
      if (ch === '"') return "&#34;";
      return ch;
    })
    .join("");
}

function searchAlertCopy(
  searchName: string,
  events: Array<{ name: string; city: string; kind: SearchAlertKind; distanceKm: number; title?: string }>,
  unsubUrl?: string | null,
) {
  const origin = process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca";
  const deskUrl = `${origin}/parent?tab=alerts`;
  const lines = events.slice(0, 8).map((ev) => {
    return `• ${ev.title || ev.name} (${ev.city}, ${ev.distanceKm} km)`;
  });
  const subject = `KidEase: updates for “${searchName}”`;
  const unsubLine = unsubUrl
    ? `\nUnsubscribe: ${unsubUrl}\nKidEase · Winnipeg, Manitoba · support@kidease.ca\n`
    : `\nUnsubscribe: ${origin}/unsubscribe\nKidEase · Winnipeg, Manitoba · support@kidease.ca\n`;
  const text = `A saved search on KidEase has an update. Confirm details with the centre — KidEase does not guarantee an opening.\n\n${lines.join("\n")}\n\nOpen your family desk: ${deskUrl}\n${unsubLine}`;
  const items = events
    .slice(0, 8)
    .map((ev) => {
      const line = ev.title || ev.name;
      return `<li style="margin:0 0 8px;"><strong>${escMail(line)}</strong><br/><span style="color:#5c6578;">${escMail(ev.city)} · ${ev.distanceKm} km</span></li>`;
    })
    .join("");
  const html = `<!doctype html>
<html><body style="font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fffcf8;border:1px solid #e3ddd3;border-radius:16px;">
    <tr><td style="padding:28px;">
      <p style="margin:0;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#5c6578;">KidEase</p>
      <h1 style="margin:12px 0 0;font-size:22px;line-height:1.25;">Updates for ${escMail(searchName)}</h1>
      <ul style="margin:16px 0 0;padding-left:18px;">${items}</ul>
      <p style="margin:24px 0 0;">
        <a href="${deskUrl}" style="display:inline-block;background:#1a3790;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;">Open family desk</a>
      </p>
      <p style="margin:24px 0 0;font-size:12px;color:#5c6578;">KidEase · Winnipeg, Manitoba · <a href="${escMail(unsubUrl || `${origin}/unsubscribe`)}" style="color:#1a3790;">Unsubscribe</a></p>
    </td></tr>
  </table>
</body></html>`;
  return { subject, text, html };
}

/**
 * Email delivery for saved-search alerts.
 * Uses Resend or SendGrid when those keys exist.
 * When they are missing, logs an honest stub and still keeps email_enabled.
 * Do not add FCM / APNs here.
 */
export async function sendSearchAlertEmail(payload: {
  userId: string;
  searchName: string;
  events: Array<{ name: string; city: string; kind: SearchAlertKind; distanceKm: number; slug: string; title?: string }>;
}) {
  const actor = await lookupUser(payload.userId);
  const to = actor.email?.trim();
  const { caslOneClickUrl, caslUnsubscribeUrl } = await import("@/lib/server/casl-consent");
  const unsubUrl = caslUnsubscribeUrl({
    userId: payload.userId,
    channel: "email",
    purpose: "service",
    address: to,
  });
  const oneClick = caslOneClickUrl({
    userId: payload.userId,
    channel: "email",
    purpose: "service",
    address: to,
  });
  const { subject, text, html } = searchAlertCopy(payload.searchName, payload.events, unsubUrl);

  if (!to) {
    console.info("[kidease-search-alerts] email stub — no parent email", payload.searchName);
    return { ok: true as const, via: "stub" as const };
  }

  const listUnsub = oneClick ? `<${oneClick}>` : unsubUrl ? `<${unsubUrl}>` : undefined;
  const resend = process.env.RESEND_API_KEY?.trim();
  if (resend) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: transactionalMailFrom(),
        to: [to],
        subject,
        text,
        html,
        headers: listUnsub
          ? { "List-Unsubscribe": listUnsub, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
          : undefined,
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    return { ok: true as const, via: "resend" as const };
  }

  const sendgrid = process.env.SENDGRID_API_KEY?.trim();
  if (sendgrid) {
    const fromMatch = transactionalMailFrom().match(/^(.*)<([^>]+)>$/);
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${sendgrid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromMatch?.[2]?.trim() || "login@send.kidease.ca", name: fromMatch?.[1]?.replace(/"/g, "").trim() || "KidEase" },
        subject,
        content: [
          { type: "text/plain", value: text },
          { type: "text/html", value: html },
        ],
        headers: listUnsub
          ? { "List-Unsubscribe": listUnsub, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
          : undefined,
      }),
    });
    if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
    return { ok: true as const, via: "sendgrid" as const };
  }

  console.info("[kidease-search-alerts] email stub — no RESEND_API_KEY / SENDGRID_API_KEY", to, subject, "\n", text);
  return { ok: true as const, via: "stub" as const };
}
