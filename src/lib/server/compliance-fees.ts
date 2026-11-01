import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { govAuthMiddleware } from "@/lib/auth/gov-middleware";
import { nid } from "@/lib/utils";
import { feeDecision, feeMode, monthlyNeedsDays } from "@/lib/compliance/fees";
import { centreRow, logPractice, ownedCentreIds, readScope, sqlClient } from "@/lib/server/compliance-common";
import { requireAdmin } from "@/lib/server/roles";

export async function recordFeeCheck(input: {
  daycareId: string;
  province: string;
  ageKey: string;
  dailyCents: number;
  userId: string;
  source: "page" | "listing" | "invoice";
}) {
  const mode = feeMode(process.env);
  if (mode === "off") return { status: "off" as const, delivery: "skip" as const };
  const decision = input.dailyCents > 0
    ? feeDecision({ mode, province: input.province, ageKey: input.ageKey, dailyCents: input.dailyCents })
    : { status: "unknown" as const, capCents: null, verified: false, delivery: "skip" as const };
  if (decision.delivery === "skip" && decision.status !== "warn") return decision;
  logPractice("FEATURE_FEE_CAPS", {
    action: input.source,
    daycareId: input.daycareId,
    province: input.province,
    ageKey: input.ageKey,
    status: decision.status,
    delivery: decision.delivery,
    mode,
  });
  if (decision.status === "warn") {
    const sql = await sqlClient();
    await sql`
      insert into fee_cap_flags (id, daycare_id, province, age_key, daily_cents, cap_cents, source, created_by)
      values (${nid("fee")}, ${input.daycareId}, ${input.province}, ${input.ageKey}, ${input.dailyCents}, ${decision.capCents}, ${input.source}, ${input.userId})
    `.catch(() => undefined);
  }
  return decision;
}

export async function noteMonthlyUnchecked(input: { daycareId: string; province: string; monthlyCents: number; userId: string; source: "listing" | "invoice" }) {
  const mode = feeMode(process.env);
  if (mode === "off" || !monthlyNeedsDays(input.monthlyCents)) return;
  logPractice("FEATURE_FEE_CAPS", { action: "need_day_count", daycareId: input.daycareId, province: input.province, source: input.source, mode });
}

export const loadCentreFees = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const mode = feeMode(process.env);
    if (mode === "off") return { enabled: false as const, mode, centres: [], rows: [] };
    const ids = await ownedCentreIds(context.userId);
    const sql = await sqlClient();
    const centres = ids.length
      ? await sql.query<{ id: string; name: string; province: string }>(`select id, name, province from daycares where id = any($1::text[]) order by name`, [ids]).catch(() => [])
      : [];
    const rows = ids.length
      ? await sql.query<{ age_key: string; daily_cents: number; cap_cents: number | null }>(
          `select age_key, daily_cents, cap_cents from fee_cap_flags where daycare_id = any($1::text[]) order by created_at desc limit 20`,
          [ids],
        ).catch(() => [])
      : [];
    return { enabled: true as const, mode, centres, rows };
  });

export const checkDailyFee = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; ageKey?: string; dailyDollars?: number }) => input)
  .handler(async ({ context, data }) => {
    const { blockViewAsSideEffect } = await import("@/lib/view-as-public");
    blockViewAsSideEffect("write");
    const mode = feeMode(process.env);
    if (mode === "off") return { ok: false as const, reason: "off" };
    const daycareId = String(data.daycareId || "").trim();
    const ids = await ownedCentreIds(context.userId);
    if (!ids.includes(daycareId)) return { ok: false as const, reason: "centre" };
    const sql = await sqlClient();
    const centre = await centreRow(sql, daycareId);
    if (!centre) return { ok: false as const, reason: "centre" };
    const dailyCents = Math.round(Number(data.dailyDollars) * 100);
    if (!Number.isFinite(dailyCents) || dailyCents < 0) return { ok: false as const, reason: "amount" };
    const decision = await recordFeeCheck({
      daycareId,
      province: centre.province,
      ageKey: String(data.ageKey || "preschool").slice(0, 40),
      dailyCents,
      userId: context.userId,
      source: "page",
    });
    return { ok: true as const, decision };
  });

async function govFlags(province: string) {
  const sql = await sqlClient();
  const rows = await sql<{ name: string; age_key: string; daily_cents: number; cap_cents: number | null }>`
    select d.name, f.age_key, f.daily_cents, f.cap_cents
    from fee_cap_flags f
    join daycares d on d.id = f.daycare_id
    where f.province = ${province}
    order by f.created_at desc
    limit 40
  `.catch(() => []);
  return rows;
}

export const loadGovFees = createServerFn({ method: "GET" })
  .middleware([govAuthMiddleware])
  .handler(async ({ context }) => {
    const mode = feeMode(process.env);
    const gov = context.gov as { province: string; userId: string };
    const scope = await readScope(gov.userId);
    const province = scope?.province || gov.province;
    if (mode === "off") return { enabled: false as const, mode, province, rows: [] };
    return { enabled: true as const, mode, province, rows: await govFlags(province) };
  });

export const loadAdminFees = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { province?: string } | undefined) => ({ province: String(input?.province || "ON").slice(0, 8) }))
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const mode = feeMode(process.env);
    if (mode === "off") return { enabled: false as const, mode, province: data.province, rows: [] };
    return { enabled: true as const, mode, province: data.province, rows: await govFlags(data.province) };
  });

export async function runFeeJob() {
  const mode = feeMode(process.env);
  if (mode === "off") return { ok: true, mode, flagged: 0 };
  logPractice("FEATURE_FEE_CAPS", { action: "scan", mode });
  return { ok: true, mode, flagged: 0 };
}
