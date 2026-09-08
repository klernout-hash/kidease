/**
 * Waitlist pulse job: fan out one "spot open" event to matched parents.
 *
 * Delivery:
 *   - in-app family-desk notice (search_alert_notices kind waitlist_pulse)
 *   - SMS only when FEATURE_SMS + Twilio env + stored CASL sms/service consent
 *   - does NOT send FCM / APNs. FEATURE_PUSH stays off.
 *
 * Idempotency: unique (pulse_id, user_id, channel) on waitlist_pulse_deliveries.
 * One pulse row is one spot event. Cooldown lives on create, not here.
 */
import { getSql, type Sql } from "@/lib/db";
import { inngestConfigured, WAITLIST_PULSE_EVENT } from "@/lib/inngest";
import { isAgeBand, parseSavedSearchFilters, type AgeBand } from "@/lib/saved-search";
import { evaluateCaslSend } from "@/lib/server/casl-consent";
import { sendSms } from "@/lib/server/sms";
import { isPublicListing } from "@/lib/listing-visibility";
import { nid } from "@/lib/utils";
import {
  ageBandsWithSpots,
  interestMatchesPulseAge,
  savedSearchMatchesPulse,
  spotsLabel,
  waitlistPulseNoticeCopy,
  waitlistPulseSmsBody,
  type WaitlistMatchSource,
  type WaitlistPulseChannel,
  type WaitlistPulseSource,
  type WaitlistSpotCounts,
} from "@/lib/waitlist-pulse";

type DaycarePulseRow = {
  id: string;
  slug: string;
  name: string;
  city: string;
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
  last_vacancy_updated_at: string | Date | null;
  visibility: string | null;
  is_test: number | boolean | null;
  province: string | null;
};

type PulseRow = {
  id: string;
  daycare_id: string;
  spots_infant: number;
  spots_toddler: number;
  spots_preschool: number;
};

type Recipient = {
  userId: string;
  ageBand: AgeBand;
  notifyInApp: boolean;
  notifySms: boolean;
  matchSource: WaitlistMatchSource;
};

export type WaitlistPulseJobResult = {
  ok: true;
  pulseId: string;
  daycareId: string;
  dryRun: boolean;
  matched: number;
  inAppSent: number;
  smsSent: number;
  smsSkipped: number;
  smsStubbed: number;
  // Push is intentionally not invoked. FEATURE_PUSH stays off-by-default.
  push: "skipped";
};

