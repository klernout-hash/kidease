/**
 * Pay day server gate. Owner for pay and books. Staff for their own clock.
 * Notices are planned and logged. Nothing is emailed, pushed, or texted.
 */

import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { decideClock, decidePayBooks, staffHoursView } from "@/lib/payroll/access.ts";
import { sandboxAdapter } from "@/lib/payroll/adapter.ts";
import { deliverPayrollNotice, planDeadlineNotices, payrollAttentionFacts } from "@/lib/payroll/deadlines.ts";
import { decideExtraTaxApprove, decideExtraTaxSubmit } from "@/lib/payroll/extra-tax.ts";
import { providerPayrollEnabled, payrollAlertsEnabled, payrollAlertsLiveEnabled } from "@/lib/features";
import { defaultUnifiedSettings } from "@/lib/unified-alerts.ts";
import { nid } from "@/lib/utils";

function off() {
  return { enabled: false as const, role: "denied" as const, facts: [] as ReturnType<typeof payrollAttentionFacts> };
}

async function centreRole(userId: string, daycareId: string) {
  const sql = await getSql();
  const { loadCentreRole } = await import("@/lib/server/centre-access");
  const role = await loadCentreRole(sql, userId, daycareId);
  return { sql, isOwner: role === "owner", role };
}

export const payrollAttention = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; locale?: string } | undefined) => ({
    daycareId: String(input?.daycareId || "").trim(),
    locale: input?.locale === "fr" ? "fr" as const : "en" as const,
  }))
  .handler(async ({ context, data }) => {
    if (!providerPayrollEnabled() || !payrollAlertsEnabled()) return off();
    const { isOwner } = await centreRole(context.userId, data.daycareId);
    const gate = decidePayBooks({ isOwner });
    if (!gate.ok) return off();
    return { enabled: true as const, role: "owner" as const, facts: payrollAttentionFacts([], data.locale) };
  });

export const payrollClock = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; employeeId?: string; action?: string }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    employeeId: String(input?.employeeId || "").trim(),
    action: input?.action === "out" ? "out" as const : "in" as const,
  }))
  .handler(async ({ context, data }) => {
    if (!providerPayrollEnabled()) throw new Error("payroll:off");
    const { sql, isOwner, role } = await centreRole(context.userId, data.daycareId);
    const rows = await sql<{ id: string; user_id: string | null }>`
      select id, user_id from payroll_employees
      where daycare_id = ${data.daycareId} and id = ${data.employeeId}
      limit 1
    `.catch(() => []);
    const employee = rows[0];
    if (!employee) throw new Error("payroll:missing");
    const gate = decideClock({
      isOwner,
      role: role === "owner" ? "owner" : role === "manager" ? "manager" : role === "staff" ? "staff" : "read_only",
      samePerson: employee.user_id === context.userId,
      manual: false,
    });
    if (!gate.ok) throw new Error(`payroll:${gate.reason}`);
    const id = nid();
    if (data.action === "in") {
      await sql`
        insert into payroll_punches (id, daycare_id, employee_id, clock_in_at, source, created_by)
        values (${id}, ${data.daycareId}, ${data.employeeId}, now(), 'phone', ${context.userId})
      `;
    } else {
      await sql`
        update payroll_punches
        set clock_out_at = now()
        where daycare_id = ${data.daycareId}
          and employee_id = ${data.employeeId}
          and clock_out_at is null
      `;
    }
    return staffHoursView({ id, rateCents: 0 });
  });

