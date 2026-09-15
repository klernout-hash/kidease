import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { centreCanWriteCare } from "@/lib/centre-roles";
import {
  careStatusBody,
  clampRoomCapacity,
  incidentPostReady,
  isEnrolledBookingStatus,
  isIncidentKind,
  isMedLogStatus,
  medicationActiveOnDay,
  medicationPostReady,
  parseScheduleTimes,
  serializeScheduleTimes,
  todayYmd,
  type IncidentKind,
  type MedLogStatus,
} from "@/lib/daily-care";
import { nid } from "@/lib/utils";
import { listAccessibleDaycareIds, loadCentreRole } from "./centre-access";
import { insertCareStatusMessage } from "./daily-care";
import { lookupUser } from "./notify";

export type CareRoomRow = {
  id: string;
  daycareId: string;
  daycareName: string;
  name: string;
  capacity: number;
};

export type CareStaffRow = {
  userId: string;
  daycareId: string;
  name: string;
  role: string;
};

export type CareChildRoomRow = {
  daycareId: string;
  roomId: string;
  bookingId: string | null;
  childName: string;
  parentUserId: string | null;
};

export type CareRosterRow = {
  id: string;
  daycareId: string;
  roomId: string;
  staffUserId: string;
  staffName: string;
  day: string;
};

export type CareMedicationRow = {
  id: string;
  daycareId: string;
  daycareName: string;
  bookingId: string | null;
  conversationId: string | null;
  childName: string;
  parentUserId: string | null;
  name: string;
  dosage: string;
  instructions: string;
  times: string[];
  startDay: string;
  endDay: string | null;
  createdBy: string;
};

export type CareMedicationLogRow = {
  id: string;
  medicationId: string;
  daycareId: string;
  childName: string;
  day: string;
  scheduledTime: string;
  status: MedLogStatus;
  notes: string;
  givenByName: string;
  createdAt: string;
};

export type CareIncidentRow = {
  id: string;
  daycareId: string;
  daycareName: string;
  bookingId: string | null;
  conversationId: string | null;
  childName: string;
  parentUserId: string | null;
  day: string;
  occurredAt: string;
  location: string;
  kind: IncidentKind;
  description: string;
  actionTaken: string;
  firstAid: boolean;
  authorName: string;
  createdAt: string;
};

export type CareOpsPayload = {
  day: string;
  role: "parent" | "provider";
  rooms: CareRoomRow[];
  staff: CareStaffRow[];
  assignments: CareChildRoomRow[];
  roster: CareRosterRow[];
  medications: CareMedicationRow[];
  logs: CareMedicationLogRow[];
  incidents: CareIncidentRow[];
};

const ENSURE_CARE_OPS = `
create table if not exists care_rooms (
  id text primary key,
  daycare_id text not null,
  name text not null,
  capacity int not null default 8,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists care_child_room_assignments (
  id text primary key,
  daycare_id text not null,
  room_id text not null,
  booking_id text,
  child_name text not null,
  parent_user_id text,
  assigned_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists care_roster_assignments (
  id text primary key,
  daycare_id text not null,
  room_id text not null,
  staff_user_id text not null,
  staff_name text not null,
  day date not null,
  assigned_by text not null,
  created_at timestamptz not null default now()
);
create table if not exists care_medications (
  id text primary key,
  daycare_id text not null,
  booking_id text,
  conversation_id text,
  child_id text,
  child_name text not null,
  parent_user_id text,
  name text not null,
  dosage text not null,
  instructions text not null default '',
  schedule_times jsonb not null default '[]'::jsonb,
  start_day date not null,
  end_day date,
  created_by text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists care_medication_logs (
  id text primary key,
  medication_id text not null,
  daycare_id text not null,
  booking_id text,
  conversation_id text,
  child_name text not null,
  parent_user_id text,
  day date not null,
  scheduled_time text not null,
  status text not null,
  notes text not null default '',
  given_by text not null,
  given_by_name text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists care_incidents (
  id text primary key,
  daycare_id text not null,
  booking_id text,
  conversation_id text,
  child_id text,
  child_name text not null,
  parent_user_id text,
  day date not null,
  occurred_at timestamptz not null,
  location text not null default '',
  kind text not null,
  description text not null,
  action_taken text not null default '',
  first_aid boolean not null default false,
  author_user_id text not null,
  author_name text not null default '',
  parent_notified_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists care_child_rooms_child_idx
  on care_child_room_assignments (daycare_id, child_name);
create unique index if not exists care_roster_room_staff_day_idx
  on care_roster_assignments (room_id, staff_user_id, day);
`;

