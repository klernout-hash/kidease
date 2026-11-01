/**
 * Shared server helpers for compliance tools.
 * Logs never include a child name, email, phone, or secret.
 */

import { getSql, type Sql } from "@/lib/db";
import { homeProvince, redactLog, type ProvinceCode } from "@/lib/compliance/mode";
import { transactionalMailFrom } from "@/lib/mail-from";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";

export type Scope = {
  role: string;
  govProvince: string | null;
  orgProvince: string | null;
  province: ProvinceCode | null;
};

export async function readScope(userId: string): Promise<Scope | null> {
  const sql = await getSql();
  const rows = await sql<{ role: string | null; gov_province: string | null; org_province: string | null }>`
    select p.role, p.gov_province, o.province as org_province
    from profiles p
    left join government_members m on m.user_id = p.user_id and m.status = 'active'
    left join government_orgs o on o.id = m.org_id
    where p.user_id = ${userId}
    limit 1
  `.catch(() => []);
  const row = rows[0];
  if (!row?.role) return null;
  return {
    role: row.role,
    govProvince: row.gov_province,
    orgProvince: row.org_province,
    province: homeProvince(row.gov_province, row.org_province),
  };
}

export function logPractice(flag: string, payload: Record<string, unknown>) {
  console.info(`[${flag}]`, redactLog(payload));
}

export async function caslSmsGranted(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { evaluateCaslSend } = await import("@/lib/server/casl-consent");
  const decision = await evaluateCaslSend({ userId, channel: "sms", purpose: "service" });
  return decision.ok;
}

export async function ownedCentreIds(userId: string): Promise<string[]> {
  const sql = await getSql();
  return listAccessibleDaycareIds(sql, userId);
}

export async function centreRow(sql: Sql, daycareId: string) {
  const rows = await sql<{
    id: string;
    name: string;
    province: string;
    city: string;
    postal_code: string;
    contact_email: string | null;
  }>`
    select id, name, province, city, postal_code, contact_email
    from daycares
    where id = ${daycareId}
    limit 1
  `.catch(() => []);
  return rows[0] ?? null;
}

/** Live email. No API key is logged. Missing mail config does not throw. */
export async function sendComplianceEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<"sent" | "logged_no_mailer" | "failed"> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return "logged_no_mailer";
  const to = input.to.trim();
  if (!to.includes("@")) return "failed";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: transactionalMailFrom(),
        to: [to],
        subject: input.subject.slice(0, 140),
        text: input.text.slice(0, 2000),
      }),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export async function sendComplianceSms(input: {
  to: string;
  body: string;
  consentGranted: boolean;
}): Promise<"sent" | "skipped" | "failed"> {
  if (!input.consentGranted) return "skipped";
  const { sendSms } = await import("@/lib/server/sms");
  const result = await sendSms({
    to: input.to,
    body: input.body,
    consentGranted: true,
    audience: "user",
  });
  if (result.ok) return "sent";
  if (result.skipped) return "skipped";
  return "failed";
}

export async function sqlClient(): Promise<Sql> {
  return getSql();
}
