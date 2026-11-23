/**
 * Database reads and writes for pay day. Every query carries the access rule
 * in its own WHERE clause (owner of the centre, or a payroll editor the owner
 * named), so a skipped check in a caller cannot leak another centre's pay.
 *
 * Each change is one SQL statement, so it is one transaction: the guard, the
 * change row (with who, when, old, new, reason), and the stale-edit check
 * happen together or not at all.
 */

import { dayRows, type Adjustment, type DayFlag, type DayRow, type Punch } from "./hours-adjust.ts";
import type { PayPerson, PayType } from "./pay-card.ts";
import { parseStub, type ApprovedStub } from "./stubs.ts";
import { engineClaim, td1Status } from "./tax-forms.ts";
import { isProvinceCode } from "./tables.ts";

export type Rows = {
  query<T>(text: string, params: unknown[]): Promise<T[]>;
};

const OWNER = `exists (select 1 from provider_daycares o where o.user_id = $1 and o.daycare_id = $2)`;
const EDITOR = `(${OWNER} or exists (select 1 from payroll_editors pe where pe.user_id = $1 and pe.daycare_id = $2))`;

function ymd(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function iso(value: unknown): string {
  return new Date(value as string).toISOString();
}

const schemaCache = new WeakMap<object, Set<string>>();

/**
 * True when a table or column from a newer migration exists. New features
 * stay off (and old ones keep working) until the migration is applied.
 */
export async function schemaHas(sql: Rows, table: string, column?: string): Promise<boolean> {
  const key = `${table}.${column ?? ""}`;
  const known = schemaCache.get(sql) ?? new Set<string>();
  if (known.has(key)) return true;
  const rows = column
    ? await sql.query<{ ok: boolean }>(
        `select exists (select 1 from information_schema.columns where table_name = $1 and column_name = $2) as ok`,
        [table, column],
      )
    : await sql.query<{ ok: boolean }>(`select to_regclass($1) is not null as ok`, [table]);
  const ok = rows[0]?.ok === true;
  // Only "yes" is cached, so a migration applied later is picked up without a restart.
  if (ok) {
    known.add(key);
    schemaCache.set(sql, known);
  }
  return ok;
}

export async function payAccess(sql: Rows, userId: string, daycareId: string): Promise<{ owner: boolean; editor: boolean }> {
  if (!userId || !daycareId) return { owner: false, editor: false };
  const rows = await sql.query<{ owner: boolean; editor: boolean }>(`select ${OWNER} as owner, ${EDITOR} as editor`, [userId, daycareId]);
  return { owner: rows[0]?.owner === true, editor: rows[0]?.editor === true };
}

type EmployeeRow = {
  id: string;
  display_name: string;
  province: string;
  pay_type: string;
  worker_type: string | null;
  rate_cents: number;
  pay_frequency: string;
  vacation_bps: number;
  vacation_mode: string;
  td1_federal_cents: number;
  td1_provincial_cents: number;
  td1_status: string | null;
  cpp_exempt: boolean;
  ei_exempt: boolean;
  extra_tax_cents: number | null;
  hire_date: unknown;
  end_date: unknown;
  contractor_basis: string | null;
  gst_registered: boolean | null;
  gst_number: string | null;
  wage_class: string | null;
  td1_federal_state: string | null;
  td1_provincial_state: string | null;
};

function toPerson(row: EmployeeRow): PayPerson | null {
  if (!isProvinceCode(row.province)) return null;
  const payType: PayType = row.worker_type === "contractor" ? "contractor" : row.pay_type === "salary" ? "salary" : "hourly";
  const frequency = ["weekly", "biweekly", "semimonthly", "monthly"].includes(row.pay_frequency)
    ? (row.pay_frequency as PayPerson["frequency"])
    : "biweekly";
  // Approved forms set td1_*_state (migration 0229). Before that, only a legacy "approved" status counts.
  const fromForms = row.td1_federal_state != null || row.td1_provincial_state != null;
  const legacy = !fromForms && row.td1_status === "approved";
  const td1 = legacy ? "approved" : td1Status(row.td1_federal_state, row.td1_provincial_state);
  return {
    id: row.id,
    name: row.display_name,
    province: row.province,
    payType,
    rateCents: Math.max(0, Number(row.rate_cents) || 0),
    frequency,
    vacationBps: Math.max(0, Number(row.vacation_bps) || 0),
    vacationMode: row.vacation_mode === "bank" ? "bank" : "payout",
    hireDate: row.hire_date ? ymd(row.hire_date) : null,
    endDate: row.end_date ? ymd(row.end_date) : null,
    td1,
    td1FederalCents: legacy ? Number(row.td1_federal_cents) : engineClaim(row.td1_federal_state, Number(row.td1_federal_cents)),
    td1ProvincialCents: legacy ? Number(row.td1_provincial_cents) : engineClaim(row.td1_provincial_state, Number(row.td1_provincial_cents)),
    cppExempt: row.cpp_exempt === true,
    eiExempt: row.ei_exempt === true,
    extraTaxCents: Number(row.extra_tax_cents) || 0,
    // payroll_employees.extra_tax_cents is written only by the owner's approval.
    extraTaxApproved: (Number(row.extra_tax_cents) || 0) > 0,
    contractorBasis: row.contractor_basis === "base" ? "base" : "flat",
    gstRegistered: row.gst_registered === true,
    gstNumber: row.gst_number,
    wageClass: row.wage_class === "student" ? "student" : row.wage_class === "tipped" ? "tipped" : "general",
  };
}

const EMPLOYEE_COLUMNS = `e.id, e.display_name, e.province, e.pay_type, e.worker_type, e.rate_cents, e.pay_frequency,
  e.vacation_bps, e.vacation_mode, e.td1_federal_cents, e.td1_provincial_cents, e.td1_status, e.cpp_exempt, e.ei_exempt,
  e.extra_tax_cents, e.hire_date, e.end_date, e.contractor_basis, e.gst_registered, e.gst_number, e.wage_class,
  to_jsonb(e) ->> 'td1_federal_state' as td1_federal_state, to_jsonb(e) ->> 'td1_provincial_state' as td1_provincial_state`;

/** Everyone on the centre's pay list, for the staff picker. Owner or payroll editor only. */
export async function loadPeople(sql: Rows, userId: string, daycareId: string): Promise<PayPerson[]> {
  const rows = await sql.query<EmployeeRow>(
    `select ${EMPLOYEE_COLUMNS}
     from payroll_employees e
     where e.daycare_id = $2 and ${EDITOR}
     order by e.display_name, e.id`,
    [userId, daycareId],
  );
  return rows.map(toPerson).filter((row): row is PayPerson => row != null);
}

type PunchRow = { id: string; employee_id: string; clock_in_at: unknown; clock_out_at: unknown; unpaid_break_minutes: number };
type OverrideRow = {
  id: string;
  field: string;
  work_date: unknown;
  period_start: unknown;
  old_value: string;
  new_value: string;
  reason: string;
  actor_id: string;
  created_at: unknown;
};

export type PayDesk = {
  person: PayPerson;
  days: DayRow[];
  /** Latest change id per day and per rate/pay-type field: the stale-edit guard token. */
  dayTokens: Record<string, string>;
  rateToken: string;
  payTypeToken: string;
  rateOverride: number | null;
  payTypeOverride: PayType | null;
  bonusToken: string;
  bonusOverride: number | null;
  /** Bonuses on approved stubs earlier this year. */
  ytdBonusCents: number;
  history: { field: string; date: string; oldValue: string; newValue: string; reason: string; actorId: string; at: string }[];
  lockedThrough: string | null;
  ytdStubs: ApprovedStub[];
  /** Changes to days in approved periods that have not been paid yet. */
  corrections: CorrectionLine[];
};

export type CorrectionLine = {
  forPeriodId: string;
  forPeriodStart: string;
  forPeriodEnd: string;
  date: string;
  deltaMinutes: number;
  rateCents: number;
  cents: number;
};

/**
 * One person's days, changes, and year-to-date stubs for a pay period.
 * `selfOnly` loads the person linked to `userId` instead (staff own hours).
 */
export async function loadDesk(
  sql: Rows,
  input: { userId: string; daycareId: string; employeeId: string; from: string; to: string; now: Date; selfOnly?: boolean },
): Promise<PayDesk | null> {
  const who = input.selfOnly ? `e.user_id = $1` : EDITOR;
  const people = await sql.query<EmployeeRow>(
    `select ${EMPLOYEE_COLUMNS} from payroll_employees e
     where e.daycare_id = $2 and e.id = $3 and ${who}`,
    [input.userId, input.daycareId, input.employeeId],
  );
  const person = people[0] ? toPerson(people[0]) : null;
  if (!person) return null;
  const punches = await sql.query<PunchRow>(
    `select p.id, p.employee_id, p.clock_in_at, p.clock_out_at, p.unpaid_break_minutes
     from payroll_punches p
     where p.daycare_id = $1 and p.employee_id = $2
       and p.clock_in_at >= ($3::date - interval '1 day') and p.clock_in_at < ($4::date + interval '2 day')
     order by p.clock_in_at`,
    [input.daycareId, input.employeeId, input.from, input.to],
  );
  const changes = await sql.query<OverrideRow>(
    `select id, field, work_date, period_start, old_value, new_value, reason, actor_id, created_at
     from payroll_overrides
     where daycare_id = $1 and employee_id = $2
       and ((work_date between $3::date and $4::date) or period_start = $3::date)
     order by created_at, id`,
    [input.daycareId, input.employeeId, input.from, input.to],
  );
  const flags = await sql.query<{ work_date: unknown; note: string; created_at: unknown }>(
    `select work_date, note, created_at from payroll_day_flags
     where daycare_id = $1 and employee_id = $2 and status = 'open' and work_date between $3::date and $4::date`,
    [input.daycareId, input.employeeId, input.from, input.to],
  );
  const locked = await sql.query<{ through: unknown }>(
    `select max(period_end) as through from payroll_periods where daycare_id = $1 and status = 'approved'`,
    [input.daycareId],
  );
  const stubs = await sql.query<{ stub_json: string }>(
    `select stub_json from payroll_stubs
     where daycare_id = $1 and employee_id = $2 and pay_date >= date_trunc('year', $3::date) and pay_date < $3::date
     order by pay_date`,
    [input.daycareId, input.employeeId, input.from],
  );

  const punchList: Punch[] = punches.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    clockIn: iso(row.clock_in_at),
    clockOut: row.clock_out_at ? iso(row.clock_out_at) : null,
    unpaidBreakMinutes: Number(row.unpaid_break_minutes) || 0,
  }));
  const dayChanges = changes.filter((row) => row.field === "day_minutes");
  const adjustments: Adjustment[] = dayChanges.map((row) => ({
    id: row.id,
    employeeId: input.employeeId,
    workDate: ymd(row.work_date),
    minutes: row.new_value === "" ? null : Number(row.new_value),
    reason: row.reason,
    actorId: row.actor_id,
    at: iso(row.created_at),
  }));
  const flagList: DayFlag[] = flags.map((row) => ({ employeeId: input.employeeId, workDate: ymd(row.work_date), note: row.note, at: iso(row.created_at), open: true }));
  const lockedThrough = locked[0]?.through ? ymd(locked[0].through) : null;
  const days = dayRows({ employeeId: input.employeeId, from: input.from, to: input.to, punches: punchList, adjustments, flags: flagList, lockedThrough, now: input.now });
  const dayTokens: Record<string, string> = {};
  for (const row of dayChanges) dayTokens[ymd(row.work_date)] = row.id;
  const lastOf = (field: string) => [...changes].reverse().find((row) => row.field === field);
  const rate = lastOf("rate_cents");
  const payType = lastOf("pay_type");
  const bonus = lastOf("bonus_cents");
  const ytdStubs = stubs.map((row) => parseStub(safeJson(row.stub_json))).filter((row): row is ApprovedStub => row != null);
  return {
    person,
    days,
    dayTokens,
    rateToken: rate?.id ?? "",
    payTypeToken: payType?.id ?? "",
    rateOverride: rate && rate.new_value !== "" ? Number(rate.new_value) : null,
    payTypeOverride: payType && ["hourly", "salary", "contractor"].includes(payType.new_value) ? (payType.new_value as PayType) : null,
    bonusToken: bonus?.id ?? "",
    bonusOverride: bonus && bonus.new_value !== "" && Number(bonus.new_value) > 0 ? Math.round(Number(bonus.new_value)) : null,
    ytdBonusCents: ytdStubs.reduce((sum, row) => sum + row.bonusCents, 0),
    history: input.selfOnly
      ? []
      : changes.map((row) => ({
          field: row.field,
          date: ymd(row.work_date ?? row.period_start),
          oldValue: row.old_value,
          newValue: row.new_value,
          reason: row.reason,
          actorId: row.actor_id,
          at: iso(row.created_at),
        })),
    lockedThrough,
    ytdStubs,
    corrections: input.selfOnly ? [] : await loadCorrections(sql, { daycareId: input.daycareId, employeeId: input.employeeId, now: input.now }),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export type OverrideResult = { ok: true; id: string; correction: boolean } | { ok: false; error: "permission" | "stale" };

/**
 * Save one change. One statement: access check, stale-edit check (the
 * latest change must still be `expectedId`), correction flag for locked
 * periods, and the append-only row with old and new values.
 */
export async function saveOverride(
  sql: Rows,
  input: {
    id: string;
    userId: string;
    daycareId: string;
    employeeId: string;
    field: "day_minutes" | "rate_cents" | "pay_type" | "bonus_cents";
    /** work_date for day_minutes, the period start for rate and pay type. */
    keyDate: string;
    oldValue: string;
    newValue: string;
    reason: string;
    expectedId: string;
  },
): Promise<OverrideResult> {
  let rows: { id: string; correction: boolean }[];
  try {
    rows = await sql.query<{ id: string; correction: boolean }>(
      `with latest as (
         select id from payroll_overrides
         where daycare_id = $2 and employee_id = $3 and field = $4
           and coalesce(work_date, period_start) = $5::date
         order by created_at desc, id desc
         limit 1
       ),
       allowed as (
         select 1 as ok from payroll_employees e
         where e.id = $3 and e.daycare_id = $2 and ${EDITOR}
           and coalesce((select id from latest), '') = $10
       )
       insert into payroll_overrides
         (id, daycare_id, employee_id, field, work_date, period_start, old_value, new_value, reason, actor_id, supersedes_id, correction)
       select $6, $2, $3, $4,
         case when $4 = 'day_minutes' then $5::date end,
         case when $4 = 'day_minutes' then null else $5::date end,
         $7, $8, $9, $1, nullif($10, ''),
         exists (select 1 from payroll_periods pp where pp.daycare_id = $2 and pp.status = 'approved' and $5::date between pp.period_start and pp.period_end)
       from allowed
       returning id, correction`,
      [input.userId, input.daycareId, input.employeeId, input.field, input.keyDate, input.id, input.oldValue, input.newValue, input.reason, input.expectedId],
    );
  } catch (error) {
    // The chain index refused a second edit built on the same earlier row.
    if (/duplicate key|unique/i.test(String((error as Error)?.message ?? error))) return { ok: false, error: "stale" };
    throw error;
  }
  if (rows[0]) return { ok: true, id: rows[0].id, correction: rows[0].correction === true };
  const access = await payAccess(sql, input.userId, input.daycareId);
  return { ok: false, error: access.editor ? "stale" : "permission" };
}

/** The pay record linked to this login at this centre, if any. */
export async function myEmployeeId(sql: Rows, userId: string, daycareId: string): Promise<string | null> {
  const rows = await sql.query<{ id: string }>(
    `select e.id from payroll_employees e where e.daycare_id = $2 and e.user_id = $1 order by e.id limit 1`,
    [userId, daycareId],
  );
  return rows[0]?.id ?? null;
}

/** Staff flag their own day. One statement; only the person linked to the login can flag. */
export async function saveFlag(
  sql: Rows,
  input: { id: string; userId: string; daycareId: string; employeeId: string; workDate: string; note: string },
): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(
    `insert into payroll_day_flags (id, daycare_id, employee_id, work_date, note, user_id)
     select $1, $2, $3, $4::date, $5, $6
     from payroll_employees e
     where e.id = $3 and e.daycare_id = $2 and e.user_id = $6
     returning id`,
    [input.id, input.daycareId, input.employeeId, input.workDate, input.note, input.userId],
  );
  return rows.length === 1;
}