async function ensureCareOpsTables(sql: Awaited<ReturnType<typeof getSql>>) {
  await sql.query(ENSURE_CARE_OPS).catch(() => undefined);
}

async function actorName(userId: string) {
  const user = await lookupUser(userId).catch(() => ({ name: null, email: null }));
  return (user.name || user.email || "Staff").trim() || "Staff";
}

async function requireStaffWrite(userId: string, daycareId: string) {
  const sql = await getSql();
  const role = await loadCentreRole(sql, userId, daycareId);
  if (!centreCanWriteCare(role)) throw new Error("Staff only");
  return sql;
}

async function loadEnrolledBooking(
  sql: Awaited<ReturnType<typeof getSql>>,
  input: { daycareId: string; bookingId?: string | null; parentUserId: string },
) {
  const bookingId = String(input.bookingId || "").trim();
  if (!bookingId) return null;
  const booking = await sql<{
    id: string;
    user_id: string;
    status: string;
    conversation_id: string | null;
    child_id: string | null;
  }>`
    select id, user_id, status, conversation_id, child_id
    from bookings
    where id = ${bookingId} and daycare_id = ${input.daycareId}
    limit 1
  `;
  if (!booking[0] || !isEnrolledBookingStatus(booking[0].status)) {
    throw new Error("Daily care is for enrolled children");
  }
  return booking[0];
}

