import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { evaluateFeatureFlag } from "@/lib/flags";
import { absenceDays, miniSiteOpen, rsvpHeadcount, type RsvpAnswer } from "@/lib/phase5-rules";

export const phase5Flags = createServerFn({ method: "GET" }).handler(async () => ({
  absence: evaluateFeatureFlag("FEATURE_PARENT_ABSENCE"),
  events: evaluateFeatureFlag("FEATURE_EVENT_RSVP"),
  immunization: evaluateFeatureFlag("FEATURE_IMMUNIZATION_FILE"),
  miniSite: evaluateFeatureFlag("FEATURE_CENTRE_MINISITE"),
  forecast: evaluateFeatureFlag("FEATURE_ROOM_FORECAST"),
}));

export const reportParentAbsence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((data: { daycareId?: string; childName?: string; from?: string; to?: string; reason?: string }) => ({
    daycareId: String(data?.daycareId || "").slice(0, 80),
    childName: String(data?.childName || "").trim().slice(0, 80),
    from: String(data?.from || "").slice(0, 10),
    to: String(data?.to || data?.from || "").slice(0, 10),
    reason: String(data?.reason || "").trim().slice(0, 200),
  }))
  .handler(async ({ context, data }) => {
    if (!evaluateFeatureFlag("FEATURE_PARENT_ABSENCE")) return { ok: false as const, error: "off" };
    const days = absenceDays(data.from, data.to);
    if (!data.daycareId || !data.childName || !days.length) return { ok: false as const, error: "day" };
    const sql = await getSql();
    for (const day of days) {
      const id = `abs_${data.childName}_${day}`.replace(/[^a-z0-9_-]/gi, "").slice(0, 80);
      await sql`
        insert into attendance (id, daycare_id, child_name, parent_user_id, day, status, notes, updated_by)
        values (${id}, ${data.daycareId}, ${data.childName}, ${context.userId}, ${day}, ${"absent"}, ${data.reason}, ${context.userId})
        on conflict (daycare_id, child_name, day) do update
          set status = 'absent', notes = excluded.notes, updated_by = excluded.updated_by
      `;
    }
    return { ok: true as const, days, reoffered: false as const };
  });

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
      const rows = await sql<{ name: string; city: string | null; hours: string | null }>`
        select name, city, hours from daycares
        where slug = ${data.slug} and claimed_at is not null
        limit 1
      `;
      const row = rows[0];
      if (!row) return { open: false as const, unclaimed: true as const };
      return { open: true as const, name: row.name, city: row.city || "", hours: row.hours || "", slug: data.slug };
    } catch {
      return { open: false as const };
    }
  });
