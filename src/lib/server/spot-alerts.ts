import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { callAi } from "@/lib/ai/client";
import { AI_FLAGS } from "@/lib/ai/flags";
import { fetchAiFeatureFlags } from "@/lib/ai/flag-fetch";
import { scrubText } from "@/lib/ai/pii";
import {
  asAgeBand,
  groundSpotAlert,
  openSpotTotal,
  spotAlertFacts,
  spotAlertModelUser,
  spotAlertQuiet,
  spotAlertSchema,
  SPOT_ALERT_SYSTEM,
  spotCounts,
  summarizeSpotFits,
  type SpotParentFact,
} from "@/lib/ai/spot-alerts";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { distanceKm } from "@/lib/proximity";
import { assertCentreCanMutateListing } from "@/lib/server/centre-access";
import { evaluateCaslSend, caslOneClickUrl, caslUnsubscribeUrl } from "@/lib/server/casl-consent";
import { isSuppressed } from "@/lib/server/email-suppressions";
import { transactionalMailFrom } from "@/lib/mail-from";
import { nid } from "@/lib/utils";

type DaycareSpotRow = {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
  spots_infant: number;
  spots_toddler: number;
  spots_preschool: number;
};

export type SpotAlertDraft = {
  ok: true;
  id: string;
  matched: number;
  age: number;
  start: number;
  distance: number;
  body: string;
  empty: boolean;
};

function appOrigin() {
  return (process.env.APP_ORIGIN || process.env.VITE_APP_URL || "https://www.kidease.ca").replace(/\/$/, "");
}

async function ipHashFor(userId: string): Promise<string> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { clientIpFromHeaders } = await import("@/lib/server-fn-throttle");
    const ip = clientIpFromHeaders(getRequest().headers) || userId;
    return createHash("sha256").update(ip).digest("hex").slice(0, 16);
  } catch {
    return createHash("sha256").update(userId).digest("hex").slice(0, 16);
  }
}

async function flagOn(userId: string): Promise<boolean> {
  const snapshot = await fetchAiFeatureFlags({ distinctId: userId });
  return snapshot.reached === true && snapshot.flags[AI_FLAGS.spotAlerts] === true;
}

async function loadDaycare(daycareId: string): Promise<DaycareSpotRow | null> {
  const sql = await getSql();
  const rows = await sql<DaycareSpotRow>`
    select id, name, city, lat, lng, spots_infant, spots_toddler, spots_preschool
    from daycares
    where id = ${daycareId}
    limit 1
  `.catch(() => [] as DaycareSpotRow[]);
  return rows[0] ?? null;
}

async function loadParentFacts(daycare: DaycareSpotRow): Promise<SpotParentFact[]> {
  const sql = await getSql();
  const facts: SpotParentFact[] = [];
  const interests = await sql<{ user_id: string; age_band: string }>`
    select user_id, age_band from waitlist_interests where daycare_id = ${daycare.id}
  `.catch(() => [] as Array<{ user_id: string; age_band: string }>);
  for (const row of interests) {
    facts.push({
      userId: row.user_id,
      ageBand: asAgeBand(row.age_band),
      startDate: null,
      distanceKm: null,
      radiusKm: 25,
    });
  }
  const bookings = await sql<{ user_id: string; age_group: string; start_date: string | null }>`
    select user_id, age_group, start_date
    from bookings
    where daycare_id = ${daycare.id}
      and status in ('requested', 'under_review', 'waitlist')
  `.catch(() => [] as Array<{ user_id: string; age_group: string; start_date: string | null }>);
  for (const row of bookings) {
    const start = row.start_date ? String(row.start_date).slice(0, 10) : null;
    facts.push({
      userId: row.user_id,
      ageBand: asAgeBand(row.age_group),
      startDate: start,
      distanceKm: null,
      radiusKm: 25,
    });
  }
  const searches = await sql<{
    user_id: string;
    center_lat: number;
    center_lng: number;
    radius_km: number;
    age_band: string;
  }>`
    select user_id, center_lat, center_lng, radius_km, age_band
    from saved_searches
    where alerts_enabled = 1
  `.catch(() => [] as Array<{ user_id: string; center_lat: number; center_lng: number; radius_km: number; age_band: string }>);
  const origin = { lat: Number(daycare.lat), lng: Number(daycare.lng) };
  for (const row of searches) {
    const point = { lat: Number(row.center_lat), lng: Number(row.center_lng) };
    const km =
      Number.isFinite(origin.lat) && Number.isFinite(origin.lng) && Number.isFinite(point.lat) && Number.isFinite(point.lng)
        ? distanceKm(origin, point)
        : Number.POSITIVE_INFINITY;
    facts.push({
      userId: row.user_id,
      ageBand: asAgeBand(row.age_band),
      startDate: null,
      distanceKm: km,
      radiusKm: Number(row.radius_km) || 25,
    });
  }
  return facts;
}

