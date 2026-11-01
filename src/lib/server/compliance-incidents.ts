import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { nid } from "@/lib/utils";
import {
  deadlineFor,
  escalationDecision,
  incidentAggregate,
  incidentsMode,
  isIncidentKind,
  parentEmailPlan,
  smsPlan,
} from "@/lib/compliance/incidents";
import { caslSmsGranted, centreRow, logPractice, ownedCentreIds, readScope, sendComplianceEmail, sendComplianceSms, sqlClient } from "@/lib/server/compliance-common";
import { requireAdmin } from "@/lib/server/roles";

const ZONE: Record<string, string> = {
  BC: "America/Vancouver",
  AB: "America/Edmonton",
  SK: "America/Regina",
  MB: "America/Winnipeg",
  ON: "America/Toronto",
  QC: "America/Toronto",
  NB: "America/Moncton",
  NS: "America/Halifax",
  PE: "America/Halifax",
  NL: "America/St_Johns",
  YT: "America/Whitehorse",
  NT: "America/Yellowknife",
  NU: "America/Iqaluit",
};

function zoneFor(province: string) {
  return ZONE[province.trim().toUpperCase()] || "America/Winnipeg";
}

async function centrePayload(userId: string) {
  const mode = incidentsMode(process.env);
  if (mode === "off") return { enabled: false as const, mode, centres: [], rows: [] };
  const ids = await ownedCentreIds(userId);
  const sql = await sqlClient();
  const centres = ids.length
    ? await sql
        .query<{ id: string; name: string; province: string }>(
          `select id, name, province from daycares where id = any($1::text[]) order by name`,
          [ids],
        )
        .catch(() => [])
    : [];
  const rows = ids.length
    ? await sql
        .query<{ id: string; daycare_id: string; kind: string; summary: string; filed_at: string | null; aware_at: string }>(
          `select id, daycare_id, kind, summary, filed_at, aware_at
           from serious_incidents
           where daycare_id = any($1::text[])
           order by aware_at desc
           limit 40`,
          [ids],
        )
        .catch(() => [])
    : [];
  return { enabled: true as const, mode, centres, rows };
}

export const loadCentreIncidents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => centrePayload(context.userId));

export const saveIncident = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; kind?: string; summary?: string; childLabel?: string; parentUserId?: string }) => input)
  .handler(async ({ context, data }) => {
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("write");
    const mode = incidentsMode(process.env);
    if (mode === "off") return { ok: false as const, reason: "off" };
    const daycareId = String(data.daycareId || "").trim();
    const ids = await ownedCentreIds(context.userId);
    if (!ids.includes(daycareId)) return { ok: false as const, reason: "centre" };
    const kind = String(data.kind || "");
    if (!isIncidentKind(kind)) return { ok: false as const, reason: "kind" };
    const summary = String(data.summary || "").trim().slice(0, 1000);
    if (summary.length < 8) return { ok: false as const, reason: "summary" };
    const sql = await sqlClient();
    const centre = await centreRow(sql, daycareId);
    if (!centre) return { ok: false as const, reason: "centre" };
    const id = nid("inc");
    const childLabel = String(data.childLabel || "").trim().slice(0, 80) || null;
    const parentUserId = String(data.parentUserId || "").trim() || null;
    await sql`
      insert into serious_incidents (
        id, daycare_id, province, kind, summary, child_label, parent_user_id, aware_at, created_by
      ) values (
        ${id}, ${daycareId}, ${centre.province}, ${kind}, ${summary}, ${childLabel}, ${parentUserId}, now(), ${context.userId}
      )
    `;
    logPractice("FEATURE_INCIDENTS", { action: "saved", incidentId: id, province: centre.province, kind, mode });
    return { ok: true as const, id };
  });

export const loadParentIncidents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const mode = incidentsMode(process.env);
    if (mode === "off") return { enabled: false as const, mode, rows: [] };
    const sql = await sqlClient();
    const rows = await sql<{ id: string; kind: string; summary: string; aware_at: string }>`
      select id, kind, summary, aware_at
      from serious_incidents
      where parent_user_id = ${context.userId}
      order by aware_at desc
      limit 20
    `.catch(() => []);
    return { enabled: true as const, mode, rows };
  });

