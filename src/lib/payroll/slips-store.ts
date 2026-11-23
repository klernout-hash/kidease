/**
 * Database side of year-end slip files. Owner only for SINs and downloads.
 * Needs migration 0230 for employer slip details; without it, nothing is shown.
 */

import type { Rows } from "./pay-store.ts";
import { schemaHas } from "./pay-store.ts";
import type { SlipEmployer } from "./slip-xml.ts";

const OWNER = `exists (select 1 from provider_daycares o where o.user_id = $1 and o.daycare_id = $2)`;
const EDITOR = `(${OWNER} or exists (select 1 from payroll_editors pe where pe.user_id = $1 and pe.daycare_id = $2))`;

export const EMPTY_EMPLOYER: SlipEmployer = {
  name: "",
  businessNumber: "",
  addrLine: "",
  city: "",
  provCd: "",
  postalCd: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  dentalCode: "",
  rqId: "",
  rqNp: "",
  rqCert: "",
};

type SettingsRow = {
  employer_name: string;
  business_number: string;
  addr_line: string;
  city: string;
  prov_cd: string;
  postal_cd: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  dental_code: string;
  rq_id: string;
  rq_np: string;
  rq_cert: string;
};

export async function slipsReady(sql: Rows): Promise<boolean> {
  return (await schemaHas(sql, "payroll_slip_settings")) && (await schemaHas(sql, "payroll_slip_exports"));
}

/** Employer details for slips. Owner or payroll editor. */
export async function loadSlipEmployer(sql: Rows, userId: string, daycareId: string): Promise<SlipEmployer> {
  if (!(await slipsReady(sql))) return EMPTY_EMPLOYER;
  const rows = await sql.query<SettingsRow>(
    `select employer_name, business_number, addr_line, city, prov_cd, postal_cd, contact_name, contact_phone, contact_email,
       dental_code, rq_id, rq_np, rq_cert
     from payroll_slip_settings s where s.daycare_id = $2 and ${EDITOR}`,
    [userId, daycareId],
  );
  const row = rows[0];
  if (!row) return EMPTY_EMPLOYER;
  return {
    name: row.employer_name,
    businessNumber: row.business_number,
    addrLine: row.addr_line,
    city: row.city,
    provCd: row.prov_cd,
    postalCd: row.postal_cd,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    dentalCode: row.dental_code,
    rqId: row.rq_id,
    rqNp: row.rq_np,
    rqCert: row.rq_cert,
  };
}

export async function saveSlipEmployer(sql: Rows, userId: string, daycareId: string, value: SlipEmployer): Promise<boolean> {
  if (!(await slipsReady(sql))) return false;
  const rows = await sql.query<{ daycare_id: string }>(
    `insert into payroll_slip_settings
       (daycare_id, employer_name, business_number, addr_line, city, prov_cd, postal_cd, contact_name, contact_phone, contact_email,
        dental_code, rq_id, rq_np, rq_cert, updated_by, updated_at)
     select $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $1, now() where ${EDITOR}
     on conflict (daycare_id) do update set
       employer_name = excluded.employer_name, business_number = excluded.business_number, addr_line = excluded.addr_line,
       city = excluded.city, prov_cd = excluded.prov_cd, postal_cd = excluded.postal_cd, contact_name = excluded.contact_name,
       contact_phone = excluded.contact_phone, contact_email = excluded.contact_email, dental_code = excluded.dental_code,
       rq_id = excluded.rq_id, rq_np = excluded.rq_np, rq_cert = excluded.rq_cert,
       updated_by = excluded.updated_by, updated_at = now()
     returning daycare_id`,
    [
      userId,
      daycareId,
      value.name,
      value.businessNumber,
      value.addrLine,
      value.city,
      value.provCd,
      value.postalCd,
      value.contactName,
      value.contactPhone,
      value.contactEmail,
      value.dentalCode,
      value.rqId,
      value.rqNp,
      value.rqCert,
    ],
  );
  return rows.length === 1;
}

export type SlipPersonRow = {
  personId: string;
  displayName: string;
  cppExempt: boolean;
  eiExempt: boolean;
  /** Latest approved slip details (no SIN), or null. */
  answersJson: string | null;
  /** Sealed SIN from the same form. Opened only on the server. */
  sinCipher: string | null;
};

/** Everyone on the pay list with their latest approved slip details. Owner only. */
export async function loadSlipPeople(sql: Rows, userId: string, daycareId: string): Promise<SlipPersonRow[]> {
  const rows = await sql.query<{ id: string; display_name: string; cpp_exempt: boolean; ei_exempt: boolean; answers_json: string | null; bank_cipher: string | null }>(
    `select e.id, e.display_name, e.cpp_exempt, e.ei_exempt, f.answers_json, f.bank_cipher
     from payroll_employees e
     left join lateral (
       select pf.answers_json, pf.bank_cipher from payroll_employee_forms pf
       where pf.employee_id = e.id and pf.daycare_id = e.daycare_id and pf.kind = 'slip_info' and pf.status = 'approved'
       order by pf.version desc limit 1
     ) f on true
     where e.daycare_id = $2 and ${OWNER}
     order by e.display_name, e.id`,
    [userId, daycareId],
  );
  return rows.map((row) => ({
    personId: row.id,
    displayName: row.display_name,
    cppExempt: row.cpp_exempt === true,
    eiExempt: row.ei_exempt === true,
    answersJson: row.answers_json,
    sinCipher: row.bank_cipher,
  }));
}

/** Log a slip download. Owner only; returns false when the caller is not the owner. */
export async function logSlipExport(sql: Rows, input: { id: string; userId: string; daycareId: string; year: number; kinds: string; people: number }): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(
    `insert into payroll_slip_exports (id, daycare_id, actor_id, tax_year, kinds, people)
     select $3, $2, $1, $4, $5, $6 where ${OWNER}
     returning id`,
    [input.userId, input.daycareId, input.id, input.year, input.kinds, input.people],
  );
  return rows.length === 1;
}