export const listCareOps = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input?: { daycareId?: string; day?: string }) => ({
    daycareId: String(input?.daycareId || "").trim() || undefined,
    day: String(input?.day || "").trim() || undefined,
  }))
  .handler(async ({ context, data }): Promise<CareOpsPayload> => {
    const sql = await getSql();
    await ensureCareOpsTables(sql);
    const day = data.day && /^\d{4}-\d{2}-\d{2}$/.test(data.day) ? data.day : todayYmd();
    const accessible = data.daycareId
      ? (await loadCentreRole(sql, context.userId, data.daycareId))
        ? [data.daycareId]
        : []
      : await listAccessibleDaycareIds(sql, context.userId);
    const isProvider = accessible.length > 0;

    const rooms = await sql
      .query<{
        id: string;
        daycare_id: string;
        daycare_name: string;
        name: string;
        capacity: number;
      }>(
        `select r.id, r.daycare_id, d.name as daycare_name, r.name, r.capacity
         from care_rooms r
         join daycares d on d.id = r.daycare_id
         where r.archived_at is null
           and (
             r.daycare_id in (select daycare_id from provider_daycares where user_id = $1)
             or r.daycare_id in (
               select daycare_id from centre_members
               where user_id = $1 and status = 'active'
             )
             or r.daycare_id in (
               select daycare_id from bookings
               where user_id = $1 and status in ('accepted', 'active')
             )
           )
           ${data.daycareId ? "and r.daycare_id = $2" : ""}
         order by d.name, r.sort_order, r.name`,
        data.daycareId ? [context.userId, data.daycareId] : [context.userId],
      )
      .catch(() => []);

    const assignments = await sql
      .query<{
        daycare_id: string;
        room_id: string;
        booking_id: string | null;
        child_name: string;
        parent_user_id: string | null;
      }>(
        `select a.daycare_id, a.room_id, a.booking_id, a.child_name, a.parent_user_id
         from care_child_room_assignments a
         where (
             a.daycare_id in (select daycare_id from provider_daycares where user_id = $1)
             or a.daycare_id in (
               select daycare_id from centre_members
               where user_id = $1 and status = 'active'
             )
             or a.parent_user_id = $1
           )
           ${data.daycareId ? "and a.daycare_id = $2" : ""}`,
        data.daycareId ? [context.userId, data.daycareId] : [context.userId],
      )
      .catch(() => []);

    const roster = await sql
      .query<{
        id: string;
        daycare_id: string;
        room_id: string;
        staff_user_id: string;
        staff_name: string;
        day: string;
      }>(
        `select id, daycare_id, room_id, staff_user_id, staff_name, day::text as day
         from care_roster_assignments
         where day = $1
           and (
             daycare_id in (select daycare_id from provider_daycares where user_id = $2)
             or daycare_id in (
               select daycare_id from centre_members
               where user_id = $2 and status = 'active'
             )
             or daycare_id in (
               select daycare_id from bookings
               where user_id = $2 and status in ('accepted', 'active')
             )
           )
           ${data.daycareId ? "and daycare_id = $3" : ""}
         order by staff_name`,
        data.daycareId ? [day, context.userId, data.daycareId] : [day, context.userId],
      )
      .catch(() => []);

    const staff = isProvider
      ? await sql
          .query<{ user_id: string; daycare_id: string; name: string | null; email: string | null; role: string }>(
            `select m.user_id, m.daycare_id, coalesce(nullif(btrim(u.name), ''), u.email) as name,
                    u.email, m.role
             from centre_members m
             left join "user" u on u.id = m.user_id
             where m.status = 'active'
               and m.daycare_id = any($1::text[])
             order by name`,
            [accessible],
          )
          .catch(() => [])
      : [];

    const medications = await sql
      .query<{
        id: string;
        daycare_id: string;
        daycare_name: string;
        booking_id: string | null;
        conversation_id: string | null;
        child_name: string;
        parent_user_id: string | null;
        name: string;
        dosage: string;
        instructions: string;
        schedule_times: unknown;
        start_day: string;
        end_day: string | null;
        created_by: string;
        archived_at: string | null;
      }>(
        `select m.id, m.daycare_id, d.name as daycare_name, m.booking_id, m.conversation_id,
                m.child_name, m.parent_user_id, m.name, m.dosage, m.instructions, m.schedule_times,
                m.start_day::text as start_day, m.end_day::text as end_day, m.created_by,
                m.archived_at::text as archived_at
         from care_medications m
         join daycares d on d.id = m.daycare_id
         where m.archived_at is null
           and (
             m.parent_user_id = $1
             or m.created_by = $1
             or m.daycare_id in (select daycare_id from provider_daycares where user_id = $1)
             or m.daycare_id in (
               select daycare_id from centre_members
               where user_id = $1 and status = 'active'
             )
           )
           ${data.daycareId ? "and m.daycare_id = $2" : ""}
         order by m.child_name, m.name`,
        data.daycareId ? [context.userId, data.daycareId] : [context.userId],
      )
      .catch(() => []);

    const logs = await sql
      .query<{
        id: string;
        medication_id: string;
        daycare_id: string;
        child_name: string;
        day: string;
        scheduled_time: string;
        status: string;
        notes: string;
        given_by_name: string;
        created_at: string;
      }>(
        `select id, medication_id, daycare_id, child_name, day::text as day, scheduled_time,
                status, notes, given_by_name, created_at::text as created_at
         from care_medication_logs
         where day = $1
           and (
             parent_user_id = $2
             or given_by = $2
             or daycare_id in (select daycare_id from provider_daycares where user_id = $2)
             or daycare_id in (
               select daycare_id from centre_members
               where user_id = $2 and status = 'active'
             )
           )
           ${data.daycareId ? "and daycare_id = $3" : ""}
         order by created_at desc`,
        data.daycareId ? [day, context.userId, data.daycareId] : [day, context.userId],
      )
      .catch(() => []);

    const incidents = await sql
      .query<{
        id: string;
        daycare_id: string;
        daycare_name: string;
        booking_id: string | null;
        conversation_id: string | null;
        child_name: string;
        parent_user_id: string | null;
        day: string;
        occurred_at: string;
        location: string;
        kind: string;
        description: string;
        action_taken: string;
        first_aid: boolean;
        author_name: string;
        created_at: string;
      }>(
        `select i.id, i.daycare_id, d.name as daycare_name, i.booking_id, i.conversation_id,
                i.child_name, i.parent_user_id, i.day::text as day,
                i.occurred_at::text as occurred_at, i.location, i.kind, i.description,
                i.action_taken, i.first_aid, i.author_name, i.created_at::text as created_at
         from care_incidents i
         join daycares d on d.id = i.daycare_id
         where i.day = $1
           and (
             i.parent_user_id = $2
             or i.author_user_id = $2
             or i.daycare_id in (select daycare_id from provider_daycares where user_id = $2)
             or i.daycare_id in (
               select daycare_id from centre_members
               where user_id = $2 and status = 'active'
             )
           )
           ${data.daycareId ? "and i.daycare_id = $3" : ""}
         order by i.created_at desc`,
        data.daycareId ? [day, context.userId, data.daycareId] : [day, context.userId],
      )
      .catch(() => []);

    const visibleRooms = isProvider
      ? rooms
      : rooms.filter((room) =>
          assignments.some((a) => a.room_id === room.id && a.parent_user_id === context.userId),
        );
    const visibleRoomIds = new Set(visibleRooms.map((room) => room.id));

    return {
      day,
      role: isProvider ? "provider" : "parent",
      rooms: visibleRooms.map((r) => ({
        id: r.id,
        daycareId: r.daycare_id,
        daycareName: r.daycare_name,
        name: r.name,
        capacity: clampRoomCapacity(r.capacity),
      })),
      staff: staff.map((s) => ({
        userId: s.user_id,
        daycareId: s.daycare_id,
        name: (s.name || s.email || "Staff").trim() || "Staff",
        role: s.role,
      })),
      assignments: assignments
        .filter((a) => isProvider || a.parent_user_id === context.userId)
        .map((a) => ({
          daycareId: a.daycare_id,
          roomId: a.room_id,
          bookingId: a.booking_id,
          childName: a.child_name,
          parentUserId: a.parent_user_id,
        })),
      roster: roster
        .filter((r) => isProvider || visibleRoomIds.has(r.room_id))
        .map((r) => ({
        id: r.id,
        daycareId: r.daycare_id,
        roomId: r.room_id,
        staffUserId: r.staff_user_id,
        staffName: r.staff_name,
        day: r.day,
      })),
      medications: medications
        .filter((m) =>
          medicationActiveOnDay({
            startDay: m.start_day,
            endDay: m.end_day,
            archivedAt: m.archived_at,
            day,
          }),
        )
        .map((m) => ({
          id: m.id,
          daycareId: m.daycare_id,
          daycareName: m.daycare_name,
          bookingId: m.booking_id,
          conversationId: m.conversation_id,
          childName: m.child_name,
          parentUserId: m.parent_user_id,
          name: m.name,
          dosage: m.dosage,
          instructions: m.instructions || "",
          times: parseScheduleTimes(m.schedule_times),
          startDay: m.start_day,
          endDay: m.end_day,
          createdBy: m.created_by,
        })),
      logs: logs.flatMap((l) => {
        if (!isMedLogStatus(l.status)) return [];
        const row: CareMedicationLogRow = {
          id: l.id,
          medicationId: l.medication_id,
          daycareId: l.daycare_id,
          childName: l.child_name,
          day: l.day,
          scheduledTime: l.scheduled_time,
          status: l.status,
          notes: l.notes || "",
          givenByName: l.given_by_name || "",
          createdAt: l.created_at,
        };
        return [row];
      }),
      incidents: incidents.flatMap((i) => {
        if (!isIncidentKind(i.kind)) return [];
        const row: CareIncidentRow = {
          id: i.id,
          daycareId: i.daycare_id,
          daycareName: i.daycare_name,
          bookingId: i.booking_id,
          conversationId: i.conversation_id,
          childName: i.child_name,
          parentUserId: i.parent_user_id,
          day: i.day,
          occurredAt: i.occurred_at,
          location: i.location || "",
          kind: i.kind,
          description: i.description,
          actionTaken: i.action_taken || "",
          firstAid: Boolean(i.first_aid),
          authorName: i.author_name || "",
          createdAt: i.created_at,
        };
        return [row];
      }),
    };
  });