/** Check in only when there is no open shift. The unique index backs this up. */
export async function checkIn(sql: Rows, input: { id: string; daycareId: string; employeeId: string; actorId: string }): Promise<boolean> {
  try {
    const rows = await sql.query<{ id: string }>(
      `insert into payroll_punches (id, daycare_id, employee_id, clock_in_at, source, created_by)
       select $1, $2, $3, now(), 'phone', $4
       where not exists (select 1 from payroll_punches p where p.employee_id = $3 and p.clock_out_at is null)
       returning id`,
      [input.id, input.daycareId, input.employeeId, input.actorId],
    );
    return rows.length === 1;
  } catch (error) {
    if (/duplicate key|unique/i.test(String((error as Error)?.message ?? error))) return false;
    throw error;
  }
}

/**
 * Corrections owed for days in approved periods: the minutes on file now
 * minus what was paid (the paid day plus corrections already paid), priced
 * at the rate that was paid. Only periods approved after migration 0229 have
 * paid days on record; older periods have no baseline and are skipped.
 */
export async function loadCorrections(sql: Rows, input: { daycareId: string; employeeId: string; now: Date }): Promise<CorrectionLine[]> {
  if (!(await schemaHas(sql, "payroll_paid_days")) || !(await schemaHas(sql, "payroll_correction_lines"))) return [];
  const dates = await sql.query<{ work_date: unknown }>(
    `select distinct o.work_date from payroll_overrides o
     where o.daycare_id = $1 and o.employee_id = $2 and o.correction and o.field = 'day_minutes' and o.work_date is not null`,
    [input.daycareId, input.employeeId],
  );
  if (!dates.length) return [];
  const wanted = dates.map((row) => ymd(row.work_date)).sort();
  const paid = await sql.query<{ work_date: unknown; minutes: number; rate_cents: number; period_id: string; period_start: unknown; period_end: unknown }>(
    `select d.work_date, d.minutes, d.rate_cents, d.period_id, p.period_start, p.period_end
     from payroll_paid_days d join payroll_periods p on p.id = d.period_id
     where d.daycare_id = $1 and d.employee_id = $2 and d.work_date = any(string_to_array($3, ',')::date[])`,
    [input.daycareId, input.employeeId, wanted.join(",")],
  );
  if (!paid.length) return [];
  const already = await sql.query<{ work_date: unknown; delta: number }>(
    `select work_date, sum(delta_minutes)::int as delta from payroll_correction_lines
     where daycare_id = $1 and employee_id = $2 and work_date = any(string_to_array($3, ',')::date[])
     group by work_date`,
    [input.daycareId, input.employeeId, wanted.join(",")],
  );
  const from = wanted[0];
  const to = wanted[wanted.length - 1];
  const punches = await sql.query<PunchRow>(
    `select p.id, p.employee_id, p.clock_in_at, p.clock_out_at, p.unpaid_break_minutes
     from payroll_punches p
     where p.daycare_id = $1 and p.employee_id = $2
       and p.clock_in_at >= ($3::date - interval '1 day') and p.clock_in_at < ($4::date + interval '2 day')`,
    [input.daycareId, input.employeeId, from, to],
  );
  const changes = await sql.query<OverrideRow>(
    `select id, field, work_date, period_start, old_value, new_value, reason, actor_id, created_at
     from payroll_overrides
     where daycare_id = $1 and employee_id = $2 and field = 'day_minutes' and work_date between $3::date and $4::date
     order by created_at, id`,
    [input.daycareId, input.employeeId, from, to],
  );
  const days = dayRows({
    employeeId: input.employeeId,
    from,
    to,
    punches: punches.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      clockIn: iso(row.clock_in_at),
      clockOut: row.clock_out_at ? iso(row.clock_out_at) : null,
      unpaidBreakMinutes: Number(row.unpaid_break_minutes) || 0,
    })),
    adjustments: changes.map((row) => ({
      id: row.id,
      employeeId: input.employeeId,
      workDate: ymd(row.work_date),
      minutes: row.new_value === "" ? null : Number(row.new_value),
      reason: row.reason,
      actorId: row.actor_id,
      at: iso(row.created_at),
    })),
    now: input.now,
  });
  const out: CorrectionLine[] = [];
  for (const row of paid) {
    const date = ymd(row.work_date);
    const now = days.find((day) => day.date === date);
    if (!now) continue;
    const before = Number(row.minutes) + Number(already.find((a) => ymd(a.work_date) === date)?.delta ?? 0);
    const delta = now.minutes - before;
    const rate = Number(row.rate_cents) || 0;
    const cents = Math.round((delta * rate) / 60);
    if (delta === 0 || cents === 0) continue;
    out.push({ forPeriodId: row.period_id, forPeriodStart: ymd(row.period_start), forPeriodEnd: ymd(row.period_end), date, deltaMinutes: delta, rateCents: rate, cents });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export type CentreSettings = {
  remitterType: "regular" | "quarterly" | "accelerated1" | "accelerated2";
  wcbRateBps: number | null;
  yearlyPayrollCents: number | null;
  healthTaxExemption: boolean;
  set: boolean;
};

export const EMPTY_SETTINGS: CentreSettings = { remitterType: "regular", wcbRateBps: null, yearlyPayrollCents: null, healthTaxExemption: true, set: false };

/** Centre pay settings. Owner or payroll editor. Unset values stay null and are never guessed. */
export async function loadSettings(sql: Rows, userId: string, daycareId: string): Promise<CentreSettings> {
  const rows = await sql.query<{ remitter_type: string; wcb_rate_bps: number | null; yearly_payroll_cents: string | number | null; health_tax_exemption: boolean }>(
    `select s.remitter_type, s.wcb_rate_bps, s.yearly_payroll_cents, s.health_tax_exemption
     from payroll_centre_settings s where s.daycare_id = $2 and ${EDITOR}`,
    [userId, daycareId],
  );
  const row = rows[0];
  if (!row) return EMPTY_SETTINGS;
  const remitter = ["regular", "quarterly", "accelerated1", "accelerated2"].includes(row.remitter_type) ? (row.remitter_type as CentreSettings["remitterType"]) : "regular";
  return {
    remitterType: remitter,
    wcbRateBps: row.wcb_rate_bps == null ? null : Number(row.wcb_rate_bps),
    yearlyPayrollCents: row.yearly_payroll_cents == null ? null : Number(row.yearly_payroll_cents),
    healthTaxExemption: row.health_tax_exemption !== false,
    set: true,
  };
}

export async function saveSettings(sql: Rows, userId: string, daycareId: string, value: Omit<CentreSettings, "set">): Promise<boolean> {
  const rows = await sql.query<{ daycare_id: string }>(
    `insert into payroll_centre_settings (daycare_id, remitter_type, wcb_rate_bps, yearly_payroll_cents, health_tax_exemption, updated_by, updated_at)
     select $2, $3, $4, $5, $6, $1, now() where ${EDITOR}
     on conflict (daycare_id) do update set
       remitter_type = excluded.remitter_type,
       wcb_rate_bps = excluded.wcb_rate_bps,
       yearly_payroll_cents = excluded.yearly_payroll_cents,
       health_tax_exemption = excluded.health_tax_exemption,
       updated_by = excluded.updated_by,
       updated_at = now()
     returning daycare_id`,
    [userId, daycareId, value.remitterType, value.wcbRateBps, value.yearlyPayrollCents, value.healthTaxExemption],
  );
  return rows.length === 1;
}

/**
 * Approve a pay period: the period row, every stub, and contractor invoice
 * drafts in one statement. Owner or payroll editor; approved_by records who. A period that was already approved
 * is not approved twice.
 */
export async function approvePeriod(
  sql: Rows,
  input: {
    periodId: string;
    userId: string;
    daycareId: string;
    start: string;
    end: string;
    payDate: string;
    stubs: readonly ApprovedStub[];
    drafts: readonly { id: string; employeeId: string; feeCents: number; salesTaxCents: number }[];
    /** What each day paid (hourly staff), so later changes can be priced. Needs migration 0229. */
    paidDays?: readonly { employeeId: string; date: string; minutes: number; rateCents: number }[];
    /** Corrections paid in this period. Needs migration 0229. */
    corrections?: readonly { id: string; employeeId: string; forPeriodId: string; date: string; deltaMinutes: number; rateCents: number; cents: number }[];
  },
): Promise<{ ok: true; stubs: number } | { ok: false; error: "permission" | "already_approved" }> {
  const tracked = (await schemaHas(sql, "payroll_paid_days")) && (await schemaHas(sql, "payroll_correction_lines"));
  const extra = tracked
    ? `,
     pd as (
       insert into payroll_paid_days (period_id, daycare_id, employee_id, work_date, minutes, rate_cents)
       select (select id from p), $2, x->>'employeeId', (x->>'date')::date, (x->>'minutes')::int, (x->>'rateCents')::int
       from json_array_elements($9::json) x
       where exists (select 1 from p)
       returning employee_id
     ),
     cl as (
       insert into payroll_correction_lines (id, period_id, for_period_id, daycare_id, employee_id, work_date, delta_minutes, rate_cents, cents)
       select x->>'id', (select id from p), x->>'forPeriodId', $2, x->>'employeeId', (x->>'date')::date,
         (x->>'deltaMinutes')::int, (x->>'rateCents')::int, (x->>'cents')::int
       from json_array_elements($10::json) x
       where exists (select 1 from p)
       returning id
     )`
    : "";
  const rows = await sql.query<{ periods: number; stubs: number }>(
    `with allowed as (select 1 as ok where ${EDITOR}),
     p as (
       insert into payroll_periods (id, daycare_id, period_start, period_end, pay_date, status, approved_by)
       select $3, $2, $4::date, $5::date, $6::date, 'approved', $1 from allowed
       on conflict do nothing
       returning id
     ),
     s as (
       insert into payroll_stubs (id, period_id, daycare_id, employee_id, pay_date, stub_json)
       select x->>'id', (select id from p), $2, x->>'personId', $6::date, x::text
       from json_array_elements($7::json) x
       where exists (select 1 from p)
       returning id
     ),
     d as (
       insert into payroll_contractor_drafts (id, daycare_id, employee_id, period_id, fee_cents, sales_tax_cents, status, created_by)
       select x->>'id', $2, x->>'employeeId', (select id from p), (x->>'feeCents')::int, (x->>'salesTaxCents')::int, 'draft', $1
       from json_array_elements($8::json) x
       where exists (select 1 from p)
       returning id
     )${extra}
     select (select count(*) from p)::int as periods, (select count(*) from s)::int as stubs`,
    [
      input.userId,
      input.daycareId,
      input.periodId,
      input.start,
      input.end,
      input.payDate,
      JSON.stringify(input.stubs),
      JSON.stringify(input.drafts),
      ...(tracked ? [JSON.stringify(input.paidDays ?? []), JSON.stringify(input.corrections ?? [])] : []),
    ],
  );
  if (rows[0]?.periods === 1) return { ok: true, stubs: rows[0].stubs };
  const access = await payAccess(sql, input.userId, input.daycareId);
  return { ok: false, error: access.editor ? "already_approved" : "permission" };
}

/** Approved stubs between two pay dates. Owner or payroll editor. */
export async function loadStubs(sql: Rows, input: { userId: string; daycareId: string; from: string; to: string }): Promise<ApprovedStub[]> {
  const rows = await sql.query<{ stub_json: string }>(
    `select s.stub_json from payroll_stubs s
     where s.daycare_id = $2 and ${EDITOR} and s.pay_date between $3::date and $4::date
     order by s.pay_date, s.id`,
    [input.userId, input.daycareId, input.from, input.to],
  );
  return rows.map((row) => parseStub(safeJson(row.stub_json))).filter((row): row is ApprovedStub => row != null);
}

/**
 * Mark a person as student, tipped, or general for minimum wage. One statement:
 * the access check, the person update, and the audit row (old, new, who, reason).
 */
export async function setWageClass(
  sql: Rows,
  input: { id: string; userId: string; daycareId: string; employeeId: string; wageClass: "general" | "student" | "tipped"; reason: string; today: string },
): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(
    `with target as (
       select e.id, e.wage_class from payroll_employees e
       where e.id = $3 and e.daycare_id = $2 and ${EDITOR}
     ),
     changed as (
       update payroll_employees set wage_class = $4
       where id = (select id from target) and daycare_id = $2
       returning id
     )
     insert into payroll_overrides (id, daycare_id, employee_id, field, period_start, old_value, new_value, reason, actor_id, supersedes_id)
     select $5, $2, $3, 'wage_class', $7::date, (select wage_class from target), $4, $6, $1, $5
     from changed
     returning id`,
    [input.userId, input.daycareId, input.employeeId, input.wageClass, input.id, input.reason, input.today],
  );
  return rows.length === 1;
}