function esc(value: string): string {
  const amp = String.fromCharCode(38);
  return [...value]
    .map((ch) => {
      if (ch === amp) return amp + "amp;";
      if (ch === "<") return amp + "lt;";
      if (ch === ">") return amp + "gt;";
      if (ch === '"') return amp + "quot;";
      return ch;
    })
    .join("");
}

async function sendSpotMail(input: { to: string; userId: string; subject: string; text: string; html: string }) {
  const unsub = caslUnsubscribeUrl({ userId: input.userId, channel: "email", purpose: "service", address: input.to });
  const oneClick = caslOneClickUrl({ userId: input.userId, channel: "email", purpose: "service", address: input.to });
  const listUnsub = oneClick ? `<${oneClick}>` : unsub ? `<${unsub}>` : undefined;
  const headers = listUnsub
    ? { "List-Unsubscribe": listUnsub, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : undefined;
  const resend = process.env.RESEND_API_KEY?.trim();
  if (resend) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: transactionalMailFrom(),
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
        headers,
      }),
    });
    if (!res.ok) return "failed" as const;
    return "sent" as const;
  }
  const sendgrid = process.env.SENDGRID_API_KEY?.trim();
  if (sendgrid) {
    const from = transactionalMailFrom();
    const match = from.match(/^(.*)<([^>]+)>$/);
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${sendgrid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }] }],
        from: {
          email: match?.[2]?.trim() || "noreply@send.kidease.ca",
          name: match?.[1]?.replace(/"/g, "").trim() || "KidEase",
        },
        subject: input.subject,
        content: [
          { type: "text/plain", value: input.text },
          { type: "text/html", value: input.html },
        ],
        headers,
      }),
    });
    if (!res.ok) return "failed" as const;
    return "sent" as const;
  }
  return "stubbed" as const;
}

export const prepareSpotAlert = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string } | undefined) => ({
    daycareId: String(input?.daycareId || "").trim().slice(0, 80),
  }))
  .handler(async ({ context, data }): Promise<SpotAlertDraft | { ok: false; error: "off" | "missing" }> => {
    if (!data.daycareId) return { ok: false, error: "missing" };
    if (!(await flagOn(context.userId))) return { ok: false, error: "off" };
    const sql = await getSql();
    await assertCentreCanMutateListing(sql, context.userId, data.daycareId);
    const daycare = await loadDaycare(data.daycareId);
    if (!daycare) return { ok: false, error: "missing" };
    const spots = spotCounts({
      infant: Number(daycare.spots_infant) || 0,
      toddler: Number(daycare.spots_toddler) || 0,
      preschool: Number(daycare.spots_preschool) || 0,
    });
    const fit = openSpotTotal(spots) > 0 ? summarizeSpotFits(await loadParentFacts(daycare), spots) : summarizeSpotFits([], spots);
    const facts = spotAlertFacts({ name: daycare.name, city: daycare.city, spots, fit });
    let body = "";
    if (fit.matched > 0) {
      const { logAiCall, readAiCache, writeAiCache } = await import("@/lib/server/ai-usage");
      const result = await callAi({
        feature: "spot-alerts",
        system: SPOT_ALERT_SYSTEM,
        user: spotAlertModelUser(facts),
        schema: spotAlertSchema,
        userId: context.userId,
        ipHash: await ipHashFor(context.userId),
        maxTokens: 120,
        deps: {
          log: logAiCall,
          readCache: readAiCache,
          writeCache: (key, cached) => writeAiCache("spot-alerts", key, cached),
        },
      });
      body = groundSpotAlert(result.ok ? result.data : null, facts).body;
    }
    const id = nid("sad");
    await sql`
      insert into spot_alert_drafts (
        id, daycare_id, actor_user_id, matched, fit_age, fit_start, fit_distance,
        spots_infant, spots_toddler, spots_preschool, body, status
      ) values (
        ${id}, ${daycare.id}, ${context.userId}, ${fit.matched}, ${fit.age}, ${fit.start}, ${fit.distance},
        ${spots.infant}, ${spots.toddler}, ${spots.preschool}, ${body}, 'draft'
      )
    `;
    return {
      ok: true,
      id,
      matched: fit.matched,
      age: fit.age,
      start: fit.start,
      distance: fit.distance,
      body,
      empty: fit.matched === 0,
    };
  });

