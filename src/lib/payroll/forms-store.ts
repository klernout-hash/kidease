/**
 * Database side of staff forms. Access rules live in each query:
 * - the person linked to the login fills in their own forms;
 * - the owner or a payroll editor reviews and approves;
 * - only the owner can open a full bank number, and each time is logged.
 * Approving a tax form updates the person's claim in the same statement.
 */

import type { Rows } from "./pay-store.ts";
import { schemaHas } from "./pay-store.ts";
import { readTaxAnswers, type TaxAnswers } from "./tax-forms.ts";

const OWNER = `exists (select 1 from provider_daycares o where o.user_id = $1 and o.daycare_id = $2)`;
const EDITOR = `(${OWNER} or exists (select 1 from payroll_editors pe where pe.user_id = $1 and pe.daycare_id = $2))`;

function ymd(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

export type FormRow = {
  id: string;
  employeeId: string;
  name: string;
  province: string;
  kind: string;
  version: number;
  status: "pending" | "approved";
  savedOn: string;
  approvedOn: string | null;
  bankLast4: string | null;
  tax: TaxAnswers | null;
  contact: { contactName: string; contactPhone: string; relation: string } | null;
  /** Slip details: legal name and the last 3 digits of the SIN. Never the full SIN. */
  slip: { name: string; sinLast3: string | null } | null;
};

type RawForm = {
  id: string;
  employee_id: string;
  display_name: string;
  province: string;
  kind: string;
  version: number;
  status: string;
  saved_on: unknown;
  approved_at: unknown;
  bank_last4: string | null;
  answers_json: string;
};

function toForm(row: RawForm): FormRow {
  let contact: FormRow["contact"] = null;
  if (row.kind === "emergency") {
    try {
      const value = JSON.parse(row.answers_json) as Record<string, unknown>;
      contact = { contactName: String(value.contactName ?? ""), contactPhone: String(value.contactPhone ?? ""), relation: String(value.relation ?? "") };
    } catch {
      contact = null;
    }
  }
  let slip: FormRow["slip"] = null;
  if (row.kind === "slip_info") {
    try {
      const value = JSON.parse(row.answers_json) as Record<string, unknown>;
      slip = {
        name: `${String(value.firstName ?? "")} ${String(value.lastName ?? "")}`.trim(),
        sinLast3: row.bank_last4 && /^\d{3}$/.test(row.bank_last4) ? row.bank_last4 : null,
      };
    } catch {
      slip = { name: "", sinLast3: null };
    }
  }
  return {
    slip,
    id: row.id,
    employeeId: row.employee_id,
    name: row.display_name,
    province: row.province,
    kind: row.kind,
    version: Number(row.version) || 1,
    status: row.status === "approved" ? "approved" : "pending",
    savedOn: ymd(row.saved_on),
    approvedOn: row.approved_at ? ymd(row.approved_at) : null,
    bankLast4: row.bank_last4 && /^\d{4}$/.test(row.bank_last4) ? row.bank_last4 : null,
    tax: ["td1_federal", "td1_provincial", "tp1015"].includes(row.kind) ? readTaxAnswers(row.answers_json) : null,
    contact,
  };
}

const FORM_COLUMNS = `f.id, f.employee_id, e.display_name, e.province, f.kind, f.version, f.status, f.saved_on, f.approved_at, f.bank_last4, f.answers_json`;

/** My pay record at this centre and my latest form of each kind. */
export async function myForms(sql: Rows, userId: string, daycareId: string): Promise<{ employeeId: string; name: string; province: string; forms: FormRow[] } | null> {
  const people = await sql.query<{ id: string; display_name: string; province: string }>(
    `select e.id, e.display_name, e.province from payroll_employees e where e.daycare_id = $2 and e.user_id = $1 order by e.id limit 1`,
    [userId, daycareId],
  );
  const person = people[0];
  if (!person) return null;
  const rows = await sql.query<RawForm>(
    `select distinct on (f.kind) ${FORM_COLUMNS}
     from payroll_employee_forms f
     join payroll_employees e on e.id = f.employee_id and e.daycare_id = f.daycare_id
     where f.daycare_id = $2 and e.user_id = $1
     order by f.kind, f.version desc`,
    [userId, daycareId],
  );
  return { employeeId: person.id, name: person.display_name, province: person.province, forms: rows.map(toForm) };
}

/** Save a new version of my own form. One statement; only the linked person can write. */
export async function submitForm(
  sql: Rows,
  input: { id: string; userId: string; daycareId: string; kind: string; answersJson: string; bankCipher: string | null; bankLast4: string | null; savedOn: string },
): Promise<{ id: string; version: number } | null> {
  const rows = await sql.query<{ id: string; version: number }>(
    `insert into payroll_employee_forms (id, daycare_id, employee_id, user_id, kind, version, status, answers_json, bank_cipher, bank_last4, saved_on)
     select $3, e.daycare_id, e.id, $1, $4,
       coalesce((select max(f.version) from payroll_employee_forms f where f.employee_id = e.id and f.kind = $4), 0) + 1,
       'pending', $5, $6, $7, $8::date
     from payroll_employees e
     where e.daycare_id = $2 and e.user_id = $1
     order by e.id
     limit 1
     returning id, version`,
    [input.userId, input.daycareId, input.id, input.kind, input.answersJson, input.bankCipher, input.bankLast4, input.savedOn],
  );
  return rows[0] ? { id: rows[0].id, version: Number(rows[0].version) } : null;
}

/** Forms for the owner or a payroll editor: everything pending, then recent approvals. */
export async function reviewForms(sql: Rows, userId: string, daycareId: string): Promise<FormRow[]> {
  const rows = await sql.query<RawForm>(
    `select ${FORM_COLUMNS}
     from payroll_employee_forms f
     join payroll_employees e on e.id = f.employee_id and e.daycare_id = f.daycare_id
     where f.daycare_id = $2 and ${EDITOR}
     order by (f.status = 'pending') desc, f.created_at desc
     limit 200`,
    [userId, daycareId],
  );
  return rows.map(toForm);
}

/** One form, for the owner, a payroll editor, or the person it belongs to. */
export async function readForm(sql: Rows, userId: string, daycareId: string, formId: string): Promise<(FormRow & { centre: string }) | null> {
  const rows = await sql.query<RawForm & { centre: string | null }>(
    `select ${FORM_COLUMNS}, d.name as centre
     from payroll_employee_forms f
     join payroll_employees e on e.id = f.employee_id and e.daycare_id = f.daycare_id
     left join daycares d on d.id = f.daycare_id
     where f.daycare_id = $2 and f.id = $3 and (${EDITOR} or e.user_id = $1)`,
    [userId, daycareId, formId],
  );
  return rows[0] ? { ...toForm(rows[0]), centre: rows[0].centre ?? "" } : null;
}

/**
 * Approve a pending form. For a tax form, the claim state and cents go onto
 * the person's pay record in the same statement, and td1_status follows.
 */
export async function approveForm(
  sql: Rows,
  input: { userId: string; daycareId: string; formId: string; claimState: string | null; claimCents: number },
): Promise<boolean> {
  const withClaims = await schemaHas(sql, "payroll_employees", "td1_federal_state");
  if (!withClaims || input.claimState == null) {
    const rows = await sql.query<{ id: string }>(
      `update payroll_employee_forms f set status = 'approved', approved_by = $1, approved_at = now()
       where f.id = $3 and f.daycare_id = $2 and f.status = 'pending' and ${EDITOR}
       returning f.id`,
      [input.userId, input.daycareId, input.formId],
    );
    return rows.length === 1;
  }
  const fed = `case when f.kind = 'td1_federal' then $4 else e.td1_federal_state end`;
  const prov = `case when f.kind in ('td1_provincial', 'tp1015') then $4 else e.td1_provincial_state end`;
  const rows = await sql.query<{ n: number }>(
    `with f as (
       update payroll_employee_forms pf set status = 'approved', approved_by = $1, approved_at = now()
       where pf.id = $3 and pf.daycare_id = $2 and pf.status = 'pending' and ${EDITOR}
       returning pf.employee_id, pf.kind
     ),
     person as (
       update payroll_employees e set
         td1_federal_state = ${fed},
         td1_federal_cents = case when f.kind = 'td1_federal' then $5 else e.td1_federal_cents end,
         td1_provincial_state = ${prov},
         td1_provincial_cents = case when f.kind in ('td1_provincial', 'tp1015') then $5 else e.td1_provincial_cents end,
         td1_status = case when ${fed} <> 'missing' and ${prov} <> 'missing' then 'approved' else 'pending' end
       from f
       where e.id = f.employee_id and e.daycare_id = $2
       returning e.id
     )
     select (select count(*) from f)::int as n, (select count(*) from person)::int as people`,
    [input.userId, input.daycareId, input.formId, input.claimState, input.claimCents],
  );
  return rows[0]?.n === 1;
}

/**
 * Owner only: return the sealed bank details of a deposit form and log who
 * opened it. The log row and the read are one statement.
 */
export async function revealBank(sql: Rows, input: { id: string; userId: string; daycareId: string; formId: string }): Promise<string | null> {
  const rows = await sql.query<{ bank_cipher: string | null }>(
    `with f as (
       select pf.id, pf.employee_id, pf.bank_cipher from payroll_employee_forms pf
       where pf.id = $3 and pf.daycare_id = $2 and pf.kind = 'deposit' and pf.bank_cipher is not null and ${OWNER}
     ),
     logged as (
       insert into payroll_bank_reveals (id, daycare_id, employee_id, form_id, actor_id)
       select $4, $2, f.employee_id, f.id, $1 from f
       returning form_id
     )
     select f.bank_cipher from f join logged on logged.form_id = f.id`,
    [input.userId, input.daycareId, input.formId, input.id],
  );
  return rows[0]?.bank_cipher ?? null;
}