export const saveCareRoom = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; name: string; capacity?: number }) => input)
  .handler(async ({ context, data }) => {
    const daycareId = String(data.daycareId || "").trim();
    const name = String(data.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!daycareId || !name) throw new Error("Name a room");
    const sql = await requireStaffWrite(context.userId, daycareId);
    await ensureCareOpsTables(sql);
    const id = nid("rm");
    const capacity = clampRoomCapacity(data.capacity);
    await sql`
      insert into care_rooms (id, daycare_id, name, capacity)
      values (${id}, ${daycareId}, ${name}, ${capacity})
    `;
    return { ok: true as const, id };
  });

export const assignChildRoom = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      roomId: string;
      bookingId?: string | null;
      childName: string;
      parentUserId?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const daycareId = String(data.daycareId || "").trim();
    const roomId = String(data.roomId || "").trim();
    const childName = String(data.childName || "").trim();
    if (!daycareId || !roomId || !childName) throw new Error("Pick a room");
    const sql = await requireStaffWrite(context.userId, daycareId);
    await ensureCareOpsTables(sql);
    const room = await sql<{ id: string }>`
      select id from care_rooms
      where id = ${roomId} and daycare_id = ${daycareId} and archived_at is null
      limit 1
    `;
    if (!room[0]) throw new Error("Unknown room");
    await loadEnrolledBooking(sql, {
      daycareId,
      bookingId: data.bookingId,
      parentUserId: context.userId,
    }).catch(() => null);
    const id = nid("cra");
    await sql`
      insert into care_child_room_assignments (
        id, daycare_id, room_id, booking_id, child_name, parent_user_id, assigned_by
      )
      values (
        ${id}, ${daycareId}, ${roomId}, ${data.bookingId ?? null}, ${childName},
        ${data.parentUserId ?? null}, ${context.userId}
      )
      on conflict (daycare_id, child_name)
      do update set
        room_id = excluded.room_id,
        booking_id = coalesce(excluded.booking_id, care_child_room_assignments.booking_id),
        parent_user_id = coalesce(excluded.parent_user_id, care_child_room_assignments.parent_user_id),
        assigned_by = excluded.assigned_by,
        updated_at = now()
    `;
    return { ok: true as const };
  });

