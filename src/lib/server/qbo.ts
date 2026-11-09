import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { nid } from "@/lib/utils";
import {
  qboApiHost,
  qboAuthorizeUrl,
  qboJournal,
  qboJournalBalances,
  qboJournalBody,
  qboMissingEnv,
  qboTokenRequest,
  type QboAccountMap,
  type QboJournalLine,
} from "@/lib/qbo-sync";
import { openQboToken, sealQboToken } from "@/lib/qbo-seal";

type Sql = Awaited<ReturnType<typeof getSql>>;

async function ownsDaycare(sql: Sql, userId: string, daycareId: string) {
  const rows = await sql<{ id: string }>`
    select d.id
    from daycares d
    join provider_daycares p on p.daycare_id = d.id
    where d.id = ${daycareId} and p.user_id = ${userId}
    limit 1
  `;
  return rows.length > 0;
}

async function sentDocs(sql: Sql, daycareId: string) {
  const rows = await sql<{ doc_number: string }>`
    select doc_number from qbo_exports where daycare_id = ${daycareId}
  `;
  return new Set(rows.map((row) => row.doc_number));
}

function publicStatus() {
  const missing = qboMissingEnv();
  const environment = String(process.env.INTUIT_ENVIRONMENT || "").trim();
  return {
    configured: missing.length === 0,
    missing,
    environment: environment === "sandbox" || environment === "production" ? environment : "",
  };
}

export const qboStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: String(input?.daycareId || "") }))
  .handler(async ({ data, context }) => {
    const base = publicStatus();
    if (!data.daycareId) return { ...base, connected: false };
    const sql = await getSql();
    if (!(await ownsDaycare(sql, context.userId, data.daycareId))) return { ...base, connected: false };
    const rows = await sql<{ environment: string }>`
      select environment from qbo_connections where daycare_id = ${data.daycareId} limit 1
    `;
    return { ...base, connected: rows.length > 0, environment: rows[0]?.environment || base.environment };
  });

export const startQboConnect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: String(input?.daycareId || "") }))
  .handler(async ({ data, context }) => {
    const missing = qboMissingEnv();
    if (missing.length) return { ok: false as const, missing };
    const sql = await getSql();
    if (!(await ownsDaycare(sql, context.userId, data.daycareId))) return { ok: false as const, missing: [] as string[], reason: "owner" as const };
    const state = nid();
    await sql`
      insert into qbo_oauth_states (state, user_id, daycare_id, expires_at)
      values (${state}, ${context.userId}, ${data.daycareId}, now() + interval '15 minutes')
    `;
    return {
      ok: true as const,
      url: qboAuthorizeUrl({
        clientId: String(process.env.INTUIT_CLIENT_ID),
        redirectUri: String(process.env.INTUIT_REDIRECT_URI),
        state,
      }),
    };
  });

export const finishQboConnect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { code?: string; state?: string; realmId?: string }) => ({
    code: String(input?.code || "").slice(0, 512),
    state: String(input?.state || "").slice(0, 80),
    realmId: String(input?.realmId || "").slice(0, 64),
  }))
  .handler(async ({ data, context }) => {
    const missing = qboMissingEnv();
    if (missing.length) return { ok: false as const, missing };
    if (!data.code || !data.state || !data.realmId) return { ok: false as const, reason: "callback" as const };
    const sql = await getSql();
    const pending = await sql<{ daycare_id: string }>`
      delete from qbo_oauth_states
      where state = ${data.state}
        and user_id = ${context.userId}
        and expires_at > now()
      returning daycare_id
    `;
    const daycareId = pending[0]?.daycare_id;
    if (!daycareId || !(await ownsDaycare(sql, context.userId, daycareId))) {
      return { ok: false as const, reason: "state" as const };
    }
    const request = qboTokenRequest({
      clientId: String(process.env.INTUIT_CLIENT_ID),
      clientSecret: String(process.env.INTUIT_CLIENT_SECRET),
      code: data.code,
      redirectUri: String(process.env.INTUIT_REDIRECT_URI),
    });
    let tokens: { access_token?: string; refresh_token?: string; expires_in?: number };
    try {
      const response = await fetch(request.url, { method: "POST", headers: request.headers, body: request.body });
      if (!response.ok) return { ok: false as const, reason: "intuit" as const };
      tokens = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    } catch {
      return { ok: false as const, reason: "intuit" as const };
    }
    const access = sealQboToken(String(tokens.access_token || ""));
    const refresh = sealQboToken(String(tokens.refresh_token || ""));
    if (!access || !refresh) return { ok: false as const, reason: "seal" as const };
    const environment = String(process.env.INTUIT_ENVIRONMENT);
    const expiresAt = new Date(Date.now() + (Number(tokens.expires_in) || 3600) * 1000).toISOString();
    await sql`
      insert into qbo_connections (
        daycare_id, user_id, realm_id, access_token, refresh_token, access_expires_at, environment
      ) values (
        ${daycareId},
        ${context.userId},
        ${data.realmId},
        ${access},
        ${refresh},
        ${expiresAt},
        ${environment}
      )
      on conflict (daycare_id) do update set
        user_id = excluded.user_id,
        realm_id = excluded.realm_id,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        access_expires_at = excluded.access_expires_at,
        environment = excluded.environment,
        updated_at = now()
    `;
    return { ok: true as const, daycareId };
  });

