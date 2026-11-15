import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import {
  cleanName,
  healthAnswers,
  isFloorEventKind,
  isToiletKind,
  markRoll,
  pickupMatches,
  rollCanClose,
  type RollMark,
} from "@/lib/care-floor";
import { centreCanWriteCare } from "@/lib/centre-roles";
import { getSql } from "@/lib/db";
import { nid } from "@/lib/utils";
import { listAccessibleDaycareIds, loadCentreRole } from "@/lib/server/centre-access";
import { resolveAdminAccess } from "@/lib/server/roles";

type Row = {
  id: string;
  kind: string;
  booking_id: string | null;
  payload: unknown;
  created_at: string | Date;
  closed_at: string | Date | null;
};

function iso(value: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function payloadOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

async function canWrite(userId: string, daycareId: string): Promise<boolean> {
  const admin = (await resolveAdminAccess(userId)).ok;
  if (admin) return true;
  const sql = await getSql();
  const role = await loadCentreRole(sql, userId, daycareId);
  return centreCanWriteCare(role);
}

export const listCareFloor = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string } | undefined) => ({ daycareId: String(input?.daycareId || "").trim() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    const admin = (await resolveAdminAccess(context.userId)).ok;
    if (!admin && !ids.includes(data.daycareId)) return { ok: false as const, error: "Not your centre" };
    const children = await sql
      .query<{ booking_id: string; child_name: string; pickup_people: string | null }>(
        `select b.id as booking_id, coalesce(c.name, 'Child') as child_name, c.pickup_people
           from bookings b
           left join children c on c.id = b.child_id
          where b.daycare_id = $1 and b.status in ('accepted', 'enrolled', 'active')
          order by child_name
          limit 80`,
        [data.daycareId],
      )
      .catch(() => []);
    const staff = await sql
      .query<{ name: string }>(
        `select coalesce(u.name, u.email, 'Staff') as name
           from centre_members m
           join "user" u on u.id = m.user_id
          where m.daycare_id = $1 and m.status = 'active'
          limit 40`,
        [data.daycareId],
      )
      .catch(() => []);
    const rows = await sql
      .query<Row>(
        `select id, kind, booking_id, payload, created_at, closed_at
           from care_floor_records
          where daycare_id = $1
          order by created_at desc
          limit 80`,
        [data.daycareId],
      )
      .catch(() => []);
    return {
      ok: true as const,
      children: children.map((row) => ({
        bookingId: row.booking_id,
        name: row.child_name,
        pickups: String(row.pickup_people || "")
          .split(/[,;\n]+/)
          .map((name) => cleanName(name))
          .filter(Boolean),
      })),
      staff: staff.map((row) => cleanName(row.name)).filter(Boolean),
      records: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        bookingId: row.booking_id,
        payload: payloadOf(row.payload),
        createdAt: iso(row.created_at),
        closedAt: iso(row.closed_at),
      })),
    };
  });

