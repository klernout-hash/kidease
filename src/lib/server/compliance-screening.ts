import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { nid } from "@/lib/utils";
import { credentialStatus, isCredentialKind, scheduleDecision, screeningMode } from "@/lib/compliance/screening";
import { smsPlan } from "@/lib/compliance/mode";
import { caslSmsGranted, centreRow, logPractice, ownedCentreIds, readScope, sendComplianceEmail, sendComplianceSms, sqlClient } from "@/lib/server/compliance-common";
import { requireAdmin } from "@/lib/server/roles";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function screeningGate(daycareId: string, staffName: string) {
  const mode = screeningMode(process.env);
  if (mode === "off") return { allow: true, warn: false, block: false };
  const sql = await sqlClient();
  const rows = await sql<{ expires_on: string | null }>`
    select expires_on::text as expires_on
    from staff_credentials
    where daycare_id = ${daycareId}
      and lower(staff_name) = lower(${staffName})
  `.catch(() => []);
  const today = todayIso();
  let worst: "missing" | "current" | "expiring" | "expired" = rows.length ? "current" : "missing";
  for (const row of rows) {
    const status = credentialStatus(row.expires_on ? String(row.expires_on).slice(0, 10) : null, today);
    if (status === "expired" || status === "missing") worst = status;
    else if (status === "expiring" && worst === "current") worst = "expiring";
  }
  const decision = scheduleDecision({ mode, status: worst });
  if (decision.log) {
    logPractice("FEATURE_STAFF_SCREENING", { action: "shift_gate", daycareId, status: worst, block: decision.block, mode });
  }
  return decision;
}

export const loadCentreScreening = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const mode = screeningMode(process.env);
    if (mode === "off") return { enabled: false as const, mode, centres: [], rows: [] };
    const ids = await ownedCentreIds(context.userId);
    const sql = await sqlClient();
    const centres = ids.length
      ? await sql.query<{ id: string; name: string }>(`select id, name from daycares where id = any($1::text[]) order by name`, [ids]).catch(() => [])
      : [];
    const rows = ids.length
      ? await sql.query<{ id: string; staff_name: string; kind: string; expires_on: string | null }>(
          `select id, staff_name, kind, expires_on::text as expires_on from staff_credentials where daycare_id = any($1::text[]) order by expires_on asc limit 80`,
          [ids],
        ).catch(() => [])
      : [];
    const today = todayIso();
    return {
      enabled: true as const,
      mode,
      centres,
      rows: rows.map((row) => ({ ...row, status: credentialStatus(row.expires_on ? String(row.expires_on).slice(0, 10) : null, today) })),
    };
  });

export const saveCredential = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; staffName?: string; kind?: string; expiresOn?: string }) => input)
  .handler(async ({ context, data }) => {
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("write");
    const mode = screeningMode(process.env);
    if (mode === "off") return { ok: false as const, reason: "off" };
    const daycareId = String(data.daycareId || "").trim();
    const ids = await ownedCentreIds(context.userId);
    if (!ids.includes(daycareId)) return { ok: false as const, reason: "centre" };
    const kind = String(data.kind || "");
    const staffName = String(data.staffName || "").trim().slice(0, 80);
    const expiresOn = String(data.expiresOn || "").slice(0, 10);
    if (!isCredentialKind(kind) || staffName.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) {
      return { ok: false as const, reason: "form" };
    }
    const sql = await sqlClient();
    const centre = await centreRow(sql, daycareId);
    if (!centre) return { ok: false as const, reason: "centre" };
    const id = nid("scr");
    await sql`
      insert into staff_credentials (id, daycare_id, province, staff_name, kind, expires_on, created_by)
      values (${id}, ${daycareId}, ${centre.province}, ${staffName}, ${kind}, ${expiresOn}, ${context.userId})
    `;
    return { ok: true as const, id, status: credentialStatus(expiresOn, todayIso()) };
  });

async function provinceCounts(province: string) {
  const sql = await sqlClient();
  const rows = await sql<{ expires_on: string | null }>`
    select expires_on::text as expires_on from staff_credentials where province = ${province}
  `.catch(() => []);
  const today = todayIso();
  let expired = 0;
  let expiring = 0;
  for (const row of rows) {
    const status = credentialStatus(row.expires_on ? String(row.expires_on).slice(0, 10) : null, today);
    if (status === "expired" || status === "missing") expired += 1;
    else if (status === "expiring") expiring += 1;
  }
  return { expired, expiring };
}

export const loadGovScreening = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    const mode = screeningMode(process.env);
    const gov = context.gov as { province: string; userId: string };
    const scope = await readScope(gov.userId);
    const province = scope?.province || gov.province;
    if (mode === "off") return { enabled: false as const, mode, province, expired: 0, expiring: 0 };
    const counts = await provinceCounts(province);
    return { enabled: true as const, mode, province, ...counts };
  });

export const loadAdminScreening = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { province?: string } | undefined) => ({ province: String(input?.province || "ON").slice(0, 8) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const mode = screeningMode(process.env);
    if (mode === "off") return { enabled: false as const, mode, province: data.province, expired: 0, expiring: 0 };
    const counts = await provinceCounts(data.province);
    return { enabled: true as const, mode, province: data.province, ...counts };
  });

export async function runScreeningJob() {
  const mode = screeningMode(process.env);
  if (mode === "off") return { ok: true, mode, reminded: 0 };
  const sql = await sqlClient();
  const rows = await sql<{ id: string; daycare_id: string; kind: string; expires_on: string; created_by: string }>`
    select id, daycare_id, kind, expires_on::text as expires_on, created_by
    from staff_credentials
    where reminded_at is null or reminded_at < now() - interval '14 days'
    limit 100
  `.catch(() => []);
  const today = todayIso();
  let reminded = 0;
  for (const row of rows) {
    const status = credentialStatus(String(row.expires_on).slice(0, 10), today);
    if (status === "current") continue;
    const casl = await caslSmsGranted(row.created_by);
    const sms = smsPlan(mode, casl);
    logPractice("FEATURE_STAFF_SCREENING", { action: "remind", id: row.id, kind: row.kind, status, sms: sms.delivery, mode });
    if (mode === "live") {
      const centre = await centreRow(sql, row.daycare_id);
      if (centre?.contact_email) {
        await sendComplianceEmail({
          to: centre.contact_email,
          subject: "KidEase: a staff record is due",
          text: "A staff screening date is due or expired. Open your daycare desk to update it.",
        });
      }
      if (sms.delivery === "send") {
        const phone = await sql<{ phone: string | null }>`select phone from profiles where user_id = ${row.created_by} limit 1`.catch(() => []);
        if (phone[0]?.phone) {
          await sendComplianceSms({
            to: phone[0].phone,
            body: "KidEase: a staff record is due. Open your daycare desk. Reply STOP to opt out.",
            consentGranted: true,
          });
        }
      }
      await sql`update staff_credentials set reminded_at = now() where id = ${row.id}`;
    }
    reminded += 1;
  }
  return { ok: true, mode, reminded };
}