async function govRows(province: string) {
  const sql = await sqlClient();
  const filings = await sql<{ id: string; kind: string; summary: string; child_label: string | null; filed_at: string | null; aware_at: string }>`
    select id, kind, summary, child_label, filed_at, aware_at
    from serious_incidents
    where province = ${province}
    order by aware_at desc
    limit 50
  `.catch(() => []);
  const counts = incidentAggregate(
    filings.map((row) => ({ kind: row.kind, province })),
    province,
  );
  return { filings, counts };
}

export const loadGovIncidents = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    const mode = incidentsMode(process.env);
    const gov = context.gov as { province: string; userId: string };
    const scope = await readScope(gov.userId);
    const province = scope?.province || gov.province;
    if (mode === "off") return { enabled: false as const, mode, province, filings: [], counts: [] };
    const data = await govRows(province);
    return { enabled: true as const, mode, province, ...data };
  });

export const loadAdminIncidents = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { province?: string } | undefined) => ({ province: String(input?.province || "ON").slice(0, 8) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const mode = incidentsMode(process.env);
    if (mode === "off") return { enabled: false as const, mode, province: data.province, filings: [], counts: [] };
    const dataRows = await govRows(data.province);
    return { enabled: true as const, mode, province: data.province, ...dataRows };
  });

export async function runIncidentJob(now = new Date()) {
  const mode = incidentsMode(process.env);
  if (mode === "off") return { ok: true, mode, escalated: 0, notices: 0 };
  const sql = await sqlClient();
  const open = await sql<{
    id: string;
    province: string;
    kind: string;
    aware_at: string;
    filed_at: string | null;
    escalated_at: string | null;
    parent_user_id: string | null;
    parent_notice_at: string | null;
  }>`
    select id, province, kind, aware_at, filed_at, escalated_at, parent_user_id, parent_notice_at
    from serious_incidents
    where filed_at is null or parent_notice_at is null
    order by aware_at asc
    limit 100
  `.catch(() => []);
  let escalated = 0;
  let notices = 0;
  for (const row of open) {
    const rule = deadlineFor(row.province);
    const hours = rule?.hours ?? 24;
    const plan = escalationDecision({
      mode,
      awareAt: new Date(row.aware_at),
      hours,
      now,
      filedAt: row.filed_at ? new Date(row.filed_at) : null,
      escalatedAt: row.escalated_at ? new Date(row.escalated_at) : null,
    });
    if (plan.escalate) {
      escalated += 1;
      logPractice("FEATURE_INCIDENTS", { action: "escalate", incidentId: row.id, province: row.province, kind: row.kind, delivery: plan.delivery });
      if (plan.delivery === "send") {
        await sql`update serious_incidents set escalated_at = now() where id = ${row.id} and escalated_at is null`;
      }
    }
    if (!row.parent_user_id || row.parent_notice_at) continue;
    const parent = await sql<{ email: string | null; phone: string | null }>`
      select u.email, p.phone
      from "user" u
      left join profiles p on p.user_id = u.id
      where u.id = ${row.parent_user_id}
      limit 1
    `.catch(() => []);
    const email = parent[0]?.email || "";
    const phone = parent[0]?.phone || "";
    const mail = parentEmailPlan({
      mode,
      occurredAt: new Date(row.aware_at),
      now,
      timeZone: zoneFor(row.province),
      hasEmail: Boolean(email),
      alreadySent: false,
    });
    const casl = await caslSmsGranted(row.parent_user_id);
    const sms = smsPlan(mode, casl);
    logPractice("FEATURE_INCIDENTS", {
      action: "parent_notice",
      incidentId: row.id,
      province: row.province,
      email: mail.delivery,
      sms: sms.delivery,
    });
    if (mail.delivery === "send" && email) {
      const sent = await sendComplianceEmail({
        to: email,
        subject: "KidEase: a note from your daycare",
        text: "Your daycare filed a same-day note. Sign in to KidEase to read it. This is not a text.",
      });
      if (sent === "sent") {
        await sql`update serious_incidents set parent_notice_at = now() where id = ${row.id}`;
        notices += 1;
      }
    } else if (mail.delivery === "log") {
      notices += 1;
    }
    if (sms.delivery === "send" && phone) {
      await sendComplianceSms({
        to: phone,
        body: "KidEase: your daycare posted a same-day note. Sign in to read it. Reply STOP to opt out.",
        consentGranted: true,
      });
    }
  }
  return { ok: true, mode, escalated, notices };
}
