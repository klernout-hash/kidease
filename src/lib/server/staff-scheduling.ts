import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { staffSchedulingEnabled } from "@/lib/features";
import {
  parseChildrenPresent,
  parseShift,
  planEceReminders,
  rosterRatio,
  ROOM_BANDS,
  staffOnShift,
} from "@/lib/staff-scheduling";
import type { RoomBand } from "@/lib/provincial-ratios";
import { nid } from "@/lib/utils";

async function ensureStaffTables() {
  const sql = await getSql();
  await sql`
    create table if not exists staff_shifts (
      id text primary key,
      daycare_id text not null,
      staff_name text not null,
      role text not null default 'ece',
      room_band text not null,
      starts_at timestamptz not null,
      ends_at timestamptz not null,
      created_by text not null,
      created_at timestamptz not null default now()
    )
  `.catch(() => undefined);
  await sql`
    create table if not exists ece_certificates (
      id text primary key,
      daycare_id text not null,
      staff_name text not null,
      province text not null,
      certificate_number text not null default '',
      level text not null default '',
      expires_on date not null,
      reminded_at timestamptz,
      created_by text not null,
      created_at timestamptz not null default now()
    )
  `.catch(() => undefined);
}

async function assertCentre(userId: string, daycareId: string) {
  const sql = await getSql();
  const ids = await listAccessibleDaycareIds(sql, userId);
  if (!ids.includes(daycareId)) throw new Error("This centre is not yours.");
}

export const staffDeskStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => ({ enabled: staffSchedulingEnabled() }));

export const listStaffDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string } | undefined) => ({ daycareId: String(input?.daycareId || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!staffSchedulingEnabled()) {
      return { enabled: false as const, centres: [], shifts: [], certs: [], province: "", daycareId: "" };
    }
    const sql = await getSql();
    await ensureStaffTables();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    if (!ids.length) return { enabled: true as const, centres: [], shifts: [], certs: [], province: "", daycareId: "" };
    const centres = await sql.query<{ id: string; name: string; province: string }>(
      `select id, name, province from daycares where id = any($1::text[]) order by name`,
      [ids],
    ).catch(() => []);
    const daycareId = centres.some((row) => row.id === data.daycareId) ? data.daycareId : centres[0]?.id || "";
    const province = centres.find((row) => row.id === daycareId)?.province || "";
    const shifts = daycareId
      ? await sql<{ id: string; staff_name: string; role: string; room_band: string; starts_at: string; ends_at: string }>`
          select id, staff_name, role, room_band, starts_at, ends_at
          from staff_shifts where daycare_id = ${daycareId}
          order by starts_at desc limit 40
        `.catch(() => [])
      : [];
    const certs = daycareId
      ? await sql<{
          id: string;
          staff_name: string;
          certificate_number: string;
          level: string;
          expires_on: string;
          reminded_at: string | null;
        }>`
          select id, staff_name, certificate_number, level, expires_on, reminded_at
          from ece_certificates where daycare_id = ${daycareId}
          order by expires_on asc limit 40
        `.catch(() => [])
      : [];
    return {
      enabled: true as const,
      centres: centres.map((row) => ({ id: row.id, name: row.name, province: row.province })),
      province,
      daycareId,
      shifts: shifts.map((row) => ({
        id: row.id,
        staffName: row.staff_name,
        role: row.role,
        roomBand: row.room_band,
        startsAt: new Date(row.starts_at).toISOString(),
        endsAt: new Date(row.ends_at).toISOString(),
      })),
      certs: certs.map((row) => ({
        id: row.id,
        staffName: row.staff_name,
        certificateNumber: row.certificate_number,
        level: row.level,
        expiresOn: String(row.expires_on).slice(0, 10),
        remindedAt: row.reminded_at ? new Date(row.reminded_at).toISOString() : null,
      })),
    };
  });

export const saveStaffShift = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string } & Parameters<typeof parseShift>[0]) => input)
  .handler(async ({ context, data }) => {
    if (!staffSchedulingEnabled()) throw new Error("Staff shifts are off.");
    const daycareId = String(data.daycareId || "").trim();
    await assertCentre(context.userId, daycareId);
    const parsed = parseShift(data);
    if (!parsed.ok) throw new Error("Check the name and the times.");
    const { screeningGate } = await import("@/lib/server/compliance-screening");
    const gate = await screeningGate(daycareId, parsed.shift.staffName);
    if (gate.block) throw new Error("This staff record is expired. Update it before adding the shift.");
    await ensureStaffTables();
    const sql = await getSql();
    const id = nid("shf");
    await sql`
      insert into staff_shifts (id, daycare_id, staff_name, role, room_band, starts_at, ends_at, created_by)
      values (
        ${id}, ${daycareId}, ${parsed.shift.staffName}, ${parsed.shift.role}, ${parsed.shift.roomBand},
        ${parsed.shift.startsAt}, ${parsed.shift.endsAt}, ${context.userId}
      )
    `;
    return { ok: true as const, id, hours: parsed.shift.hours };
  });

