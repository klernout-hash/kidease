/**
 * Geofence match query + cron/queue stub for saved-search alerts.
 *
 * Uses the same PostGIS ST_DWithin + st_makepoint(lng, lat) pattern as nearby.ts.
 * Origins come from saved_searches (the parent's live search). Never invent lat/lng.
 *
 * Delivery:
 *   - in-app notices when search_alert_prefs.in_app_enabled
 *   - email via Resend/SendGrid when those keys exist; otherwise an honest stub
 *   - does NOT send FCM / APNs. FEATURE_PUSH stays off-by-default.
 */
import { getSql, dbSource, type Sql } from "@/lib/db";
import { lookupUser } from "@/lib/server/notify";
import { resetMailConfigured } from "@/lib/server/reset-mail-config";
import { nearbyListings } from "@/lib/server/nearby";
import { overlayClaimed } from "@/lib/server/claims";
import { catchmentMatch, clampRadiusKm, distanceKm } from "@/lib/proximity";
import { isPublicListing } from "@/lib/listing-visibility";
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

const MAIL_FROM = (process.env.MAIL_FROM || "KidEase <kyle@kidease.ca>").trim();

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
  and coalesce(visibility, 'public') = 'public'
  and coalesce(is_test, 0) = 0
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
  and coalesce(visibility, 'public') = 'public'
  and coalesce(is_test, 0) = 0
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
        return geo.filter((row) => isPublicListing({ visibility: row.visibility === "admin_only" ? "admin_only" : "public", isTest: row.is_test === 1 || row.is_test === true }));
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
      .filter((row) =>
        isPublicListing({
          visibility: row.visibility === "admin_only" ? "admin_only" : "public",
          isTest: row.is_test === 1 || row.is_test === true,
        }),
      );
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

type PrefRow = { email_enabled: number | boolean; in_app_enabled: number | boolean };

function prefOn(value: number | boolean | undefined, fallback = true) {
  if (value == null) return fallback;
  return value !== 0 && value !== false;
}

/**
 * Cron / queue stub (also the Inngest `search-alerts-hourly` step).
 * Logs matching candidates. First pass baselines (no notify).
 * Later passes emit in-app notices and attempt email. Never calls FCM.
 */