export const assignCareRoster = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { daycareId: string; roomId: string; staffUserId: string; day?: string }) => input,
  )
  .handler(async ({ context, data }) => {
    const daycareId = String(data.daycareId || "").trim();
    const roomId = String(data.roomId || "").trim();
    const staffUserId = String(data.staffUserId || "").trim();
    if (!daycareId || !roomId || !staffUserId) throw new Error("Pick staff and a room");
    const sql = await requireStaffWrite(context.userId, daycareId);
    await ensureCareOpsTables(sql);
    const room = await sql<{ id: string }>`
      select id from care_rooms
      where id = ${roomId} and daycare_id = ${daycareId} and archived_at is null
      limit 1
    `;
    if (!room[0]) throw new Error("Unknown room");
    const member = await sql<{ user_id: string }>`
      select user_id from centre_members
      where daycare_id = ${daycareId} and user_id = ${staffUserId} and status = 'active'
      limit 1
    `;
    const owner = member[0]
      ? []
      : await sql<{ user_id: string }>`
          select user_id from provider_daycares
          where daycare_id = ${daycareId} and user_id = ${staffUserId}
          limit 1
        `;
    if (!member[0] && !owner[0]) throw new Error("Staff only");
    const day = data.day && /^\d{4}-\d{2}-\d{2}$/.test(data.day) ? data.day : todayYmd();
    const staffName = await actorName(staffUserId);
    const id = nid("rr");
    await sql`
      insert into care_roster_assignments (
        id, daycare_id, room_id, staff_user_id, staff_name, day, assigned_by
      )
      values (${id}, ${daycareId}, ${roomId}, ${staffUserId}, ${staffName}, ${day}, ${context.userId})
      on conflict (room_id, staff_user_id, day) do nothing
    `;
    return { ok: true as const, id };
  });