export const saveEceCertificate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    daycareId?: string;
    staffName?: string;
    level?: string;
    certificateNumber?: string;
    expiresOn?: string;
  }) => input)
  .handler(async ({ context, data }) => {
    if (!staffSchedulingEnabled()) throw new Error("Staff shifts are off.");
    const daycareId = String(data.daycareId || "").trim();
    await assertCentre(context.userId, daycareId);
    const staffName = String(data.staffName || "").trim().slice(0, 80);
    const expiresOn = String(data.expiresOn || "").slice(0, 10);
    if (staffName.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) throw new Error("Check the name and the date.");
    const sql = await getSql();
    const provinceRows = await sql<{ province: string }>`select province from daycares where id = ${daycareId} limit 1`;
    const province = (provinceRows[0]?.province || "").slice(0, 8);
    await ensureStaffTables();
    const id = nid("ece");
    await sql`
      insert into ece_certificates (
        id, daycare_id, staff_name, province, certificate_number, level, expires_on, created_by
      ) values (
        ${id}, ${daycareId}, ${staffName}, ${province},
        ${String(data.certificateNumber || "").trim().slice(0, 40)},
        ${String(data.level || "").trim().slice(0, 40)},
        ${expiresOn}, ${context.userId}
      )
    `;
    return { ok: true as const, id };
  });

export const checkRoomRatio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; roomBand?: string; childrenPresent?: unknown }) => input)
  .handler(async ({ context, data }) => {
    if (!staffSchedulingEnabled()) throw new Error("Staff shifts are off.");
    const daycareId = String(data.daycareId || "").trim();
    await assertCentre(context.userId, daycareId);
    const band = ROOM_BANDS.includes(data.roomBand as RoomBand) ? (data.roomBand as RoomBand) : null;
    const children = parseChildrenPresent(data.childrenPresent);
    if (!band || children == null) throw new Error("Count the children and pick a room.");
    const sql = await getSql();
    const provinceRows = await sql<{ province: string }>`select province from daycares where id = ${daycareId} limit 1`;
    const shifts = await sql<{ room_band: string; starts_at: string; ends_at: string }>`
      select room_band, starts_at, ends_at from staff_shifts where daycare_id = ${daycareId}
    `.catch(() => []);
    const onShift = staffOnShift(
      shifts.map((row) => ({
        roomBand: row.room_band,
        startsAt: new Date(row.starts_at).toISOString(),
        endsAt: new Date(row.ends_at).toISOString(),
      })),
      band,
      new Date(),
    );
    return {
      ok: true as const,
      staffOnShift: onShift,
      childrenPresent: children,
      ...rosterRatio({
        province: provinceRows[0]?.province || "",
        band,
        childrenPresent: children,
        staffOnShift: onShift,
      }),
    };
  });

export const sendEceExpiryReminders = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: String(input?.daycareId || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!staffSchedulingEnabled()) return { ok: true as const, sent: 0 };
    await assertCentre(context.userId, data.daycareId);
    const sql = await getSql();
    await ensureStaffTables();
    const certs = await sql<{
      id: string;
      staff_name: string;
      expires_on: string;
      reminded_at: string | null;
    }>`
      select id, staff_name, expires_on, reminded_at
      from ece_certificates where daycare_id = ${data.daycareId}
    `.catch(() => []);
    const due = planEceReminders(
      certs.map((row) => ({
        id: row.id,
        staffName: row.staff_name,
        expiresOn: String(row.expires_on).slice(0, 10),
        remindedAt: row.reminded_at ? new Date(row.reminded_at).toISOString() : null,
      })),
      new Date(),
    );
    if (!due.length) return { ok: true as const, sent: 0 };
    const mailRows = await sql<{ email: string | null; contact: string | null; name: string }>`
      select u.email, d.contact_email as contact, d.name
      from daycares d
      left join provider_daycares p on p.daycare_id = d.id
      left join "user" u on u.id = p.user_id
      where d.id = ${data.daycareId}
      limit 1
    `.catch(() => []);
    const to = (mailRows[0]?.contact || mailRows[0]?.email || "").trim();
    if (!to) return { ok: true as const, sent: 0 };
    const lines = due.map((row) => `${row.staffName} expires ${row.expiresOn}`).join("\n");
    const { sendTransactionalMail } = await import("@/lib/transactional-mail");
    await sendTransactionalMail({
      purpose: "customer_alert",
      to,
      subject: `ECE certificates expiring: ${mailRows[0]?.name || "your centre"}`,
      text: `These ECE certificates expire within 60 days or are already expired.\n\n${lines}\n\nKidEase does not text staff.`,
      html: `<p>These ECE certificates expire within 60 days or are already expired.</p><pre>${lines}</pre>`,
    }).catch(() => undefined);
    for (const row of due) {
      await sql`update ece_certificates set reminded_at = now() where id = ${row.id}`.catch(() => undefined);
    }
    return { ok: true as const, sent: due.length };
  });