export async function runSearchAlertJob(opts?: { dryRun?: boolean }) {
  const dryRun = Boolean(opts?.dryRun);
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
  const kinds: Record<SearchAlertKind, number> = { new_centre: 0, vacancy_reconfirmed: 0, waitlist_pulse: 0 };

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

    const seen = await sql<{ daycare_id: string; kind: string; vacancy_updated_at: string | Date | null }>`
      select daycare_id, kind, vacancy_updated_at
      from search_alert_candidates
      where saved_search_id = ${search.id}
    `.catch(() => []);
    const seenNew = new Set(seen.filter((r) => r.kind === "new_centre").map((r) => r.daycare_id));
    const seenVacancy = new Map(
      seen.filter((r) => r.kind === "vacancy_reconfirmed").map((r) => [r.daycare_id, iso(r.vacancy_updated_at)]),
    );

    const events: Array<{
      daycareId: string;
      slug: string;
      name: string;
      city: string;
      kind: SearchAlertKind;
      distanceKm: number;
      vacancyAt: string | null;
    }> = [];

    for (const hit of matches) {
      if (!seenNew.has(hit.id)) {
        events.push({
          daycareId: hit.id,
          slug: hit.slug,
          name: hit.name,
          city: hit.city,
          kind: "new_centre",
          distanceKm: hit.distanceKm,
          vacancyAt: hit.lastVacancyUpdatedAt ?? null,
        });
      }
      const vacancyAt = hit.lastVacancyUpdatedAt ?? null;
      if (vacancyAt) {
        const prev = seenVacancy.get(hit.id);
        const vacancyTs = Date.parse(vacancyAt);
        const isReconfirm = !baseline && Number.isFinite(vacancyTs) && vacancyTs > since && vacancyAt !== prev;
        if (isReconfirm) {
          events.push({
            daycareId: hit.id,
            slug: hit.slug,
            name: hit.name,
            city: hit.city,
            kind: "vacancy_reconfirmed",
            distanceKm: hit.distanceKm,
            vacancyAt,
          });
        }
      }
    }

    for (const ev of events) {
      logged += 1;
      kinds[ev.kind] += 1;
      const id = nid("sac");
      await sql`
        insert into search_alert_candidates (
          id, saved_search_id, daycare_id, kind, distance_km, vacancy_updated_at, notified, seen_at
        ) values (
          ${id}, ${search.id}, ${ev.daycareId}, ${ev.kind}, ${ev.distanceKm},
          ${ev.vacancyAt}, ${baseline || dryRun ? 0 : 1}, now()
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

    if (!baseline && !dryRun && events.length) {
      const prefs = await sql<PrefRow>`
        select email_enabled, in_app_enabled from search_alert_prefs where user_id = ${search.user_id} limit 1
      `.catch(() => [] as PrefRow[]);
      const emailOn = prefOn(prefs[0]?.email_enabled);
      const inAppOn = prefOn(prefs[0]?.in_app_enabled);
      if (inAppOn) {
        for (const ev of events) {
          const title =
            ev.kind === "vacancy_reconfirmed"
              ? `${ev.name} reconfirmed open spots`
              : `New centre near ${search.center_label.split(",")[0] || "you"}: ${ev.name}`;
          const body = `${ev.city} · ${ev.distanceKm} km · ${search.name}`;
          await sql`
            insert into search_alert_notices (id, user_id, saved_search_id, daycare_id, kind, title, body)
            values (${nid("san")}, ${search.user_id}, ${search.id}, ${ev.daycareId}, ${ev.kind}, ${title}, ${body})
          `.catch(() => undefined);
        }
      }
      if (emailOn) {
        const { evaluateCaslSend } = await import("@/lib/server/casl-consent");
        const actor = await lookupUser(search.user_id);
        const casl = await evaluateCaslSend({
          userId: search.user_id,
          channel: "email",
          purpose: "service",
          address: actor.email,
        });
        if (!casl.ok) {
          console.info("[kidease-search-alerts] email skipped — no CASL consent", search.user_id);
        } else {
          try {
            const mail = await sendSearchAlertEmail({
              userId: search.user_id,
              searchName: search.name,
              events,
            });
            if (mail.via === "stub") emailStubbed += 1;
            else emailSent += 1;
          } catch (err) {
            emailStubbed += 1;
            console.error("[kidease-search-alerts] email failed", err);
          }
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
    emailConfigured: resetMailConfigured(),
    // Push is intentionally not invoked. FEATURE_PUSH stays off-by-default.
    push: "skipped" as const,
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
  events: Array<{ name: string; city: string; kind: SearchAlertKind; distanceKm: number }>,
  unsubUrl?: string | null,
) {
  const origin = process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://kidease.ca";
  const deskUrl = `${origin}/parent?tab=alerts`;
  const lines = events.slice(0, 8).map((ev) => {
    const kind = ev.kind === "vacancy_reconfirmed" ? "spots reconfirmed" : "new centre";
    return `• ${ev.name} (${ev.city}, ${ev.distanceKm} km) — ${kind}`;
  });
  const subject = `KidEase: updates for “${searchName}”`;
  const unsubLine = unsubUrl
    ? `\nUnsubscribe: ${unsubUrl}\nKidEase · Winnipeg, Manitoba · support@kidease.ca\n`
    : `\nUnsubscribe: ${origin}/unsubscribe\nKidEase · Winnipeg, Manitoba · support@kidease.ca\n`;
  const text = `A saved search on KidEase has a match.\n\n${lines.join("\n")}\n\nOpen your family desk: ${deskUrl}\n${unsubLine}`;
  const items = events
    .slice(0, 8)
    .map((ev) => {
      const kind = ev.kind === "vacancy_reconfirmed" ? "Spots reconfirmed" : "New centre";
      return `<li style="margin:0 0 8px;"><strong>${escMail(ev.name)}</strong> · ${escMail(ev.city)} · ${ev.distanceKm} km<br/><span style="color:#5c6578;">${kind}</span></li>`;
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
  events: Array<{ name: string; city: string; kind: SearchAlertKind; distanceKm: number; slug: string }>;
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
        from: MAIL_FROM,
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
    const fromMatch = MAIL_FROM.match(/^(.*)<([^>]+)>$/);
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${sendgrid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromMatch?.[2]?.trim() || "kyle@kidease.ca", name: fromMatch?.[1]?.replace(/"/g, "").trim() || "KidEase" },
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