export const saveCareMedication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      bookingId?: string | null;
      conversationId?: string | null;
      childName: string;
      parentUserId?: string | null;
      name: string;
      dosage: string;
      instructions?: string;
      times: string[] | string;
      startDay?: string;
      endDay?: string | null;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureCareOpsTables(sql);
    const daycareId = String(data.daycareId || "").trim();
    const childName = String(data.childName || "").trim();
    const name = String(data.name || "").replace(/\s+/g, " ").trim().slice(0, 120);
    const dosage = String(data.dosage || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const times = parseScheduleTimes(data.times);
    if (!daycareId || !childName) throw new Error("Pick a child");
    if (!medicationPostReady({ name, dosage, times })) throw new Error("Add medicine, dose, and times");
    const centreRole = await loadCentreRole(sql, context.userId, daycareId);
    const staffOk = centreCanWriteCare(centreRole);
    const booking = await loadEnrolledBooking(sql, {
      daycareId,
      bookingId: data.bookingId,
      parentUserId: context.userId,
    }).catch(() => null);
    const parentOk = Boolean(
      (data.parentUserId && data.parentUserId === context.userId) || booking?.user_id === context.userId,
    );
    if (!staffOk && !parentOk) throw new Error("Not allowed");
    const day = data.startDay && /^\d{4}-\d{2}-\d{2}$/.test(data.startDay) ? data.startDay : todayYmd();
    const endDay = data.endDay && /^\d{4}-\d{2}-\d{2}$/.test(data.endDay) ? data.endDay : null;
    const id = nid("md");
    await sql`
      insert into care_medications (
        id, daycare_id, booking_id, conversation_id, child_name, parent_user_id,
        name, dosage, instructions, schedule_times, start_day, end_day, created_by
      )
      values (
        ${id}, ${daycareId}, ${data.bookingId ?? booking?.id ?? null},
        ${data.conversationId ?? booking?.conversation_id ?? null}, ${childName},
        ${data.parentUserId ?? booking?.user_id ?? (parentOk ? context.userId : null)},
        ${name}, ${dosage}, ${String(data.instructions || "").trim().slice(0, 1000)},
        ${serializeScheduleTimes(times)}::jsonb, ${day}, ${endDay}, ${context.userId}
      )
    `;
    return { ok: true as const, id };
  });

