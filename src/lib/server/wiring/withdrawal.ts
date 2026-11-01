import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { splitFee, currentPeriod } from "@/lib/stripe-methods";
import { storedFeeCents } from "@/lib/wiring/common";
import { planWithdrawal, withdrawalEnabled, withdrawalMode } from "@/lib/wiring/withdrawal";
import { daycareUserIds, deliverNotice, newId } from "@/lib/server/wiring/runtime";

function dollars(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 20000) return null;
  return n;
}

export const saveNoticePeriod = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; noticeDays?: number }) => ({
    daycareId: String(input?.daycareId || "").slice(0, 80),
    noticeDays: Number(input?.noticeDays),
  }))
  .handler(async ({ context, data }) => {
    if (!withdrawalEnabled()) return { ok: false as const, error: "off" };
    if (!Number.isInteger(data.noticeDays) || data.noticeDays < 1 || data.noticeDays > 90) {
      return { ok: false as const, error: "notice" };
    }
    const sql = await getSql();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    if (!ids.includes(data.daycareId)) return { ok: false as const, error: "centre" };
    await sql`
      insert into daycare_notice_terms (daycare_id, notice_days)
      values (${data.daycareId}, ${data.noticeDays})
      on conflict (daycare_id) do update set notice_days = excluded.notice_days, updated_at = now()
    `;
    return { ok: true as const };
  });

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; ageGroup?: string; requestedOn?: string; lastDay?: string }) => ({
    daycareId: String(input?.daycareId || "").slice(0, 80),
    ageGroup: String(input?.ageGroup || "").slice(0, 20),
    requestedOn: String(input?.requestedOn || "").slice(0, 10),
    lastDay: String(input?.lastDay || "").slice(0, 10),
  }))
  .handler(async ({ context, data }) => {
    if (!withdrawalEnabled()) return { ok: false as const, error: "off" };
    const sql = await getSql();
    const centre = await sql<{
      province: string;
      spots_updated_at: string | null;
      infant_monthly: number | null;
      toddler_monthly: number | null;
      preschool_monthly: number | null;
      spots_infant: number | null;
      spots_toddler: number | null;
      spots_preschool: number | null;
    }>`
      select province, spots_updated_at, infant_monthly, toddler_monthly, preschool_monthly,
             spots_infant, spots_toddler, spots_preschool
      from daycares where id = ${data.daycareId} limit 1
    `;
    if (!centre[0]) return { ok: false as const, error: "centre" };
    const terms = await sql<{ notice_days: number }>`
      select notice_days from daycare_notice_terms where daycare_id = ${data.daycareId} limit 1
    `.catch(() => []);
    const fee = storedFeeCents({
      ageGroup: data.ageGroup,
      infantMonthly: dollars(centre[0].infant_monthly),
      toddlerMonthly: dollars(centre[0].toddler_monthly),
      preschoolMonthly: dollars(centre[0].preschool_monthly),
    });
    const plan = planWithdrawal({
      noticeDays: terms[0]?.notice_days ?? null,
      requestedOn: data.requestedOn,
      lastDay: data.lastDay,
      feeCents: "cents" in fee ? fee.cents : null,
      spotsTracked: Boolean(centre[0].spots_updated_at),
    });
    if (!plan.ok) return { ok: false as const, error: plan.error };
    const mode = withdrawalMode();
    let invoiceId: string | null = null;
    if (mode === "live" && plan.invoiceCents != null) {
      const amountCad = Math.round(plan.invoiceCents / 100);
      const split = splitFee(plan.invoiceCents);
      invoiceId = newId("bl");
      await sql`
        insert into invoices (
          id, number, parent_user_id, daycare_id, period, status, currency,
          subtotal, platform_fee, total, amount_cents, platform_fee_cents, net_cents,
          issued_by, memo, created_by
        ) values (
          ${invoiceId}, ${`KE-${invoiceId.slice(-8).toUpperCase()}`}, ${context.userId}, ${data.daycareId},
          ${currentPeriod()}, ${"draft"}, ${"cad"}, ${amountCad}, ${Math.round(split.platformFee / 100)}, ${amountCad},
          ${plan.invoiceCents}, ${split.platformFee}, ${split.net}, ${"provider"}, ${"Final invoice"}, ${context.userId}
        )
      `;
    }
    if (mode === "live" && plan.freeSpace) {
      const column =
        data.ageGroup === "infant" ? "spots_infant" : data.ageGroup === "toddler" ? "spots_toddler" : data.ageGroup === "preschool" ? "spots_preschool" : "";
      if (column === "spots_infant") {
        await sql`update daycares set spots_infant = spots_infant + 1, spots_updated_at = now() where id = ${data.daycareId}`;
      } else if (column === "spots_toddler") {
        await sql`update daycares set spots_toddler = spots_toddler + 1, spots_updated_at = now() where id = ${data.daycareId}`;
      } else if (column === "spots_preschool") {
        await sql`update daycares set spots_preschool = spots_preschool + 1, spots_updated_at = now() where id = ${data.daycareId}`;
      }
      const { queueAreaWaitlistMatch } = await import("@/lib/server/area-waitlist-job");
      queueAreaWaitlistMatch(data.daycareId, true);
    }
    await sql`
      insert into withdrawals (id, daycare_id, parent_user_id, age_group, requested_on, last_day, invoice_id, space_freed)
      values (
        ${newId("wd")}, ${data.daycareId}, ${context.userId}, ${data.ageGroup}, ${data.requestedOn},
        ${data.lastDay}, ${invoiceId}, ${mode === "live" && plan.freeSpace ? 1 : 0}
      )
    `;
    for (const userId of await daycareUserIds(data.daycareId)) {
      await deliverNotice({
        feature: "withdrawal",
        flag: "FEATURE_WITHDRAWAL",
        mode,
        userId,
        role: "provider",
        title: "Withdrawal notice",
        body: `Last day requested: ${plan.lastDay}.`,
        href: "/provider/withdrawal",
        senderUserId: context.userId,
        province: centre[0].province,
        wantSms: true,
      });
    }
    return { ok: true as const, plan, mode };
  });