function appOrigin() {
  return (process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca").replace(/\/$/, "");
}

function spotsFromRow(row: { spots_infant: number; spots_toddler: number; spots_preschool: number }): WaitlistSpotCounts {
  return {
    infant: Number(row.spots_infant) || 0,
    toddler: Number(row.spots_toddler) || 0,
    preschool: Number(row.spots_preschool) || 0,
  };
}

function flagOn(value: number | boolean | null | undefined) {
  return value === 1 || value === true;
}

function mergeRecipient(map: Map<string, Recipient>, next: Recipient) {
  const prev = map.get(next.userId);
  if (!prev) {
    map.set(next.userId, next);
    return;
  }
  const rank: Record<WaitlistMatchSource, number> = {
    listing_opt_in: 3,
    waitlist_booking: 2,
    saved_search: 1,
  };
  map.set(next.userId, {
    userId: next.userId,
    ageBand: prev.ageBand === "any" ? next.ageBand : prev.ageBand,
    notifyInApp: prev.notifyInApp || next.notifyInApp,
    notifySms: prev.notifySms || next.notifySms,
    matchSource: rank[next.matchSource] > rank[prev.matchSource] ? next.matchSource : prev.matchSource,
  });
}

function listingForMatch(row: DaycarePulseRow) {
  return {
    lat: Number(row.lat),
    lng: Number(row.lng),
    live: Boolean(row.claimed_at),
    availabilityKnown: true,
    spotsInfant: Number(row.spots_infant) || 0,
    spotsToddler: Number(row.spots_toddler) || 0,
    spotsPreschool: Number(row.spots_preschool) || 0,
    amenities: row.amenities || "",
    hours: row.hours || "",
    agesKnown: true,
    ageMinMonths: Number(row.age_min_months) || 0,
    ageMaxMonths: Number(row.age_max_months) || 0,
    lastVacancyUpdatedAt: row.last_vacancy_updated_at
      ? row.last_vacancy_updated_at instanceof Date
        ? row.last_vacancy_updated_at.toISOString()
        : String(row.last_vacancy_updated_at)
      : null,
    claimStatus: row.claim_status,
    claimed: Boolean(row.claimed_at),
    claimedAt: row.claimed_at
      ? row.claimed_at instanceof Date
        ? row.claimed_at.toISOString()
        : String(row.claimed_at)
      : null,
    province: row.province || "MB",
  };
}

export async function findWaitlistPulseRecipients(
  sql: Sql,
  daycare: DaycarePulseRow,
  spots: WaitlistSpotCounts,
): Promise<Recipient[]> {
  const map = new Map<string, Recipient>();

  const interests = await sql<{
    user_id: string;
    age_band: string;
    notify_in_app: number | boolean;
    notify_sms: number | boolean;
  }>`
    select user_id, age_band, notify_in_app, notify_sms
    from waitlist_interests
    where daycare_id = ${daycare.id}
  `.catch(() => []);

  for (const row of interests) {
    const ageBand = isAgeBand(row.age_band) ? row.age_band : "any";
    if (!interestMatchesPulseAge(ageBand, ageBandsWithSpots(spots))) continue;
    mergeRecipient(map, {
      userId: row.user_id,
      ageBand,
      notifyInApp: flagOn(row.notify_in_app),
      notifySms: flagOn(row.notify_sms),
      matchSource: "listing_opt_in",
    });
  }

  const bookings = await sql<{ user_id: string; age_group: string }>`
    select user_id, age_group
    from bookings
    where daycare_id = ${daycare.id}
      and status in ('requested', 'under_review', 'waitlist')
  `.catch(() => []);

  for (const row of bookings) {
    const ageBand = isAgeBand(row.age_group) ? row.age_group : "any";
    if (!interestMatchesPulseAge(ageBand, ageBandsWithSpots(spots))) continue;
    mergeRecipient(map, {
      userId: row.user_id,
      ageBand,
      notifyInApp: true,
      notifySms: true,
      matchSource: "waitlist_booking",
    });
  }

  const searches = await sql<{
    user_id: string;
    center_lat: number;
    center_lng: number;
    radius_km: number;
    age_band: string;
    filters: unknown;
  }>`
    select user_id, center_lat, center_lng, radius_km, age_band, filters
    from saved_searches
    where alerts_enabled = 1
  `.catch(() => []);

  const listing = listingForMatch(daycare);
  for (const search of searches) {
    const ageBand = isAgeBand(search.age_band) ? search.age_band : "any";
    if (
      !savedSearchMatchesPulse(
        listing,
        {
          centerLat: Number(search.center_lat),
          centerLng: Number(search.center_lng),
          radiusKm: Number(search.radius_km),
          ageBand,
          filters: parseSavedSearchFilters(search.filters),
        },
        spots,
      )
    ) {
      continue;
    }
    mergeRecipient(map, {
      userId: search.user_id,
      ageBand,
      notifyInApp: true,
      notifySms: true,
      matchSource: "saved_search",
    });
  }

  return [...map.values()];
}

async function alreadyDelivered(
  sql: Sql,
  pulseId: string,
  userId: string,
  channel: WaitlistPulseChannel,
): Promise<boolean> {
  const rows = await sql<{ n: number }>`
    select 1 as n from waitlist_pulse_deliveries
    where pulse_id = ${pulseId} and user_id = ${userId} and channel = ${channel}
    limit 1
  `.catch(() => []);
  return Boolean(rows[0]);
}

async function recordDelivery(
  sql: Sql,
  input: {
    pulseId: string;
    userId: string;
    daycareId: string;
    channel: WaitlistPulseChannel;
    status: "sent" | "skipped" | "stubbed" | "failed";
    matchSource: WaitlistMatchSource;
    detail?: string;
  },
) {
  await sql`
    insert into waitlist_pulse_deliveries (
      id, pulse_id, user_id, daycare_id, channel, status, match_source, detail
    ) values (
      ${nid("wpd")}, ${input.pulseId}, ${input.userId}, ${input.daycareId},
      ${input.channel}, ${input.status}, ${input.matchSource}, ${input.detail || null}
    )
    on conflict (pulse_id, user_id, channel) do nothing
  `.catch(() => undefined);
}

async function deliverInApp(
  sql: Sql,
  input: {
    pulseId: string;
    userId: string;
    daycare: DaycarePulseRow;
    matchSource: WaitlistMatchSource;
    dryRun: boolean;
  },
): Promise<"sent" | "skipped"> {
  if (await alreadyDelivered(sql, input.pulseId, input.userId, "in_app")) return "skipped";
  const copy = waitlistPulseNoticeCopy(input.daycare.name, input.daycare.city, input.matchSource);
  if (!input.dryRun) {
    await sql`
      insert into search_alert_notices (id, user_id, saved_search_id, daycare_id, kind, title, body)
      values (${nid("san")}, ${input.userId}, null, ${input.daycare.id}, 'waitlist_pulse', ${copy.title}, ${copy.body})
    `.catch(() => undefined);
    await recordDelivery(sql, {
      pulseId: input.pulseId,
      userId: input.userId,
      daycareId: input.daycare.id,
      channel: "in_app",
      status: "sent",
      matchSource: input.matchSource,
    });
  }
  return "sent";
}

async function deliverSms(
  sql: Sql,
  input: {
    pulseId: string;
    userId: string;
    daycare: DaycarePulseRow;
    spots: WaitlistSpotCounts;
    matchSource: WaitlistMatchSource;
    dryRun: boolean;
  },
): Promise<"sent" | "skipped" | "stubbed"> {
  if (await alreadyDelivered(sql, input.pulseId, input.userId, "sms")) return "skipped";
  const phones = await sql<{ phone: string | null }>`
    select phone from profiles where user_id = ${input.userId} limit 1
  `.catch(() => []);
  const phone = phones[0]?.phone || "";
  const casl = await evaluateCaslSend({
    userId: input.userId,
    channel: "sms",
    purpose: "service",
    address: phone,
  });
  const listingUrl = `${appOrigin()}/daycare/${input.daycare.slug}`;
  const body = waitlistPulseSmsBody(input.daycare.name, listingUrl, input.spots);

  if (!casl.ok) {
    if (!input.dryRun) {
      await recordDelivery(sql, {
        pulseId: input.pulseId,
        userId: input.userId,
        daycareId: input.daycare.id,
        channel: "sms",
        status: "skipped",
        matchSource: input.matchSource,
        detail: casl.error,
      });
    }
    return "skipped";
  }

  if (input.dryRun) return "skipped";

  const result = await sendSms({
    to: phone,
    body,
    audience: "user",
    consentGranted: true,
  });
  const status = result.ok ? "sent" : result.skipped ? "stubbed" : "failed";
  await recordDelivery(sql, {
    pulseId: input.pulseId,
    userId: input.userId,
    daycareId: input.daycare.id,
    channel: "sms",
    status,
    matchSource: input.matchSource,
    detail: result.ok ? undefined : result.error,
  });
  return status === "sent" ? "sent" : status === "failed" ? "skipped" : "stubbed";
}

export async function runWaitlistPulseJob(input: {
  pulseId: string;
  dryRun?: boolean;
}): Promise<WaitlistPulseJobResult> {
  const dryRun = Boolean(input.dryRun);
  const pulseId = String(input.pulseId || "").trim();
  const empty = (daycareId: string): WaitlistPulseJobResult => ({
    ok: true,
    pulseId,
    daycareId,
    dryRun,
    matched: 0,
    inAppSent: 0,
    smsSent: 0,
    smsSkipped: 0,
    smsStubbed: 0,
    push: "skipped",
  });
  if (!pulseId) return empty("");

  const sql = await getSql();
  const pulses = await sql<PulseRow>`
    select id, daycare_id, spots_infant, spots_toddler, spots_preschool
    from waitlist_pulses
    where id = ${pulseId}
    limit 1
  `.catch(() => []);
  const pulse = pulses[0];
  if (!pulse) return empty("");

  const daycares = await sql<DaycarePulseRow>`
    select id, slug, name, city, lat, lng, hours, amenities, age_min_months, age_max_months,
      spots_infant, spots_toddler, spots_preschool, claimed_at, claim_status,
      last_vacancy_updated_at, visibility, is_test, province
    from daycares
    where id = ${pulse.daycare_id}
    limit 1
  `.catch(() => []);
  const daycare = daycares[0];
  if (
    !daycare ||
    !isPublicListing({
      visibility: daycare.visibility === "admin_only" ? "admin_only" : "public",
      isTest: daycare.is_test === 1 || daycare.is_test === true,
      id: daycare.id,
      slug: daycare.slug,
    })
  ) {
    return empty(pulse.daycare_id);
  }

  const spots = spotsFromRow(pulse);
  const recipients = await findWaitlistPulseRecipients(sql, daycare, spots);
  let inAppSent = 0;
  let smsSent = 0;
  let smsSkipped = 0;
  let smsStubbed = 0;

  for (const rec of recipients) {
    if (rec.notifyInApp) {
      const inApp = await deliverInApp(sql, {
        pulseId,
        userId: rec.userId,
        daycare,
        matchSource: rec.matchSource,
        dryRun,
      });
      if (inApp === "sent") inAppSent += 1;
    }
    if (rec.notifySms) {
      const sms = await deliverSms(sql, {
        pulseId,
        userId: rec.userId,
        daycare,
        spots,
        matchSource: rec.matchSource,
        dryRun,
      });
      if (sms === "sent") smsSent += 1;
      else if (sms === "stubbed") smsStubbed += 1;
      else smsSkipped += 1;
    }
  }

  const result: WaitlistPulseJobResult = {
    ok: true,
    pulseId,
    daycareId: daycare.id,
    dryRun,
    matched: recipients.length,
    inAppSent,
    smsSent,
    smsSkipped,
    smsStubbed,
    push: "skipped",
  };
  console.info("[kidease-waitlist-pulse] job", {
    ...result,
    spots: spotsLabel(spots),
  });
  return result;
}

export async function insertWaitlistPulse(input: {
  daycareId: string;
  actorUserId: string;
  spots: WaitlistSpotCounts;
  source: WaitlistPulseSource;
}): Promise<{ pulseId: string }> {
  const sql = await getSql();
  const pulseId = nid("wlp");
  await sql`
    insert into waitlist_pulses (
      id, daycare_id, actor_user_id, spots_infant, spots_toddler, spots_preschool, source
    ) values (
      ${pulseId}, ${input.daycareId}, ${input.actorUserId},
      ${input.spots.infant}, ${input.spots.toddler}, ${input.spots.preschool}, ${input.source}
    )
  `;
  await sql`
    update daycares
    set last_vacancy_updated_at = now()
    where id = ${input.daycareId}
  `.catch(() => undefined);
  return { pulseId };
}

/**
 * Send the Inngest event when Cloud keys exist; otherwise run the job inline
 * so local / preview still pulses. Event id = pulseId (one fan-out per event).
 */
export async function enqueueWaitlistPulse(input: {
  pulseId: string;
  daycareId: string;
}): Promise<{ queued: boolean; result?: WaitlistPulseJobResult }> {
  if (inngestConfigured()) {
    try {
      const { inngest } = await import("@/inngest/client");
      await inngest.send({
        id: input.pulseId,
        name: WAITLIST_PULSE_EVENT,
        data: { pulseId: input.pulseId, daycareId: input.daycareId },
      });
      return { queued: true };
    } catch (err) {
      console.error("[kidease-waitlist-pulse] inngest send failed — running inline", err);
    }
  }
  const result = await runWaitlistPulseJob({ pulseId: input.pulseId });
  return { queued: false, result };
}
