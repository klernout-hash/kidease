import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { listAccessibleDaycareIds } from "@/lib/server/centre-access";
import { parentChargeQuote } from "@/lib/connect-payments";
import { currentPeriod } from "@/lib/stripe-methods";
import { storedFeeCents } from "@/lib/wiring/common";
import { planWithdrawal, withdrawalEnabled, withdrawalMode } from "@/lib/wiring/withdrawal";
import { daycareUserIds, deliverNotice, newId } from "@/lib/server/wiring/runtime";
import { cleanReason, withdrawalCancelable } from "@/lib/pipeline-features";
import type { Sql } from "@/lib/db";
import { withdrawalCancelledEmail, withdrawalNoticeEmail, withdrawalNoticeSms } from "@/lib/notification-templates";

/** Names for the centre's notice: parent, the enrolled child at this centre, and the centre. */
async function withdrawalPeople(sql: Sql, parentUserId: string, daycareId: string) {
  const rows = await sql<{ parent_name: string | null; child_name: string | null; centre_name: string | null }>`
    select u.name as parent_name, d.name as centre_name,
           (select ch.name from bookings b left join children ch on ch.id = b.child_id
             where b.user_id = ${parentUserId} and b.daycare_id = ${daycareId}
               and b.status in ('accepted', 'active')
             order by b.created_at desc limit 1) as child_name
    from "user" u cross join daycares d
    where u.id = ${parentUserId} and d.id = ${daycareId}
    limit 1
  `.catch(() => [] as { parent_name: string | null; child_name: string | null; centre_name: string | null }[]);
  return {
    parentName: rows[0]?.parent_name ?? null,
    childName: rows[0]?.child_name ?? null,
    centreName: rows[0]?.centre_name ?? "",
  };
}

const WITHDRAWAL_REASON_FEATURE = "withdrawal_reason";

type EnrolledCentre = { daycareId: string; daycareName: string; ageGroup: string; childName: string };

/** Centres where this family has an accepted or enrolled child. */
async function enrolledCentresFor(sql: Sql, userId: string): Promise<EnrolledCentre[]> {
  let homeId = userId;
  try {
    const { familyScopeFor } = await import("@/lib/server/coparent");
    homeId = (await familyScopeFor(userId)).dataUserId;
  } catch {
    homeId = userId;
  }
  const rows = await sql<{ daycare_id: string; name: string; age_group: string | null; child_name: string | null }>`
    select distinct on (b.daycare_id) b.daycare_id, d.name, b.age_group, ch.name as child_name
      from bookings b
      join daycares d on d.id = b.daycare_id
      left join children ch on ch.id = b.child_id
     where b.user_id in (${userId}, ${homeId})
       and b.status in ('accepted', 'active')
     order by b.daycare_id, b.created_at desc
  `.catch(() => []);
  return rows.map((row) => ({
    daycareId: row.daycare_id,
    daycareName: row.name,
    ageGroup: row.age_group || "preschool",
    childName: row.child_name || "",
  }));
}

async function reasonsFor(sql: Sql, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const rows = await sql<{ body: string }>`
    select body from wiring_notices where feature = ${WITHDRAWAL_REASON_FEATURE} order by created_at desc limit 500
  `.catch(() => []);
  const wanted = new Set(ids);
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.body) as { withdrawalId?: string; reason?: string };
      const id = String(parsed.withdrawalId || "");
      if (wanted.has(id) && !out.has(id)) out.set(id, cleanReason(parsed.reason));
    } catch {
      /* skip */
    }
  }
  return out;
}

function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Winnipeg" });
}

function isoDay(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || "").slice(0, 10);
}