export const sendSpotAlert = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; draftId?: string; body?: string } | undefined) => ({
    daycareId: String(input?.daycareId || "").trim().slice(0, 80),
    draftId: String(input?.draftId || "").trim().slice(0, 80),
    body: scrubText(String(input?.body || "")).replace(/\s+/g, " ").trim().slice(0, 500),
  }))
  .handler(async ({ context, data }) => {
    if (!data.daycareId || !data.draftId) return { ok: false as const, error: "missing" as const };
    if (!(await flagOn(context.userId))) return { ok: false as const, error: "off" as const };
    if (spotAlertQuiet()) return { ok: false as const, error: "quiet" as const };
    const sql = await getSql();
    await assertCentreCanMutateListing(sql, context.userId, data.daycareId);
    const drafts = await sql<{ id: string; body: string; status: string }>`
      select id, body, status from spot_alert_drafts
      where id = ${data.draftId} and daycare_id = ${data.daycareId}
      limit 1
    `;
    const draft = drafts[0];
    if (!draft) return { ok: false as const, error: "missing" as const };
    if (draft.status === "sent") return { ok: true as const, already: true as const, inApp: 0, email: 0, skipped: 0 };
    const daycare = await loadDaycare(data.daycareId);
    if (!daycare) return { ok: false as const, error: "missing" as const };
    const spots = spotCounts({
      infant: Number(daycare.spots_infant) || 0,
      toddler: Number(daycare.spots_toddler) || 0,
      preschool: Number(daycare.spots_preschool) || 0,
    });
    if (openSpotTotal(spots) === 0) return { ok: false as const, error: "empty" as const };
    const fit = summarizeSpotFits(await loadParentFacts(daycare), spots);
    if (fit.matched === 0) return { ok: false as const, error: "empty" as const };
    const body = data.body || scrubText(draft.body).slice(0, 500);
    if (!body) return { ok: false as const, error: "empty" as const };
    const { lookupUser } = await import("@/lib/server/notify");
    const title = `${daycare.name.replace(/\s+/g, " ").trim().slice(0, 80) || "A centre"} has an open spot`;
    const unsubFooter = `\n\nUnsubscribe: ${appOrigin()}/unsubscribe`;
    let inApp = 0;
    let email = 0;
    let skipped = 0;
    for (const userId of fit.userIds) {
      const prefs = await sql<{ email_enabled: number | boolean | null; in_app_enabled: number | boolean | null }>`
        select email_enabled, in_app_enabled from search_alert_prefs where user_id = ${userId} limit 1
      `.catch(() => [] as Array<{ email_enabled: number | boolean | null; in_app_enabled: number | boolean | null }>);
      const emailOn = prefs[0] ? prefs[0].email_enabled === 1 || prefs[0].email_enabled === true : true;
      const inAppOn = prefs[0] ? prefs[0].in_app_enabled === 1 || prefs[0].in_app_enabled === true : true;
      if (inAppOn) {
        await sql`
          insert into search_alert_notices (id, user_id, saved_search_id, daycare_id, kind, title, body)
          values (${nid("san")}, ${userId}, null, ${daycare.id}, 'waitlist_pulse', ${title}, ${body})
        `.catch(() => undefined);
        await sql`
          insert into spot_alert_sends (id, draft_id, user_id, channel, status)
          values (${nid("sas")}, ${draft.id}, ${userId}, 'in_app', 'sent')
          on conflict (draft_id, user_id, channel) do nothing
        `.catch(() => undefined);
        inApp += 1;
      } else {
        skipped += 1;
      }
      if (!emailOn) {
        skipped += 1;
        continue;
      }
      const actor = await lookupUser(userId);
      const to = actor.email?.trim() || "";
      if (!to || (await isSuppressed(to))) {
        skipped += 1;
        continue;
      }
      const casl = await evaluateCaslSend({ userId, channel: "email", purpose: "service", address: to });
      if (!casl.ok) {
        skipped += 1;
        await sql`
          insert into spot_alert_sends (id, draft_id, user_id, channel, status)
          values (${nid("sas")}, ${draft.id}, ${userId}, 'email', 'skipped')
          on conflict (draft_id, user_id, channel) do nothing
        `.catch(() => undefined);
        continue;
      }
      const personalUnsub = caslUnsubscribeUrl({ userId, channel: "email", purpose: "service", address: to });
      const text = `${body}${personalUnsub ? `\n\nUnsubscribe: ${personalUnsub}` : unsubFooter}`;
      const html = `<p>${esc(body)}</p><p><a href="${esc(personalUnsub || `${appOrigin()}/unsubscribe`)}">Unsubscribe</a></p>`;
      const status = await sendSpotMail({ to, userId, subject: title, text, html }).catch(() => "failed" as const);
      await sql`
        insert into spot_alert_sends (id, draft_id, user_id, channel, status)
        values (${nid("sas")}, ${draft.id}, ${userId}, 'email', ${status === "sent" ? "sent" : status === "stubbed" ? "stubbed" : "failed"})
        on conflict (draft_id, user_id, channel) do nothing
      `.catch(() => undefined);
      if (status === "sent" || status === "stubbed") email += 1;
      else skipped += 1;
    }
    await sql`update spot_alert_drafts set status = 'sent', body = ${body} where id = ${draft.id}`;
    return { ok: true as const, inApp, email, skipped };
  });
