/**
 * Timestamped arrival and pickup. FEATURE_CHILD_CHECKIN defaults off.
 * Pickup names are checked only when the parent already saved them.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { maxCentreRole } from "@/lib/centre-roles";
import { getSql } from "@/lib/db";
import { clampTapTime } from "@/lib/centre-tools";
import { childCheckinEnabled, centreToolIds } from "@/lib/features";
import { attendancePreviewEnabled } from "@/lib/attendance-handoff";
import { parentAbsenceBody } from "@/lib/daily-care";
import { listAccessibleDaycareIds, loadCentreRole } from "./centre-access";
import { commitCorrection, commitHandoff, readCentreDay, readParentDay, saveParentAbsenceReport, seedDemoChildren } from "./attendance-handoff";

function doorOn() {
  return childCheckinEnabled() || attendancePreviewEnabled();
}

export const childCheckinFlag = createServerFn({ method: "GET" }).handler(async () => childCheckinEnabled());

function iso(value: string | Date | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  const text = String(value || "");
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();
}

export const listDoorRoster = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!doorOn()) return { enabled: false as const, children: [], events: [], headcount: 0, canCorrect: false };
    const sql = await getSql();
    const centres = await listAccessibleDaycareIds(sql, context.userId);
    if (!centres.length) return { enabled: true as const, children: [], events: [], headcount: 0, canCorrect: false };
    const roles = await Promise.all(centres.map((id) => loadCentreRole(sql, context.userId, id)));
    const day = await readCentreDay(sql, { centreIds: centres, role: maxCentreRole(roles), now: new Date() });
    return {
      enabled: true as const,
      headcount: day.headcount,
      canCorrect: day.canCorrect,
      children: day.children,
      events: [],
    };
  });

export const recordChildCheck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { bookingId?: string; action?: string; pickupName?: string; at?: string }) => ({
    bookingId: String(input?.bookingId || "").trim(),
    action: input?.action === "check_out" ? ("check_out" as const) : ("check_in" as const),
    pickupName: String(input?.pickupName || ""),
    at: String(input?.at || ""),
  }))
  .handler(async ({ context, data }) => {
    if (!doorOn()) return { ok: false as const, reason: "off" as const };
    if (!data.bookingId) return { ok: false as const, error: "That child is not enrolled here." };
    const sql = await getSql();
    const found = await sql<{ daycare_id: string }>`
      select daycare_id from bookings where id = ${data.bookingId} limit 1
    `;
    const role = found[0] ? await loadCentreRole(sql, context.userId, found[0].daycare_id) : null;
    const offlineAt =
      data.at && (centreToolIds() as string[]).includes("offline") ? clampTapTime(data.at, Date.now()) : null;
    return commitHandoff(sql, {
      actorId: context.userId,
      role,
      bookingId: data.bookingId,
      action: data.action,
      pickupName: data.pickupName,
      now: offlineAt ? new Date(offlineAt) : new Date(),
    });
  });

export const correctChildCheck = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { bookingId?: string; action?: string; reason?: string }) => ({
    bookingId: String(input?.bookingId || "").trim(),
    action: input?.action === "check_in" ? ("check_in" as const) : ("check_out" as const),
    reason: String(input?.reason || ""),
  }))
  .handler(async ({ context, data }) => {
    if (!doorOn()) return { ok: false as const, reason: "off" as const };
    const sql = await getSql();
    const found = await sql<{ daycare_id: string }>`
      select daycare_id from bookings where id = ${data.bookingId} limit 1
    `;
    const role = found[0] ? await loadCentreRole(sql, context.userId, found[0].daycare_id) : null;
    return commitCorrection(sql, {
      actorId: context.userId,
      role,
      bookingId: data.bookingId,
      action: data.action,
      reason: data.reason,
      now: new Date(),
    });
  });

export const listMyChildAttendance = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const enabled = doorOn();
    const sql = await getSql();
    const children = await readParentDay(sql, context.userId, new Date(), enabled);
    return { enabled, children };
  });

export const reportMyChildAbsence = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { bookingId?: string; status?: string; locale?: string }) => ({
    bookingId: String(input?.bookingId || "").trim().slice(0, 100),
    status: String(input?.status || ""),
    locale: input?.locale === "fr" ? "fr" : "en",
  }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const report = await saveParentAbsenceReport(sql, {
      userId: context.userId, bookingId: data.bookingId, status: data.status, now: new Date(),
    });
    if (!report.ok) return report;
    const { insertCareStatusMessage } = await import("./daily-care");
    await insertCareStatusMessage({
      conversationId: report.conversationId, daycareId: report.daycareId, daycareName: report.daycareName,
      parentUserId: context.userId, actorUserId: context.userId,
      body: parentAbsenceBody({ ...report, locale: data.locale }),
    }).catch(() => undefined);
    return { ok: true as const, localDay: report.localDay };
  });

export const seedDemoAttendance = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!attendancePreviewEnabled()) return { ok: false as const, error: "The attendance preview is closed." };
    const sql = await getSql();
    const seeded = await seedDemoChildren(sql, context.userId);
    return { ok: true as const, ...seeded };
  });

export const attendancePreviewOpen = createServerFn({ method: "GET" }).handler(async () => ({
  open: attendancePreviewEnabled(),
}));

export const listMyCheckHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!doorOn()) return { enabled: false as const, events: [] };
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      child_name: string;
      action: string;
      at: string | Date;
      pickup_name: string;
      daycare_name: string;
      timezone: string | null;
    }>`
      select e.id, e.child_name, e.action, e.at, e.pickup_name, d.name as daycare_name, d.timezone
      from child_check_events e
      join daycares d on d.id = e.daycare_id
      where e.parent_user_id = ${context.userId}
      order by e.at desc
      limit 40
    `.catch(() => []);
    return {
      enabled: true as const,
      events: rows.map((row) => ({
        id: row.id,
        childName: row.child_name,
        daycareName: row.daycare_name,
        action: row.action === "check_out" ? ("check_out" as const) : ("check_in" as const),
        at: iso(row.at),
        timeZone: row.timezone,
        pickupName: row.pickup_name || "",
      })),
    };
  });
