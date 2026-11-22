import { createServerFn } from "@tanstack/react-start";
import { authMiddleware, sessionBearerMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import {
  aggregateExpiry,
  attestationLine,
  backgroundCheckReminder,
  canRecordBackgroundCheck,
  canViewBackgroundCheckRecords,
  isBgCheckKind,
  isBgProvince,
  isBgRole,
  jurisdictionByCode,
  policyMonthsAllowed,
  validPolicyMonths,
  type BgCheckKind,
  type BgRole,
  type ReminderStatus,
} from "@/lib/background-check-guide";
import {
  backgroundCheckAttestationEnabled,
  backgroundCheckGuideEnabled,
  backgroundCheckRecordsEnabled,
} from "@/lib/features";
import { loadCentreRole } from "@/lib/server/centre-access";
import { nid } from "@/lib/utils";
import { R2_SCREENING_PREFIX } from "@/lib/private-docs";
import { START_DAYCARE_PTS } from "@/lib/start-daycare-hub";

const OFF = "This tool is off.";
const DENIED = "You cannot change background-check records for this centre.";
const SEEN = "Confirm that you saw the official result.";
const NAME = "Enter the person’s name.";
const NOT_FILE = "This upload does not replace the licence holder’s personnel file.";

export type BackgroundCheckRecordView = {
  id: string;
  personName: string;
  role: BgRole;
  checkKind: BgCheckKind;
  issuedOn: string | null;
  expiresOn: string | null;
  reviewedName: string | null;
  reviewedAt: string | null;
  hasFile: boolean;
  status: ReminderStatus;
  dueOn: string | null;
};

export type BackgroundCheckCentreView = {
  daycareId: string;
  name: string;
  province: string;
  canWrite: boolean;
  policyMonths: number | null;
  policyAllowed: boolean;
  attest: boolean;
  attestAt: string | null;
  showExpiry: boolean;
  attestationOn: boolean;
  records: BackgroundCheckRecordView[];
};

export type BackgroundCheckDesk = {
  enabled: boolean;
  guide: boolean;
  records: boolean;
  centres: BackgroundCheckCentreView[];
};

type RecordRow = {
  id: string;
  person_name: string;
  role: string;
  check_kind: string;
  issued_on: string | Date | null;
  expires_on: string | Date | null;
  reviewed_name: string | null;
  reviewed_at: string | Date | null;
  file_ref: string | null;
};

type CentreRow = {
  id: string;
  name: string;
  province: string;
  bg_check_attest: number | boolean | null;
  bg_check_attest_at: string | Date | null;
  bg_check_show_expiry: number | boolean | null;
  bg_check_policy_months: number | null;
};

function day(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function stamp(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function provinceName(code: string, locale: "en" | "fr"): string {
  const row = START_DAYCARE_PTS.find((item) => item.code === code);
  if (!row) return code;
  return locale === "fr" ? row.nameFr : row.nameEn;
}

function mapRecord(row: RecordRow, province: string, policyMonths: number | null): BackgroundCheckRecordView | null {
  if (!isBgRole(row.role) || !isBgCheckKind(row.check_kind)) return null;
  const reminder = backgroundCheckReminder({
    province,
    kind: row.check_kind,
    issuedOn: day(row.issued_on),
    expiresOn: day(row.expires_on),
    policyMonths,
    today: todayUtc(),
  });
  return {
    id: row.id,
    personName: row.person_name,
    role: row.role,
    checkKind: row.check_kind,
    issuedOn: day(row.issued_on),
    expiresOn: day(row.expires_on),
    reviewedName: row.reviewed_name,
    reviewedAt: stamp(row.reviewed_at),
    hasFile: Boolean(row.file_ref),
    status: reminder.status,
    dueOn: reminder.dueOn,
  };
}

async function loadCentre(sql: Sql, daycareId: string, userId: string): Promise<BackgroundCheckCentreView | null> {
  const role = await loadCentreRole(sql, userId, daycareId);
  if (!canViewBackgroundCheckRecords(role)) return null;
  const rows = await sql<CentreRow>`
    select id, name, province, bg_check_attest, bg_check_attest_at, bg_check_show_expiry, bg_check_policy_months
    from daycares
    where id = ${daycareId}
    limit 1
  `;
  const centre = rows[0];
  if (!centre) return null;
  const province = (centre.province || "").trim().toUpperCase();
  const policyMonths = validPolicyMonths(centre.bg_check_policy_months);
  const records = await sql<RecordRow>`
    select id, person_name, role, check_kind, issued_on, expires_on, reviewed_name, reviewed_at, file_ref
    from background_check_records
    where daycare_id = ${daycareId}
    order by person_name, check_kind
  `;
  return {
    daycareId: centre.id,
    name: centre.name,
    province,
    canWrite: canRecordBackgroundCheck(role),
    policyMonths,
    policyAllowed: policyMonthsAllowed(province),
    attest: centre.bg_check_attest === 1 || centre.bg_check_attest === true,
    attestAt: stamp(centre.bg_check_attest_at),
    showExpiry: centre.bg_check_show_expiry === 1 || centre.bg_check_show_expiry === true,
    attestationOn: backgroundCheckAttestationEnabled(),
    records: records.map((row) => mapRecord(row, province, policyMonths)).filter((row): row is BackgroundCheckRecordView => Boolean(row)),
  };
}

export const loadBackgroundCheckDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<BackgroundCheckDesk> => {
    const guide = backgroundCheckGuideEnabled();
    const recordsOn = backgroundCheckRecordsEnabled();
    if (!guide && !recordsOn) return { enabled: false, guide: false, records: false, centres: [] };
    try {
      const sql = await getSql();
      const centres = await sql<{ id: string }>`
        select d.id
        from daycares d
        where exists (
          select 1 from provider_daycares p
          where p.daycare_id = d.id and p.user_id = ${context.userId}
        ) or exists (
          select 1 from centre_members m
          where m.daycare_id = d.id and m.user_id = ${context.userId} and m.status = 'active'
        )
        order by d.name
      `;
      const views: BackgroundCheckCentreView[] = [];
      for (const centre of centres) {
        const view = await loadCentre(sql, centre.id, context.userId);
        if (view) views.push(view);
      }
      return { enabled: true, guide, records: recordsOn, centres: views };
    } catch {
      return { enabled: false, guide, records: recordsOn, centres: [] };
    }
  });

export const saveBackgroundCheckRecord = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    daycareId: string;
    personName: string;
    role: string;
    checkKind: string;
    issuedOn: string;
    expiresOn: string;
    reviewerName: string;
    sawOfficial: boolean;
  }) => input)
  .handler(async ({ context, data }) => {
    if (!backgroundCheckRecordsEnabled()) throw new Error(OFF);
    if (!data.sawOfficial) throw new Error(SEEN);
    const personName = data.personName.trim().slice(0, 120);
    const reviewerName = data.reviewerName.trim().slice(0, 120);
    if (personName.length < 2) throw new Error(NAME);
    if (reviewerName.length < 2) throw new Error(SEEN);
    if (!isBgRole(data.role) || !isBgCheckKind(data.checkKind)) throw new Error(DENIED);
    const issuedOn = /^\d{4}-\d{2}-\d{2}$/.test(data.issuedOn) ? data.issuedOn : null;
    const expiresOn = /^\d{4}-\d{2}-\d{2}$/.test(data.expiresOn) ? data.expiresOn : null;
    const sql = await getSql();
    const role = await loadCentreRole(sql, context.userId, data.daycareId.trim());
    if (!canRecordBackgroundCheck(role)) throw new Error(DENIED);
    const id = nid("bcr");
    await sql`
      insert into background_check_records
        (id, daycare_id, person_name, role, check_kind, issued_on, expires_on, reviewed_by, reviewed_name, reviewed_at, updated_at)
      values (
        ${id},
        ${data.daycareId.trim()},
        ${personName},
        ${data.role},
        ${data.checkKind},
        ${issuedOn},
        ${expiresOn},
        ${context.userId},
        ${reviewerName},
        now(),
        now()
      )
    `;
    return { ok: true as const, id, notice: NOT_FILE };
  });

