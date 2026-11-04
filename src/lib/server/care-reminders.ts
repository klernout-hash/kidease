import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import {
  CARE_LEAD_MINUTES,
  closedForChild,
  dueReminders,
  knownCareZone,
  parseClock,
  parseLeadMinutes,
  reminderChannels,
  zonedDay,
  type CareDay,
  type CareReminderPlan,
} from "@/lib/care-reminders";
import { careRemindersEnabled, pushEnabled } from "@/lib/features";
import { saveParentInAppNotice } from "@/lib/server/parent-notice";
import { nid } from "@/lib/utils";

const ALL_WEEK = -1;

function emptyDays(sameEveryDay: boolean): CareDay[] {
  if (sameEveryDay) return [{ weekday: ALL_WEEK, dropoff: null, pickup: null, dropoffOn: false, pickupOn: false }];
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    dropoff: null,
    pickup: null,
    dropoffOn: false,
    pickupOn: false,
  }));
}

async function familyChild(sql: Sql, userId: string, childId: string) {
  const { familyScopeFor } = await import("@/lib/server/coparent");
  const scope = await familyScopeFor(userId);
  const rows = await sql<{ id: string; name: string }>`
    select id, name from children where id = ${childId} and user_id = ${scope.dataUserId} limit 1
  `;
  return rows[0] || null;
}

export const careReminderStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({ enabled: careRemindersEnabled() }));

export const loadCareReminder = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { childId?: string } | undefined) => ({ childId: String(input?.childId || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!careRemindersEnabled()) return { enabled: false as const };
    const sql = await getSql();
    const child = await familyChild(sql, context.userId, data.childId);
    if (!child) return { enabled: true as const, found: false as const };
    const zoneRows = await sql<{ time_zone: string | null }>`
      select time_zone from profiles where user_id = ${context.userId} limit 1
    `.catch(() => []);
    const head = await sql<{ master_on: boolean; same_every_day: boolean; lead_minutes: number }>`
      select master_on, same_every_day, lead_minutes from care_reminders
      where user_id = ${context.userId} and child_id = ${child.id} limit 1
    `.catch(() => []);
    const days = await sql<{
      weekday: number;
      dropoff: string | null;
      pickup: string | null;
      dropoff_on: boolean;
      pickup_on: boolean;
    }>`
      select weekday, dropoff, pickup, dropoff_on, pickup_on from care_reminder_days
      where user_id = ${context.userId} and child_id = ${child.id}
      order by weekday
    `.catch(() => []);
    const same = head[0] ? Boolean(head[0].same_every_day) : true;
    const stored = days.map((day) => ({
      weekday: day.weekday,
      dropoff: day.dropoff,
      pickup: day.pickup,
      dropoffOn: Boolean(day.dropoff_on),
      pickupOn: Boolean(day.pickup_on),
    }));
    return {
      enabled: true as const,
      found: true as const,
      childName: child.name,
      zone: knownCareZone(zoneRows[0]?.time_zone) || "",
      masterOn: Boolean(head[0]?.master_on),
      sameEveryDay: same,
      leadMinutes: parseLeadMinutes(head[0]?.lead_minutes) || 30,
      days: stored.length ? stored : emptyDays(same),
    };
  });

export const saveCareReminder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      childId?: string;
      masterOn?: boolean;
      sameEveryDay?: boolean;
      leadMinutes?: number;
      zone?: string;
      days?: CareDay[];
    }) => input,
  )
  .handler(async ({ context, data }) => {
    if (!careRemindersEnabled()) throw new Error("off");
    const lead = parseLeadMinutes(data.leadMinutes) || 30;
    const zone = knownCareZone(data.zone);
    const sql = await getSql();
    const child = await familyChild(sql, context.userId, String(data.childId || ""));
    if (!child) throw new Error("Child not found");
    if (data.zone && !zone) throw new Error("Pick a time zone");
    if (zone) {
      await sql`update profiles set time_zone = ${zone} where user_id = ${context.userId}`.catch(() => undefined);
    }
    const same = data.sameEveryDay !== false;
    const days = (Array.isArray(data.days) ? data.days : emptyDays(same))
      .map((day) => ({
        weekday: same ? ALL_WEEK : Number(day.weekday),
        dropoff: parseClock(day.dropoff),
        pickup: parseClock(day.pickup),
        dropoffOn: Boolean(day.dropoffOn),
        pickupOn: Boolean(day.pickupOn),
      }))
      .filter((day) => day.weekday === ALL_WEEK || (day.weekday >= 0 && day.weekday <= 6));
    await sql`
      insert into care_reminders (user_id, child_id, master_on, same_every_day, lead_minutes)
      values (${context.userId}, ${child.id}, ${Boolean(data.masterOn)}, ${same}, ${lead})
      on conflict (user_id, child_id) do update
      set master_on = ${Boolean(data.masterOn)}, same_every_day = ${same}, lead_minutes = ${lead}
    `;
    await sql`delete from care_reminder_days where user_id = ${context.userId} and child_id = ${child.id}`;
    for (const day of days) {
      await sql`
        insert into care_reminder_days (user_id, child_id, weekday, dropoff, pickup, dropoff_on, pickup_on)
        values (
          ${context.userId}, ${child.id}, ${day.weekday}, ${day.dropoff}, ${day.pickup},
          ${day.dropoffOn}, ${day.pickupOn}
        )
      `;
    }
    return { ok: true as const, channels: reminderChannels(pushEnabled()) };
  });