export type EditorRow = { userId: string; name: string; editor: boolean };

/** Active team members and whether each has pay access. Owner only. */
export async function listEditors(sql: Rows, userId: string, daycareId: string): Promise<EditorRow[]> {
  const rows = await sql.query<{ user_id: string; name: string | null; editor: boolean }>(
    `select m.user_id, coalesce(nullif(u.name, ''), u.email, m.user_id) as name,
       exists (select 1 from payroll_editors pe where pe.daycare_id = m.daycare_id and pe.user_id = m.user_id) as editor
     from centre_members m
     left join "user" u on u.id = m.user_id
     where m.daycare_id = $2 and m.status = 'active' and m.role <> 'owner' and ${OWNER}
     order by 2, 1`,
    [userId, daycareId],
  );
  return rows.map((row) => ({ userId: row.user_id, name: row.name ?? row.user_id, editor: row.editor === true }));
}

/** Give or remove pay access, with an audit row, in one statement. Owner only; the person must be an active member. */
export async function setEditor(
  sql: Rows,
  input: { id: string; userId: string; daycareId: string; memberId: string; grant: boolean },
): Promise<boolean> {
  const change = input.grant
    ? `insert into payroll_editors (daycare_id, user_id, granted_by)
       select $2, $3, $1 where ${OWNER}
         and exists (select 1 from centre_members m where m.daycare_id = $2 and m.user_id = $3 and m.status = 'active')
       on conflict do nothing
       returning user_id`
    : `delete from payroll_editors where daycare_id = $2 and user_id = $3 and ${OWNER}
       returning user_id`;
  const rows = await sql.query<{ user_id: string }>(
    `with changed as (${change})
     insert into payroll_editor_audits (id, daycare_id, user_id, action, actor_id)
     select $4, $2, $3, $5, $1 from changed
     returning id`,
    [input.userId, input.daycareId, input.memberId, input.id, input.grant ? "grant" : "remove"],
  );
  return rows.length === 1;
}