export const saveBackgroundCheckSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    daycareId: string;
    policyMonths: number | null;
    attest: boolean;
    showExpiry: boolean;
  }) => input)
  .handler(async ({ context, data }) => {
    if (!backgroundCheckRecordsEnabled() && !backgroundCheckAttestationEnabled()) throw new Error(OFF);
    const sql = await getSql();
    const daycareId = data.daycareId.trim();
    const role = await loadCentreRole(sql, context.userId, daycareId);
    if (!canRecordBackgroundCheck(role)) throw new Error(DENIED);
    const centre = await sql<{ province: string }>`
      select province from daycares where id = ${daycareId} limit 1
    `;
    const province = (centre[0]?.province || "").trim().toUpperCase();
    const months = policyMonthsAllowed(province) ? validPolicyMonths(data.policyMonths) : null;
    const attest = backgroundCheckAttestationEnabled() && data.attest;
    const showExpiry = attest && data.showExpiry;
    await sql`
      update daycares
      set bg_check_policy_months = ${months},
          bg_check_attest = ${attest ? 1 : 0},
          bg_check_attest_at = case when ${attest ? 1 : 0} = 1 then coalesce(bg_check_attest_at, now()) else null end,
          bg_check_show_expiry = ${showExpiry ? 1 : 0}
      where id = ${daycareId}
    `;
    return { ok: true as const };
  });