export const listMyWithdrawalOptions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!withdrawalEnabled()) return { enabled: false as const, centres: [] as EnrolledCentre[], notices: [] };
    const sql = await getSql();
    const centres = await enrolledCentresFor(sql, context.userId);
    const rows = await sql<{ id: string; daycare_id: string; name: string; last_day: string | Date; requested_on: string | Date }>`
      select w.id, w.daycare_id, d.name, w.last_day, w.requested_on
        from withdrawals w
        join daycares d on d.id = w.daycare_id
       where w.parent_user_id = ${context.userId}
       order by w.created_at desc
       limit 20
    `.catch(() => []);
    const reasons = await reasonsFor(sql, rows.map((row) => row.id));
    const day = today();
    return {
      enabled: true as const,
      centres,
      notices: rows.map((row) => ({
        id: row.id,
        daycareId: row.daycare_id,
        daycareName: row.name,
        lastDay: isoDay(row.last_day),
        requestedOn: isoDay(row.requested_on),
        reason: reasons.get(row.id) || "",
        cancelable: withdrawalCancelable(isoDay(row.last_day), day),
      })),
    };
  });

/** Parent changes their mind: remove the notice and undo the freed space and draft final bill. */
export const cancelWithdrawal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string }) => ({ id: String(input?.id || "").slice(0, 80) }))
  .handler(async ({ context, data }) => {
    if (!withdrawalEnabled()) return { ok: false as const, error: "off" };
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      daycare_id: string;
      parent_user_id: string;
      age_group: string | null;
      last_day: string | Date;
      invoice_id: string | null;
      space_freed: number;
    }>`
      select id, daycare_id, parent_user_id, age_group, last_day, invoice_id, space_freed
        from withdrawals where id = ${data.id} limit 1
    `;
    const row = rows[0];
    if (!row || row.parent_user_id !== context.userId) return { ok: false as const, error: "not_found" };
    if (!withdrawalCancelable(isoDay(row.last_day), today())) return { ok: false as const, error: "past" };
    if (Number(row.space_freed) === 1) {
      if (row.age_group === "infant") {
        await sql`update daycares set spots_infant = spots_infant - 1, spots_updated_at = now() where id = ${row.daycare_id} and spots_infant > 0`;
      } else if (row.age_group === "toddler") {
        await sql`update daycares set spots_toddler = spots_toddler - 1, spots_updated_at = now() where id = ${row.daycare_id} and spots_toddler > 0`;
      } else if (row.age_group === "preschool") {
        await sql`update daycares set spots_preschool = spots_preschool - 1, spots_updated_at = now() where id = ${row.daycare_id} and spots_preschool > 0`;
      }
    }
    if (row.invoice_id) {
      await sql`delete from invoices where id = ${row.invoice_id} and status = 'draft'`.catch(() => undefined);
    }
    await sql`delete from withdrawals where id = ${row.id}`;
    const centre = await sql<{ province: string | null }>`select province from daycares where id = ${row.daycare_id} limit 1`.catch(() => []);
    const mode = withdrawalMode();
    const people = await withdrawalPeople(sql, context.userId, row.daycare_id);
    const lastDay = isoDay(row.last_day);
    for (const userId of await daycareUserIds(row.daycare_id)) {
      await deliverNotice({
        feature: "withdrawal",
        flag: "FEATURE_WITHDRAWAL",
        mode,
        userId,
        role: "provider",
        title: "Withdrawal notice cancelled",
        body: `A family cancelled their notice. Last day was ${isoDay(row.last_day)}.`,
        href: "/provider/withdrawal",
        senderUserId: context.userId,
        province: centre[0]?.province ?? null,
        compose: (locale) => ({ email: withdrawalCancelledEmail({ locale, ...people, lastDay }) }),
      });
    }
    return { ok: true as const };
  });