export const saveCareFloor = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; action?: string; bookingId?: string; payload?: Record<string, unknown> }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    action: String(input?.action || "").trim(),
    bookingId: String(input?.bookingId || "").trim() || null,
    payload: input?.payload && typeof input.payload === "object" ? input.payload : {},
  }))
  .handler(async ({ context, data }) => {
    if (!(await canWrite(context.userId, data.daycareId))) return { ok: false as const, error: "You cannot change this centre." };
    const sql = await getSql();
    if (data.action === "roll_start") {
      const open = await sql<{ id: string }>`
        select id from care_floor_records
        where daycare_id = ${data.daycareId} and kind = 'roll' and closed_at is null
        limit 1
      `.catch(() => []);
      if (open[0]) return { ok: false as const, error: "A roll is already open." };
      const id = nid("roll");
      await sql`
        insert into care_floor_records (id, daycare_id, kind, payload, created_by)
        values (${id}, ${data.daycareId}, 'roll', ${JSON.stringify({ marks: [] })}::jsonb, ${context.userId})
      `;
      return { ok: true as const, id };
    }
    if (data.action === "roll_mark" || data.action === "roll_close") {
      const open = await sql<{ id: string; payload: unknown }>`
        select id, payload from care_floor_records
        where daycare_id = ${data.daycareId} and kind = 'roll' and closed_at is null
        order by created_at desc
        limit 1
      `.catch(() => []);
      if (!open[0]) return { ok: false as const, error: "Start a roll first." };
      const current = Array.isArray(payloadOf(open[0].payload).marks) ? (payloadOf(open[0].payload).marks as RollMark[]) : [];
      if (data.action === "roll_mark") {
        const marks = markRoll(current, {
          kind: data.payload.kind === "staff" ? "staff" : "child",
          name: cleanName(data.payload.name),
          accounted: data.payload.accounted !== false,
        });
        await sql`
          update care_floor_records set payload = ${JSON.stringify({ marks })}::jsonb
          where id = ${open[0].id}
        `;
        return { ok: true as const, id: open[0].id };
      }
      if (!rollCanClose(current)) return { ok: false as const, error: "Mark at least one person accounted for." };
      await sql`
        update care_floor_records
           set payload = ${JSON.stringify({ marks: current, closed: true })}::jsonb,
               closed_at = now()
         where id = ${open[0].id}
      `;
      return { ok: true as const, id: open[0].id };
    }
    if (data.action === "toilet") {
      if (!isToiletKind(data.payload.kind)) return { ok: false as const, error: "Pick a toileting type." };
      const id = nid("toilet");
      await sql`
        insert into care_floor_records (id, daycare_id, kind, booking_id, payload, created_by)
        values (
          ${id}, ${data.daycareId}, 'toilet', ${data.bookingId},
          ${JSON.stringify({ kind: data.payload.kind, note: cleanName(data.payload.note), child: cleanName(data.payload.child) })}::jsonb,
          ${context.userId}
        )
      `;
      return { ok: true as const, id };
    }
    if (data.action === "pickup") {
      const allowed = Array.isArray(data.payload.allowed) ? data.payload.allowed.map(cleanName) : [];
      const matched = pickupMatches(String(data.payload.person || ""), allowed);
      if (!matched) return { ok: false as const, error: "That name is not on the pickup list." };
      if (data.payload.confirmed !== true) return { ok: false as const, error: "Staff need to confirm the pickup." };
      const signature = cleanName(data.payload.signature);
      if (signature.length < 3) return { ok: false as const, error: "Add a signature." };
      const id = nid("pickup");
      await sql`
        insert into care_floor_records (id, daycare_id, kind, booking_id, payload, created_by)
        values (
          ${id}, ${data.daycareId}, 'pickup', ${data.bookingId},
          ${JSON.stringify({ person: matched, child: cleanName(data.payload.child), signature })}::jsonb,
          ${context.userId}
        )
      `;
      return { ok: true as const, id };
    }
    if (data.action === "health") {
      const checks = healthAnswers(data.payload.checks);
      if (!checks) return { ok: false as const, error: "Answer each health question." };
      const id = nid("health");
      await sql`
        insert into care_floor_records (id, daycare_id, kind, booking_id, payload, created_by)
        values (
          ${id}, ${data.daycareId}, 'health', ${data.bookingId},
          ${JSON.stringify({ checks, child: cleanName(data.payload.child) })}::jsonb,
          ${context.userId}
        )
      `;
      return { ok: true as const, id };
    }
    if (data.action === "event") {
      if (!isFloorEventKind(data.payload.kind)) return { ok: false as const, error: "Pick allergen or incident." };
      const note = cleanName(data.payload.note);
      if (note.length < 3) return { ok: false as const, error: "Write what happened." };
      const id = nid("event");
      await sql`
        insert into care_floor_records (id, daycare_id, kind, booking_id, payload, created_by)
        values (
          ${id}, ${data.daycareId}, 'event', ${data.bookingId},
          ${JSON.stringify({ kind: data.payload.kind, note, child: cleanName(data.payload.child) })}::jsonb,
          ${context.userId}
        )
      `;
      return { ok: true as const, id };
    }
    return { ok: false as const, error: "That action is not available." };
  });