export async function saveBackgroundCheckFile(input: {
  userId: string;
  recordId: string;
  body: Buffer;
  mime: string;
  filename: string;
}): Promise<{ id: string }> {
  if (!backgroundCheckRecordsEnabled()) throw new Error(OFF);
  const sql = await getSql();
  const rows = await sql<{ id: string; daycare_id: string }>`
    select id, daycare_id from background_check_records where id = ${input.recordId.trim()} limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Record not found.");
  const role = await loadCentreRole(sql, input.userId, row.daycare_id);
  if (!canRecordBackgroundCheck(role)) throw new Error(DENIED);
  const { persistPrivateDoc } = await import("@/lib/server/private-docs");
  const stored = await persistPrivateDoc({
    prefix: R2_SCREENING_PREFIX,
    keyTail: `bgcheck-${row.id}`,
    body: input.body,
    mime: input.mime,
  });
  await sql`
    update background_check_records
    set file_ref = ${stored.storageRef}, updated_at = now()
    where id = ${row.id}
  `;
  return { id: row.id };
}

export async function readBackgroundCheckFile(input: {
  userId: string;
  recordId: string;
}): Promise<{ body: Buffer; mime: string; filename: string }> {
  if (!backgroundCheckRecordsEnabled()) throw new Error(OFF);
  const sql = await getSql();
  const rows = await sql<{ daycare_id: string; file_ref: string | null; person_name: string }>`
    select daycare_id, file_ref, person_name
    from background_check_records
    where id = ${input.recordId.trim()}
    limit 1
  `;
  const row = rows[0];
  if (!row?.file_ref) throw new Error("File not found");
  const role = await loadCentreRole(sql, input.userId, row.daycare_id);
  if (!canViewBackgroundCheckRecords(role)) throw new Error(DENIED);
  const { loadPrivateDoc } = await import("@/lib/server/private-docs");
  const doc = await loadPrivateDoc(row.file_ref, null, "background-check-copy");
  return doc;
}

async function parentIsConnected(sql: Sql, userId: string, daycareId: string): Promise<boolean> {
  const rows = await sql<{ ok: number }>`
    select 1 as ok
    where exists (
      select 1 from bookings b where b.user_id = ${userId} and b.daycare_id = ${daycareId}
    ) or exists (
      select 1 from conversations c where c.user_id = ${userId} and c.daycare_id = ${daycareId}
    ) or exists (
      select 1 from waitlist_interests w where w.user_id = ${userId} and w.daycare_id = ${daycareId}
    ) or exists (
      select 1 from tour_requests t where t.user_id = ${userId} and t.daycare_id = ${daycareId}
    )
    limit 1
  `;
  return rows.length > 0;
}

export const loadPublicBackgroundCheckLine = createServerFn({ method: "GET" })
  .middleware([sessionBearerMiddleware])
  .validator((daycareId: string) => String(daycareId || "").trim())
  .handler(async ({ data: daycareId, context }) => {
      if (!backgroundCheckAttestationEnabled() || !daycareId) {
      return { show: false as const, lineEn: null, lineFr: null, expiryStatus: null };
    }
    try {
      const sql = await getSql();
      const rows = await sql<{
        province: string;
        bg_check_attest: number | boolean | null;
        bg_check_attest_at: string | Date | null;
        bg_check_show_expiry: number | boolean | null;
        bg_check_policy_months: number | null;
      }>`
        select province, bg_check_attest, bg_check_attest_at, bg_check_show_expiry, bg_check_policy_months
        from daycares
        where id = ${daycareId}
        limit 1
      `;
      const row = rows[0];
      const on = row?.bg_check_attest === 1 || row?.bg_check_attest === true;
      if (!row || !on) return { show: false as const, lineEn: null, lineFr: null, expiryStatus: null };
      const province = (row.province || "").trim().toUpperCase();
      const when = stamp(row.bg_check_attest_at);
      const formatted = when
        ? new Date(when).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })
        : "";
      if (!formatted || !isBgProvince(province) || !jurisdictionByCode(province)) {
        return { show: false as const, lineEn: null, lineFr: null, expiryStatus: null };
      }
      const { getSessionUser } = await import("@/lib/auth/verify.server");
      const user = await getSessionUser(context.bearerToken).catch(() => null);
      let expiryStatus: "expired" | "due_soon" | "current" | null = null;
      const showExpiry = row.bg_check_show_expiry === 1 || row.bg_check_show_expiry === true;
      if (user && showExpiry && (await parentIsConnected(sql, user.id, daycareId))) {
        const records = await sql<RecordRow>`
          select id, person_name, role, check_kind, issued_on, expires_on, reviewed_name, reviewed_at, file_ref
          from background_check_records
          where daycare_id = ${daycareId}
        `;
        const policyMonths = validPolicyMonths(row.bg_check_policy_months);
        const statuses = records
          .map((item) => (isBgCheckKind(item.check_kind) ? backgroundCheckReminder({
            province,
            kind: item.check_kind,
            issuedOn: day(item.issued_on),
            expiresOn: day(item.expires_on),
            policyMonths,
            today: todayUtc(),
          }).status : null))
          .filter((status): status is ReminderStatus => Boolean(status));
        expiryStatus = aggregateExpiry(statuses);
      }
      return {
        show: true as const,
        province,
        lineEn: attestationLine({ provinceName: provinceName(province, "en"), asOf: formatted, locale: "en" }),
        lineFr: attestationLine({
          provinceName: provinceName(province, "fr"),
          asOf: new Date(when!).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" }),
          locale: "fr",
        }),
        expiryStatus,
      };
    } catch {
      return { show: false as const, lineEn: null, lineFr: null, expiryStatus: null };
    }
  });