/** Plan owner notices and write dedupe keys. Does not send. */
export const payrollPlanNotices = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: String(input?.daycareId || "").trim() }))
  .handler(async ({ context, data }) => {
    if (!providerPayrollEnabled()) return { planned: 0, delivered: 0 };
    const { sql, isOwner } = await centreRole(context.userId, data.daycareId);
    if (!decidePayBooks({ isOwner }).ok) throw new Error("payroll:owner_only");
    const plans = planDeadlineNotices({
      today: new Date().toISOString().slice(0, 10),
      now: new Date(),
      deadlines: [],
      ownerUserId: context.userId,
      role: "owner",
      isOwner: true,
      locale: "en",
      sentKeys: [],
      settings: defaultUnifiedSettings("daycare", "America/Toronto"),
      payrollAlerts: payrollAlertsEnabled(),
      live: payrollAlertsLiveEnabled(),
      pushArmed: false,
      smsArmed: false,
      env: process.env,
    });
    let stored = 0;
    for (const plan of plans) {
      const result = deliverPayrollNotice(plan, { alerts: payrollAlertsEnabled(), live: payrollAlertsLiveEnabled() });
      if (result.delivered) continue;
      const inserted = await sql`
        insert into payroll_notice_log (dedupe_key, daycare_id, user_id, slot)
        values (${plan.dedupeKey}, ${data.daycareId}, ${context.userId}, ${plan.slot})
        on conflict (dedupe_key) do nothing
      `.catch(() => null);
      if (inserted) stored += 1;
    }
    const trust = sandboxAdapter().trustAccount({ daycareId: data.daycareId, holder: "payroll_partner" });
    if (!("ok" in trust)) {
      await sql`
        insert into payroll_trust_accounts (daycare_id, adapter_id, holder, account_ref)
        values (${data.daycareId}, 'sandbox', ${trust.holder}, ${trust.ref})
        on conflict (daycare_id) do nothing
      `.catch(() => undefined);
    }
    return { planned: plans.length, delivered: 0, stored };
  });

export const submitExtraTax = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; employeeId?: string; amountCents?: number; authority?: string }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    employeeId: String(input?.employeeId || "").trim(),
    amountCents: Math.max(0, Math.round(Number(input?.amountCents) || 0)),
    authority: input?.authority === "revenu_quebec" ? "revenu_quebec" as const : "cra" as const,
  }))
  .handler(async ({ context, data }) => {
    if (!providerPayrollEnabled()) throw new Error("payroll:off");
    const { sql, role } = await centreRole(context.userId, data.daycareId);
    const rows = await sql<{ id: string; user_id: string | null }>`
      select id, user_id from payroll_employees
      where daycare_id = ${data.daycareId} and id = ${data.employeeId}
      limit 1
    `.catch(() => []);
    const employee = rows[0];
    if (!employee) throw new Error("payroll:missing");
    const gate = decideExtraTaxSubmit({ samePerson: employee.user_id === context.userId, role });
    if (!gate.ok) throw new Error(`payroll:${gate.reason}`);
    const id = nid();
    await sql`
      insert into payroll_extra_tax_requests (id, daycare_id, employee_id, user_id, amount_cents, authority, status)
      values (${id}, ${data.daycareId}, ${data.employeeId}, ${context.userId}, ${data.amountCents}, ${data.authority}, 'pending')
    `;
    return { id, status: "pending" as const, sent: false as const };
  });

export const approveExtraTax = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; requestId?: string }) => ({
    daycareId: String(input?.daycareId || "").trim(),
    requestId: String(input?.requestId || "").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!providerPayrollEnabled()) throw new Error("payroll:off");
    const { sql, isOwner } = await centreRole(context.userId, data.daycareId);
    const gate = decideExtraTaxApprove({ isOwner });
    if (!gate.ok) throw new Error("payroll:owner_only");
    const rows = await sql<{ id: string; employee_id: string; amount_cents: number; authority: string }>`
      select id, employee_id, amount_cents, authority
      from payroll_extra_tax_requests
      where id = ${data.requestId} and daycare_id = ${data.daycareId} and status = 'pending'
      limit 1
    `.catch(() => []);
    const request = rows[0];
    if (!request) throw new Error("payroll:missing");
    await sql`
      update payroll_extra_tax_requests
      set status = 'approved', decided_by = ${context.userId}, decided_at = now()
      where id = ${request.id}
    `;
    await sql`
      update payroll_employees
      set extra_tax_cents = ${request.amount_cents}, extra_tax_authority = ${request.authority}
      where id = ${request.employee_id} and daycare_id = ${data.daycareId}
    `;
    return { approved: true as const, sent: false as const };
  });