export const logCareMedicationDose = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      medicationId: string;
      scheduledTime: string;
      status: MedLogStatus;
      notes?: string;
      day?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureCareOpsTables(sql);
    if (!isMedLogStatus(data.status)) throw new Error("Pick given, missed, refused, or held");
    const times = parseScheduleTimes([data.scheduledTime]);
    if (!times[0]) throw new Error("Pick a scheduled time");
    const med = await sql<{
      id: string;
      daycare_id: string;
      booking_id: string | null;
      conversation_id: string | null;
      child_name: string;
      parent_user_id: string | null;
      name: string;
      start_day: string;
      end_day: string | null;
      archived_at: string | null;
    }>`
      select id, daycare_id, booking_id, conversation_id, child_name, parent_user_id, name,
             start_day::text as start_day, end_day::text as end_day, archived_at::text as archived_at
      from care_medications
      where id = ${data.medicationId}
      limit 1
    `;
    if (!med[0]) throw new Error("Unknown medication");
    await requireStaffWrite(context.userId, med[0].daycare_id);
    const day = data.day && /^\d{4}-\d{2}-\d{2}$/.test(data.day) ? data.day : todayYmd();
    if (
      !medicationActiveOnDay({
        startDay: med[0].start_day,
        endDay: med[0].end_day,
        archivedAt: med[0].archived_at,
        day,
      })
    ) {
      throw new Error("This schedule is not active today");
    }
    const givenByName = await actorName(context.userId);
    const id = nid("ml");
    await sql`
      insert into care_medication_logs (
        id, medication_id, daycare_id, booking_id, conversation_id, child_name, parent_user_id,
        day, scheduled_time, status, notes, given_by, given_by_name
      )
      values (
        ${id}, ${med[0].id}, ${med[0].daycare_id}, ${med[0].booking_id}, ${med[0].conversation_id},
        ${med[0].child_name}, ${med[0].parent_user_id}, ${day}, ${times[0]}, ${data.status},
        ${String(data.notes || "").trim().slice(0, 500)}, ${context.userId}, ${givenByName}
      )
    `;
    const centre = await sql<{ name: string }>`select name from daycares where id = ${med[0].daycare_id} limit 1`;
    const daycareName = centre[0]?.name || "the centre";
    await insertCareStatusMessage({
      conversationId: med[0].conversation_id,
      daycareId: med[0].daycare_id,
      daycareName,
      parentUserId: med[0].parent_user_id,
      body: careStatusBody({
        kind: "medication",
        childName: med[0].child_name,
        daycareName,
        medicationName: med[0].name,
        doseStatus: data.status,
      }),
      actorUserId: context.userId,
    }).catch(() => undefined);
    return { ok: true as const, id };
  });

export const submitCareIncident = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      bookingId?: string | null;
      conversationId?: string | null;
      childName: string;
      parentUserId?: string | null;
      kind: IncidentKind;
      location?: string;
      description: string;
      actionTaken?: string;
      firstAid?: boolean;
      occurredAt?: string;
      day?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const daycareId = String(data.daycareId || "").trim();
    const childName = String(data.childName || "").trim();
    const description = String(data.description || "").replace(/\s+/g, " ").trim().slice(0, 4000);
    if (!daycareId || !childName) throw new Error("Pick a child");
    if (!incidentPostReady({ kind: data.kind, description })) throw new Error("Add what happened");
    const sql = await requireStaffWrite(context.userId, daycareId);
    await ensureCareOpsTables(sql);
    await loadEnrolledBooking(sql, {
      daycareId,
      bookingId: data.bookingId,
      parentUserId: context.userId,
    }).catch(() => null);
    const day = data.day && /^\d{4}-\d{2}-\d{2}$/.test(data.day) ? data.day : todayYmd();
    const occurredAt = data.occurredAt && !Number.isNaN(Date.parse(data.occurredAt)) ? data.occurredAt : new Date().toISOString();
    const authorName = await actorName(context.userId);
    const id = nid("inc");
    const notifiedAt = new Date().toISOString();
    await sql`
      insert into care_incidents (
        id, daycare_id, booking_id, conversation_id, child_name, parent_user_id,
        day, occurred_at, location, kind, description, action_taken, first_aid,
        author_user_id, author_name, parent_notified_at
      )
      values (
        ${id}, ${daycareId}, ${data.bookingId ?? null}, ${data.conversationId ?? null},
        ${childName}, ${data.parentUserId ?? null}, ${day}, ${occurredAt},
        ${String(data.location || "").trim().slice(0, 120)}, ${data.kind}, ${description},
        ${String(data.actionTaken || "").trim().slice(0, 2000)}, ${Boolean(data.firstAid)},
        ${context.userId}, ${authorName}, ${notifiedAt}
      )
    `;
    const centre = await sql<{ name: string }>`select name from daycares where id = ${daycareId} limit 1`;
    const daycareName = centre[0]?.name || "the centre";
    await insertCareStatusMessage({
      conversationId: data.conversationId ?? null,
      daycareId,
      daycareName,
      parentUserId: data.parentUserId ?? null,
      body: careStatusBody({
        kind: "incident",
        childName,
        daycareName,
        incidentKind: data.kind,
      }),
      actorUserId: context.userId,
    }).catch(() => undefined);
    return { ok: true as const, id };
  });