export const listCentreWithdrawals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!withdrawalEnabled()) return { enabled: false as const, rows: [] };
    const sql = await getSql();
    const ids = await listAccessibleDaycareIds(sql, context.userId);
    if (!ids.length) return { enabled: true as const, rows: [] };
    const rows = await sql.query<{
      id: string;
      daycare_id: string;
      name: string;
      parent_name: string | null;
      age_group: string | null;
      last_day: string | Date;
      requested_on: string | Date;
    }>(
      `select w.id, w.daycare_id, d.name, u.name as parent_name, w.age_group, w.last_day, w.requested_on
         from withdrawals w
         join daycares d on d.id = w.daycare_id
         left join "user" u on u.id = w.parent_user_id
        where w.daycare_id = any($1::text[])
        order by w.last_day asc
        limit 50`,
      [ids],
    ).catch(() => []);
    const reasons = await reasonsFor(sql, rows.map((row) => row.id));
    return {
      enabled: true as const,
      rows: rows.map((row) => ({
        id: row.id,
        daycareName: row.name,
        parentName: (row.parent_name || "").trim() || "Parent",
        ageGroup: row.age_group || "",
        lastDay: isoDay(row.last_day),
        requestedOn: isoDay(row.requested_on),
        reason: reasons.get(row.id) || "",
      })),
    };
  });

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
  .validator(
    (input: { daycareId?: string; ageGroup?: string; requestedOn?: string; lastDay?: string; reason?: string }) => ({
      daycareId: String(input?.daycareId || "").slice(0, 80),
      ageGroup: String(input?.ageGroup || "").slice(0, 20),
      requestedOn: String(input?.requestedOn || "").slice(0, 10) || new Date().toISOString().slice(0, 10),
      lastDay: String(input?.lastDay || "").slice(0, 10),
      reason: cleanReason(input?.reason),
    }),
  )
  .handler(async ({ context, data }) => {
    if (!withdrawalEnabled()) return { ok: false as const, error: "off" };
    const sql = await getSql();
    // Only a family with a child enrolled (or accepted) at this centre can give notice.
    const enrolled = await enrolledCentresFor(sql, context.userId);
    if (!enrolled.some((row) => row.daycareId === data.daycareId)) return { ok: false as const, error: "not_enrolled" };
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
      const quote = parentChargeQuote({ invoiceCents: plan.invoiceCents, daycareId: data.daycareId });
      invoiceId = newId("bl");
      await sql`
        insert into invoices (
          id, number, parent_user_id, daycare_id, period, status, currency,
          subtotal, platform_fee, total, amount_cents, platform_fee_cents, net_cents,
          issued_by, memo, created_by
        ) values (
          ${invoiceId}, ${`KE-${invoiceId.slice(-8).toUpperCase()}`}, ${context.userId}, ${data.daycareId},
          ${currentPeriod()}, ${"draft"}, ${"cad"}, ${amountCad}, ${Math.round(quote.kidEaseFeeCents / 100)}, ${amountCad},
          ${plan.invoiceCents}, ${quote.kidEaseFeeCents}, ${quote.centreReceivesCents}, ${"provider"}, ${"Final invoice"}, ${context.userId}
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
    const withdrawalId = newId("wd");
    await sql`
      insert into withdrawals (id, daycare_id, parent_user_id, age_group, requested_on, last_day, invoice_id, space_freed)
      values (
        ${withdrawalId}, ${data.daycareId}, ${context.userId}, ${data.ageGroup}, ${data.requestedOn},
        ${data.lastDay}, ${invoiceId}, ${mode === "live" && plan.freeSpace ? 1 : 0}
      )
    `;
    if (data.reason) {
      // The reason lives beside the notice (no new column). Only the family and the centre read it.
      await sql`
        insert into wiring_notices (id, feature, user_id, channel, mode, body)
        values (${newId("wn")}, ${WITHDRAWAL_REASON_FEATURE}, ${context.userId}, ${"record"}, ${"record"},
                ${JSON.stringify({ withdrawalId, reason: data.reason })})
      `.catch(() => undefined);
    }
    const people = await withdrawalPeople(sql, context.userId, data.daycareId);
    for (const userId of await daycareUserIds(data.daycareId)) {
      await deliverNotice({
        feature: "withdrawal",
        flag: "FEATURE_WITHDRAWAL",
        mode,
        userId,
        role: "provider",
        title: "Withdrawal notice",
        body: `Last day requested: ${plan.lastDay}.${data.reason ? ` Reason: ${data.reason}` : ""}`,
        href: "/provider/withdrawal",
        senderUserId: context.userId,
        province: centre[0].province,
        wantSms: true,
        compose: (locale) => {
          const facts = { locale, ...people, lastDay: plan.lastDay, reason: data.reason || null };
          return { email: withdrawalNoticeEmail(facts), sms: withdrawalNoticeSms(facts) };
        },
      });
    }
    return { ok: true as const, plan, mode };
  });