async function enrolledCentres(sql: Sql, childId: string) {
  const rows = await sql<{ daycare_id: string }>`
    select distinct daycare_id from bookings
    where child_id = ${childId} and status in ('accepted', 'active')
  `.catch(() => []);
  return rows.map((row) => row.daycare_id);
}

async function closedCentres(sql: Sql, daycareIds: string[], date: string) {
  if (!daycareIds.length) return [];
  const ready = await sql<{ reg: string | null }>`
    select to_regclass('public.host_calendar_days')::text as reg
  `.catch(() => []);
  if (!ready[0]?.reg) return [];
  const closed: string[] = [];
  for (const daycareId of daycareIds) {
    const rows = await sql<{ daycare_id: string }>`
      select daycare_id from host_calendar_days
      where daycare_id = ${daycareId} and day = ${date}::date and closed = true
      limit 1
    `.catch(() => []);
    if (rows[0]) closed.push(daycareId);
  }
  return closed;
}

export async function runCareReminderJob(input: { now?: Date; dryRun?: boolean; force?: boolean } = {}) {
  if (!careRemindersEnabled()) return { ok: true as const, skipped: true as const, reason: "off", sent: 0 };
  const now = input.now ?? new Date();
  const sql = await getSql();
  const heads = await sql<{
    user_id: string;
    child_id: string;
    master_on: boolean;
    same_every_day: boolean;
    lead_minutes: number;
    time_zone: string | null;
    child_name: string | null;
    locale: string | null;
  }>`
    select r.user_id, r.child_id, r.master_on, r.same_every_day, r.lead_minutes,
           p.time_zone, ch.name as child_name, p.locale
    from care_reminders r
    left join profiles p on p.user_id = r.user_id
    left join children ch on ch.id = r.child_id
    where r.master_on = true
  `.catch(() => []);
  let sent = 0;
  const channels = reminderChannels(pushEnabled());
  for (const head of heads) {
    const zone = knownCareZone(head.time_zone);
    const today = zone ? zonedDay(now, zone) : null;
    const dayRows = await sql<{
      weekday: number;
      dropoff: string | null;
      pickup: string | null;
      dropoff_on: boolean;
      pickup_on: boolean;
    }>`
      select weekday, dropoff, pickup, dropoff_on, pickup_on from care_reminder_days
      where user_id = ${head.user_id} and child_id = ${head.child_id}
    `.catch(() => []);
    const plan: CareReminderPlan = {
      userId: head.user_id,
      childId: head.child_id,
      masterOn: true,
      sameEveryDay: Boolean(head.same_every_day),
      leadMinutes: head.lead_minutes,
      days: dayRows.map((day) => ({
        weekday: day.weekday,
        dropoff: day.dropoff,
        pickup: day.pickup,
        dropoffOn: Boolean(day.dropoff_on),
        pickupOn: Boolean(day.pickup_on),
      })),
    };
    const centres = await enrolledCentres(sql, head.child_id);
    const closedIds = today ? await closedCentres(sql, centres, today.date) : [];
    const sentRows = today
      ? await sql<{ kind: string }>`
          select kind from care_reminder_sends
          where user_id = ${head.user_id} and child_id = ${head.child_id} and local_date = ${today.date}
        `.catch(() => [])
      : [];
    const due = dueReminders({
      now,
      zone,
      reminder: plan,
      closed: closedForChild({ enrolledDaycareIds: centres, closedDaycareIds: closedIds }),
      sentKeys: sentRows.map((row) => `${head.user_id}:${head.child_id}:${row.kind}:${today?.date || ""}`),
    });
    for (const item of due) {
      if (input.dryRun) {
        sent += 1;
        continue;
      }
      const saved = await sql<{ id: string }>`
        insert into care_reminder_sends (id, user_id, child_id, kind, local_date)
        values (${nid("cr")}, ${item.userId}, ${item.childId}, ${item.kind}, ${item.localDate})
        on conflict (user_id, child_id, kind, local_date) do nothing
        returning id
      `.catch(() => []);
      if (!saved[0]) continue;
      const french = head.locale === "fr";
      const label = item.kind === "dropoff" ? (french ? "Arrivée" : "Drop-off") : french ? "Départ" : "Pick-up";
      const name = (head.child_name || "").trim() || (french ? "votre enfant" : "your child");
      const text = french
        ? `${label} à ${item.localTime} pour ${name}.`
        : `${label} at ${item.localTime} for ${name}.`;
      await saveParentInAppNotice(sql, {
        userId: item.userId,
        kind: "inbox",
        titleKey: "notifCare",
        href: "/parent?tab=children",
        sourceKey: `care:${item.childId}:${item.kind}:${item.localDate}`,
        daycareName: text,
        status: item.kind,
      });
      if (channels.push) {
        const { sendPushNotification } = await import("@/lib/server/push.server");
        await sendPushNotification({
          userId: item.userId,
          title: "KidEase",
          body: text,
          url: "/parent?tab=children",
        }).catch(() => undefined);
      }
      sent += 1;
    }
  }
  return { ok: true as const, skipped: false as const, sent, push: channels.push, sms: false as const };
}

export const CARE_LEAD_CHOICES = CARE_LEAD_MINUTES;
