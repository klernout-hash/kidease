import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { evaluateFeatureFlag } from "@/lib/flags";
import { miniSiteOpen, rsvpHeadcount, type RsvpAnswer } from "@/lib/phase5-rules";

export const phase5Flags = createServerFn({ method: "GET" }).handler(async () => ({
  absence: evaluateFeatureFlag("FEATURE_PARENT_ABSENCE"),
  events: evaluateFeatureFlag("FEATURE_EVENT_RSVP"),
  immunization: evaluateFeatureFlag("FEATURE_IMMUNIZATION_FILE"),
  miniSite: evaluateFeatureFlag("FEATURE_CENTRE_MINISITE"),
  forecast: evaluateFeatureFlag("FEATURE_ROOM_FORECAST"),
}));

export const saveCentreEvent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { daycareId?: string; title?: string; startsAt?: string; roomId?: string }) => ({
    daycareId: String(data?.daycareId || "").slice(0, 80),
    title: String(data?.title || "").trim().slice(0, 120),
    startsAt: String(data?.startsAt || ""),
    roomId: String(data?.roomId || "").slice(0, 40),
  }))
  .handler(async ({ data }) => {
    if (!evaluateFeatureFlag("FEATURE_EVENT_RSVP")) return { ok: false as const, error: "off" };
    if (!data.daycareId || !data.title || Number.isNaN(Date.parse(data.startsAt))) return { ok: false as const, error: "event" };
    const id = `ev_${Date.now().toString(36)}`;
    const sql = await getSql();
    await sql`
      insert into centre_events (id, daycare_id, title, starts_at, room_id)
      values (${id}, ${data.daycareId}, ${data.title}, ${data.startsAt}, ${data.roomId || null})
    `;
    return { ok: true as const, id, sent: false as const };
  });

export const saveEventRsvp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { eventId?: string; answer?: RsvpAnswer; headcount?: number }) => ({
    eventId: String(data?.eventId || "").slice(0, 80),
    answer: data?.answer,
    headcount: Number(data?.headcount),
  }))
  .handler(async ({ context, data }) => {
    if (!evaluateFeatureFlag("FEATURE_EVENT_RSVP")) return { ok: false as const, error: "off" };
    if (data.answer !== "yes" && data.answer !== "no" && data.answer !== "maybe") return { ok: false as const, error: "answer" };
    const count = rsvpHeadcount(data.answer, data.headcount);
    if (count == null || !data.eventId) return { ok: false as const, error: "count" };
    const sql = await getSql();
    const id = `rsvp_${data.eventId}_${context.userId}`.slice(0, 80);
    await sql`
      insert into centre_event_rsvps (id, event_id, parent_user_id, answer, headcount)
      values (${id}, ${data.eventId}, ${context.userId}, ${data.answer}, ${count})
      on conflict (id) do update set answer = excluded.answer, headcount = excluded.headcount
    `;
    return { ok: true as const, headcount: count, sent: false as const };
  });

export const centreMiniSite = createServerFn({ method: "GET" })
  .validator((data: { slug?: string }) => ({ slug: String(data?.slug || "").slice(0, 80) }))
  .handler(async ({ data }) => {
    if (!evaluateFeatureFlag("FEATURE_CENTRE_MINISITE")) return { open: false as const };
    if (!miniSiteOpen({ claimed: true, slug: data.slug })) return { open: false as const };
    try {
      const sql = await getSql();
      const rows = await sql<{
        name: string;
        name_fr: string | null;
        city: string | null;
        province: string | null;
        hours: string | null;
        hours_fr: string | null;
        description: string | null;
        description_fr: string | null;
      }>`
        select name, name_fr, city, province, hours, hours_fr, description, description_fr from daycares
        where slug = ${data.slug} and claimed_at is not null
        limit 1
      `;
      const row = rows[0];
      if (!row) return { open: false as const, unclaimed: true as const };
      return {
        open: true as const,
        name: row.name,
        nameFr: row.name_fr || "",
        city: row.city || "",
        province: row.province || "",
        hours: row.hours || "",
        hoursFr: row.hours_fr || "",
        description: (row.description || "").slice(0, 1200),
        descriptionFr: (row.description_fr || "").slice(0, 1200),
        slug: data.slug,
      };
    } catch {
      return { open: false as const };
    }
  });