export const disconnectQbo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: String(input?.daycareId || "") }))
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    if (!(await ownsDaycare(sql, context.userId, data.daycareId))) return { ok: false as const };
    await sql`delete from qbo_connections where daycare_id = ${data.daycareId} and user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const saveQboAccounts = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string; accounts?: QboAccountMap }) => ({
    daycareId: String(input?.daycareId || ""),
    accounts: {
      parent_fees: String(input?.accounts?.parent_fees || "").replace(/\D/g, "").slice(0, 20),
      stripe_clearing: String(input?.accounts?.stripe_clearing || "").replace(/\D/g, "").slice(0, 20),
      platform_fee: String(input?.accounts?.platform_fee || "").replace(/\D/g, "").slice(0, 20),
      gst_itc: String(input?.accounts?.gst_itc || "").replace(/\D/g, "").slice(0, 20),
    },
  }))
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    if (!(await ownsDaycare(sql, context.userId, data.daycareId))) return { ok: false as const };
    const rows = await sql`
      update qbo_connections
      set account_map = ${JSON.stringify(data.accounts)}::jsonb, updated_at = now()
      where daycare_id = ${data.daycareId} and user_id = ${context.userId}
      returning daycare_id
    `;
    return { ok: rows.length > 0 };
  });

function accountMap(value: unknown): QboAccountMap {
  const raw = typeof value === "string" ? safeJson(value) : value;
  if (!raw || typeof raw !== "object") return {};
  const row = raw as Record<string, unknown>;
  return {
    parent_fees: String(row.parent_fees || ""),
    stripe_clearing: String(row.stripe_clearing || ""),
    platform_fee: String(row.platform_fee || ""),
    gst_itc: String(row.gst_itc || ""),
  };
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function paidDay(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || "").slice(0, 10);
}

async function recentJournals(sql: Sql, daycareId: string): Promise<{ doc: string; date: string; lines: QboJournalLine[] }[]> {
  const rows = await sql<{
    id: string;
    total: number;
    platform_fee: number;
    amount_cents: number | null;
    platform_fee_cents: number | null;
    province: string | null;
    paid_at: string | null;
  }>`
    select i.id, i.total, i.platform_fee, i.amount_cents, i.platform_fee_cents, d.province, i.paid_at
    from invoices i
    join daycares d on d.id = i.daycare_id
    where i.daycare_id = ${daycareId}
      and i.status = 'paid'
      and i.paid_at is not null
    order by i.paid_at desc
    limit 25
  `;
  return rows.map((row) => ({
    doc: `KE-${row.id}`.slice(0, 21),
    date: paidDay(row.paid_at),
    lines: qboJournal({
      invoiceCents: row.amount_cents != null ? Number(row.amount_cents) : Math.round(Number(row.total) * 100),
      feeCents: row.platform_fee_cents != null ? Number(row.platform_fee_cents) : Math.round(Number(row.platform_fee) * 100),
      province: String(row.province || ""),
    }),
  }));
}

export const previewQboExport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: String(input?.daycareId || "") }))
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    if (!(await ownsDaycare(sql, context.userId, data.daycareId))) return { ok: false as const, rows: [] as { doc: string; debit: number; credit: number; sent: boolean }[] };
    const journals = await recentJournals(sql, data.daycareId);
    const sent = await sentDocs(sql, data.daycareId);
    return {
      ok: true as const,
      rows: journals.map((journal) => ({
        doc: journal.doc,
        debit: journal.lines.reduce((sum, line) => sum + line.debitCents, 0),
        credit: journal.lines.reduce((sum, line) => sum + line.creditCents, 0),
        balanced: qboJournalBalances(journal.lines),
        sent: sent.has(journal.doc),
      })),
    };
  });

export const syncQboExport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId?: string }) => ({ daycareId: String(input?.daycareId || "") }))
  .handler(async ({ data, context }) => {
    const missing = qboMissingEnv();
    if (missing.length) return { ok: false as const, missing };
    const sql = await getSql();
    if (!(await ownsDaycare(sql, context.userId, data.daycareId))) return { ok: false as const, reason: "owner" as const };
    const rows = await sql<{ realm_id: string; access_token: string; environment: string; account_map: QboAccountMap }>`
      select realm_id, access_token, environment, account_map
      from qbo_connections
      where daycare_id = ${data.daycareId} and user_id = ${context.userId}
      limit 1
    `;
    const connection = rows[0];
    if (!connection) return { ok: false as const, reason: "connect" as const };
    const token = openQboToken(connection.access_token);
    const accounts = accountMap(connection.account_map);
    if (!token) return { ok: false as const, reason: "seal" as const };
    const sent = await sentDocs(sql, data.daycareId);
    const journals = (await recentJournals(sql, data.daycareId)).filter((journal) => !sent.has(journal.doc));
    let posted = 0;
    for (const journal of journals) {
      if (journal.lines.every((line) => line.debitCents === 0 && line.creditCents === 0)) continue;
      const built = qboJournalBody({
        lines: journal.lines,
        accounts,
        txnDate: journal.date || new Date().toISOString().slice(0, 10),
        docNumber: journal.doc,
      });
      if (!built.ok) return { ok: false as const, reason: "map" as const, missingAccounts: built.missing };
      const url = `${qboApiHost(connection.environment)}/v3/company/${encodeURIComponent(connection.realm_id)}/journalentry`;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(built.body),
        });
        if (!response.ok) return { ok: false as const, reason: "intuit" as const, posted };
      } catch {
        return { ok: false as const, reason: "intuit" as const, posted };
      }
      await sql`
        insert into qbo_exports (daycare_id, doc_number)
        values (${data.daycareId}, ${journal.doc})
        on conflict (daycare_id, doc_number) do nothing
      `;
      posted += 1;
    }
    return { ok: true as const, posted };
  });
