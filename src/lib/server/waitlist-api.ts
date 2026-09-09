/**
 * Client-reachable waitlist pulse createServerFn stubs.
 * Job / Inngest send live in waitlist-pulse.ts (server-only helpers).
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { catalogByIdGet } from "@/lib/catalog";
import { getSql } from "@/lib/db";
import { isAdminOnlyListing } from "@/lib/listing-visibility";
import { isAgeBand, type AgeBand } from "@/lib/saved-search";
import { callerIsAdmin } from "@/lib/server/public-listing";
import {
  cooldownUntilIso,
  pulseRateLimited,
  type WaitlistInterest,
  type WaitlistPulseStatus,
} from "@/lib/waitlist-pulse";
import { nid } from "@/lib/utils";
import { assertCanMutateListing } from "@/lib/access-control";

async function assertPublicListing(daycareId: string) {
  const listed = await catalogByIdGet(daycareId);
  if (isAdminOnlyListing(listed ?? { id: daycareId }) && !(await callerIsAdmin())) {
    throw new Error("Listing not found");
  }
}

async function assertOwnsListing(userId: string, daycareId: string) {
  const sql = await getSql();
  const own = await sql<{ user_id: string }>`
    select user_id from provider_daycares
    where user_id = ${userId} and daycare_id = ${daycareId}
  `;
  assertCanMutateListing(own[0] ? [daycareId] : [], daycareId);
}

export const getWaitlistInterest = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((daycareId: string) => String(daycareId || "").trim())
  .handler(async ({ context, data: daycareId }): Promise<WaitlistInterest | null> => {
    if (!daycareId) return null;
    await assertPublicListing(daycareId);
    const sql = await getSql();
    const rows = await sql<{
      daycare_id: string;
      age_band: string;
      notify_in_app: number | boolean;
      notify_sms: number | boolean;
      updated_at: string | Date | null;
    }>`
      select daycare_id, age_band, notify_in_app, notify_sms, updated_at
      from waitlist_interests
      where user_id = ${context.userId} and daycare_id = ${daycareId}
      limit 1
    `.catch(() => []);
    const row = rows[0];
    if (!row) return null;
    return {
      daycareId: row.daycare_id,
      ageBand: isAgeBand(row.age_band) ? row.age_band : "any",
      notifyInApp: row.notify_in_app !== 0 && row.notify_in_app !== false,
      notifySms: row.notify_sms !== 0 && row.notify_sms !== false,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    };
  });

export const setWaitlistInterest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { daycareId: string; optedIn: boolean; ageBand?: string; notifySms?: boolean }) => ({
      daycareId: String(input?.daycareId || "").trim(),
      optedIn: Boolean(input?.optedIn),
      ageBand: isAgeBand(input?.ageBand) ? input.ageBand : ("any" as AgeBand),
      notifySms: input?.notifySms !== false,
    }),
  )
  .handler(async ({ context, data }): Promise<WaitlistInterest | null> => {
    if (!data.daycareId) throw new Error("Missing listing");
    await assertPublicListing(data.daycareId);
    const sql = await getSql();
    if (!data.optedIn) {
      try {
        const { closeWaitlistLead } = await import("@/lib/server/lead-requests");
        await closeWaitlistLead(sql, context.userId, data.daycareId);
      } catch (err) {
        console.error("[kidease-lead] waitlist close skipped", err);
      }
      await sql`
        delete from waitlist_interests
        where user_id = ${context.userId} and daycare_id = ${data.daycareId}
      `.catch(() => undefined);
      return null;
    }
    const id = nid("wli");
    await sql`
      insert into waitlist_interests (
        id, user_id, daycare_id, age_band, notify_in_app, notify_sms, created_at, updated_at
      ) values (
        ${id}, ${context.userId}, ${data.daycareId}, ${data.ageBand}, 1, ${data.notifySms ? 1 : 0}, now(), now()
      )
      on conflict (user_id, daycare_id) do update set
        age_band = excluded.age_band,
        notify_in_app = 1,
        notify_sms = excluded.notify_sms,
        updated_at = now()
    `;
    const saved = await sql<{ id: string }>`
      select id from waitlist_interests
      where user_id = ${context.userId} and daycare_id = ${data.daycareId}
      limit 1
    `.catch(() => []);
    try {
      const { recordLeadRequest } = await import("@/lib/server/lead-requests");
      await recordLeadRequest(sql, {
        userId: context.userId,
        daycareId: data.daycareId,
        kind: "waitlist",
        message: "Waitlist pulse opt-in",
        sourceKind: "waitlist_interest",
        sourceId: saved[0]?.id || id,
      });
    } catch (err) {
      console.error("[kidease-lead] waitlist lead skipped", err);
    }
    return {
      daycareId: data.daycareId,
      ageBand: data.ageBand,
      notifyInApp: true,
      notifySms: data.notifySms,
      updatedAt: new Date().toISOString(),
    };
  });

export const getWaitlistPulseStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((daycareId: string) => String(daycareId || "").trim())
  .handler(async ({ context, data: daycareId }): Promise<WaitlistPulseStatus> => {
    if (!daycareId) {
      return { lastPulsedAt: null, cooldownUntil: null, canPulse: false, interestCount: 0 };
    }
    await assertOwnsListing(context.userId, daycareId);
    const sql = await getSql();
    const pulses = await sql<{ created_at: string | Date }>`
      select created_at from waitlist_pulses
      where daycare_id = ${daycareId}
      order by created_at desc
      limit 1
    `.catch(() => []);
    const last = pulses[0]?.created_at ?? null;
    const lastIso = last instanceof Date ? last.toISOString() : last ? String(last) : null;
    const limited = pulseRateLimited(lastIso);
    const interests = await sql<{ n: number }>`
      select count(*)::int as n from waitlist_interests where daycare_id = ${daycareId}
    `.catch(() => [{ n: 0 }]);
    const bookings = await sql<{ n: number }>`
      select count(*)::int as n from bookings
      where daycare_id = ${daycareId}
        and status in ('requested', 'under_review', 'waitlist')
    `.catch(() => [{ n: 0 }]);
    return {
      lastPulsedAt: lastIso,
      cooldownUntil: cooldownUntilIso(lastIso),
      canPulse: !limited,
      interestCount: (interests[0]?.n ?? 0) + (bookings[0]?.n ?? 0),
    };
  });

export const pulseWaitlistSpot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string }) => ({ daycareId: String(input?.daycareId || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!data.daycareId) throw new Error("Missing listing");
    await assertOwnsListing(context.userId, data.daycareId);
    const sql = await getSql();
    const last = await sql<{ created_at: string | Date }>`
      select created_at from waitlist_pulses
      where daycare_id = ${data.daycareId}
      order by created_at desc
      limit 1
    `.catch(() => []);
    const lastIso = last[0]?.created_at instanceof Date ? last[0].created_at.toISOString() : last[0]?.created_at ? String(last[0].created_at) : null;
    if (pulseRateLimited(lastIso)) {
      throw new Error("Waitlist already pulsed for this spot event. Try again after the cooldown.");
    }
    const rows = await sql<{
      spots_infant: number;
      spots_toddler: number;
      spots_preschool: number;
    }>`
      select spots_infant, spots_toddler, spots_preschool
      from daycares
      where id = ${data.daycareId}
      limit 1
    `;
    const daycare = rows[0];
    if (!daycare) throw new Error("Listing not found");
    const { insertWaitlistPulse, enqueueWaitlistPulse } = await import("@/lib/server/waitlist-pulse");
    const { pulseId } = await insertWaitlistPulse({
      daycareId: data.daycareId,
      actorUserId: context.userId,
      spots: {
        infant: Number(daycare.spots_infant) || 0,
        toddler: Number(daycare.spots_toddler) || 0,
        preschool: Number(daycare.spots_preschool) || 0,
      },
      source: "director",
    });
    const queued = await enqueueWaitlistPulse({ pulseId, daycareId: data.daycareId });
    return {
      ok: true as const,
      pulseId,
      queued: queued.queued,
      matched: queued.result?.matched ?? null,
    };
  });
