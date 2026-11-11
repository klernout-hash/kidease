/**
 * One server path for KidEase signup leads.
 * Writes GoHighLevel contacts and opportunities only.
 * Does not send mail or text, and does not touch a centre CRM.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { postGhlCrmSignup } from "@/lib/ghl-api";
import { GHL_API_BASE, GHL_API_USER_AGENT, GHL_API_VERSION, ghlApiToken, resolveGhlApiTarget } from "@/lib/ghl-api";
import {
  TWILIO_LINE_TYPE_USD_PER_LOOKUP,
  ghlLeadPushEnabled,
  ghlLineTypeEnabled,
  reconcileGhlSignups,
  runLeadPush,
  type GhlSnapshot,
  type LeadPushInput,
  type LineType,
  type SignupCheck,
  type StoredLeadPush,
} from "@/lib/ghl-lead-push";
import { getSql } from "@/lib/db";
import { resolveAdminAccess } from "@/lib/server/roles";

type Sql = Awaited<ReturnType<typeof getSql>>;

function logLine(event: string, detail: Record<string, number | string>) {
  console.info(JSON.stringify({ event, ...detail }));
}

async function lookupLine(phone: string): Promise<{ valid?: boolean; type?: string | null; errorCode?: number | null } | null> {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!sid || !token || !ghlLineTypeEnabled(process.env)) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  const e164 = digits.startsWith("+") ? digits : digits.length === 10 ? `+1${digits}` : "";
  if (!e164) return { valid: false, type: null, errorCode: null };
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(
    `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`,
    { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(4000) },
  );
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    valid?: boolean;
    line_type_intelligence?: { type?: string | null; error_code?: number | null } | null;
  } | null;
  const line = json?.line_type_intelligence;
  return { valid: json?.valid, type: line?.type ?? null, errorCode: line?.error_code ?? null };
}

async function loadRow(sql: Sql, userId: string): Promise<StoredLeadPush | null> {
  const rows = await sql<{
    user_id: string;
    attempts: number;
    result: string;
    contact_id: string | null;
    opportunity_id: string | null;
    next_attempt_at: string | Date | null;
    line_type: LineType | null;
  }>`
    select user_id, attempts, result, contact_id, opportunity_id, next_attempt_at, line_type
    from ghl_lead_pushes where user_id = ${userId} limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const next = row.next_attempt_at instanceof Date ? row.next_attempt_at.toISOString() : row.next_attempt_at;
  return {
    userId: row.user_id,
    attempts: row.attempts,
    result: row.result,
    contactId: row.contact_id,
    opportunityId: row.opportunity_id,
    nextAttemptAt: next,
    lineType: row.line_type,
  };
}

export async function pushLeadToGhl(input: LeadPushInput, options?: { force?: boolean }) {
  if (!ghlLeadPushEnabled(process.env)) return { tookOver: false as const, reason: "flag-off" as const };
  try {
    const sql = await getSql();
    return await runLeadPush(input, {
      env: process.env,
      now: new Date().toISOString(),
      force: options?.force !== false,
      loadRow: (userId) => loadRow(sql, userId),
      lookupLine,
      saveRow: async (row) => {
        await sql`
          insert into ghl_lead_pushes (
            user_id, email, audience, trigger, contact_id, opportunity_id, result, attempts,
            line_type, next_attempt_at, last_error, created_at, updated_at
          ) values (
            ${row.userId}, ${row.email}, ${row.audience}, ${row.trigger}, ${row.contactId}, ${row.opportunityId},
            ${row.result}, ${row.attempts}, ${row.lineType}, ${row.nextAttemptAt}, ${row.lastError}, now(), now()
          )
          on conflict (user_id) do update set
            email = excluded.email,
            audience = excluded.audience,
            trigger = excluded.trigger,
            contact_id = coalesce(excluded.contact_id, ghl_lead_pushes.contact_id),
            opportunity_id = coalesce(excluded.opportunity_id, ghl_lead_pushes.opportunity_id),
            result = excluded.result,
            attempts = excluded.attempts,
            line_type = coalesce(excluded.line_type, ghl_lead_pushes.line_type),
            next_attempt_at = excluded.next_attempt_at,
            last_error = excluded.last_error,
            updated_at = now()
        `;
      },
      pushContact: async ({ extraTags, allowReviewer }) => {
        const result = await postGhlCrmSignup({
          trigger: input.trigger,
          email: input.email,
          name: input.name,
          phone: input.phone,
          company: input.company,
          testListing: input.testListing,
          extraTags,
          allowReviewer,
          env: process.env,
        });
        if (!result.ok) return { ok: false as const, error: result.error };
        if (result.skipped) return { ok: true as const, skipped: true as const, reason: result.reason };
        return {
          ok: true as const,
          skipped: false as const,
          contactId: result.contactId,
          opportunityId: result.opportunityId,
        };
      },
    });
  } catch (err) {
    logLine("ghl_lead_push_error", { ok: 0 });
    console.error("[kidease-ghl] lead push failed", err instanceof Error ? err.message : "failed");
    return { tookOver: false as const, reason: "flag-off" as const };
  }
}

type FetchImpl = typeof fetch;

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Version: GHL_API_VERSION,
    Accept: "application/json",
    "User-Agent": GHL_API_USER_AGENT,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** GET only. Used by the daily check. */
export async function readGhlSignup(email: string, fetchImpl: FetchImpl = fetch): Promise<GhlSnapshot> {
  const token = ghlApiToken(process.env);
  const locationId = resolveGhlApiTarget("parent", process.env).locationId;
  const empty: GhlSnapshot = { email, readError: true, contactId: null, opportunityId: null, welcomeEmailAt: null };
  if (!token) return empty;
  const contactRes = await fetchImpl(
    `${GHL_API_BASE}/contacts/search/duplicate?locationId=${encodeURIComponent(locationId)}&email=${encodeURIComponent(email)}`,
    { method: "GET", headers: authHeaders(token), signal: AbortSignal.timeout(4000) },
  ).catch(() => null);
  if (!contactRes?.ok) return empty;
  const contactJson = asRecord(await contactRes.json().catch(() => null));
  const nested = asRecord(contactJson?.contact);
  const list = Array.isArray(contactJson?.contacts) ? contactJson.contacts : [];
  const first = asRecord(list[0]);
  const contactId = String(nested?.id || first?.id || "").trim();
  if (!contactId) return { email, contactId: null, opportunityId: null, welcomeEmailAt: null };
  const target = resolveGhlApiTarget("parent", process.env);
  const oppRes = await fetchImpl(
    `${GHL_API_BASE}/opportunities/search?location_id=${encodeURIComponent(locationId)}&contact_id=${encodeURIComponent(contactId)}`,
    { method: "GET", headers: authHeaders(token), signal: AbortSignal.timeout(4000) },
  ).catch(() => null);
  let opportunityId: string | null = null;
  if (oppRes?.ok) {
    const oppJson = asRecord(await oppRes.json().catch(() => null));
    const opportunities = Array.isArray(oppJson?.opportunities) ? oppJson.opportunities : [];
    const found = opportunities.map(asRecord).find((row) => row && typeof row.id === "string");
    opportunityId = found && typeof found.id === "string" ? found.id : null;
    void target;
  }
  const talkRes = await fetchImpl(
    `${GHL_API_BASE}/conversations/search?locationId=${encodeURIComponent(locationId)}&contactId=${encodeURIComponent(contactId)}`,
    { method: "GET", headers: authHeaders(token), signal: AbortSignal.timeout(4000) },
  ).catch(() => null);
  let welcomeEmailAt: string | null = null;
  if (talkRes?.ok) {
    const talkJson = asRecord(await talkRes.json().catch(() => null));
    const conversations = Array.isArray(talkJson?.conversations) ? talkJson.conversations : [];
    for (const item of conversations) {
      const row = asRecord(item);
      if (!row) continue;
      const type = String(row.type || row.lastMessageType || "").toLowerCase();
      if (!type.includes("email")) continue;
      const at = String(row.dateAdded || row.lastMessageDate || "").trim();
      if (at && (!welcomeEmailAt || at < welcomeEmailAt)) welcomeEmailAt = at;
    }
  }
  return { email, contactId, opportunityId, welcomeEmailAt };
}

export async function runGhlLeadReconcile(options?: { retry?: boolean; fetchImpl?: FetchImpl }) {
  if (!ghlLeadPushEnabled(process.env)) {
    logLine("ghl_lead_reconcile", { skipped: 1, checked: 0, missing_contact: 0, missing_opportunity: 0, missing_welcome: 0, retried: 0 });
    return { ok: true as const, skipped: true as const, reason: "flag-off" as const };
  }
  const sql = await getSql();
  const signups = await sql<{ id: string; email: string; signed_up_at: string | Date }>`
    select u.id, u.email, coalesce(p.crm_signup_at, p.crm_provider_at, u."createdAt") as signed_up_at
    from "user" u
    left join profiles p on p.user_id = u.id
    where coalesce(p.crm_signup_at, p.crm_provider_at, u."createdAt") > now() - interval '48 hours'
      and u.email is not null
  `;
  const checks: SignupCheck[] = signups.map((row) => ({
    userId: row.id,
    email: row.email,
    signedUpAt: row.signed_up_at instanceof Date ? row.signed_up_at.toISOString() : String(row.signed_up_at),
  }));
  const snapshots = new Map<string, GhlSnapshot>();
  for (const signup of checks) {
    const key = signup.email.trim().toLowerCase();
    if (!snapshots.has(key)) snapshots.set(key, await readGhlSignup(key, options?.fetchImpl));
  }
  const report = reconcileGhlSignups(checks, snapshots, new Date().toISOString());
  let retried = 0;
  if (options?.retry) {
    const due = await sql<{ user_id: string; email: string; audience: string; trigger: string }>`
      select user_id, email, audience, trigger from ghl_lead_pushes
      where result <> 'ok' and attempts < 5 and (next_attempt_at is null or next_attempt_at <= now())
    `;
    for (const row of due) {
      const trigger = row.trigger === "claim_verify" || row.trigger === "provider_signup" ? row.trigger : "parent_signup";
      const pushed = await pushLeadToGhl(
        {
          userId: row.user_id,
          role: row.audience === "daycare" ? "provider" : "parent",
          trigger,
          email: row.email,
        },
        { force: false },
      );
      if (pushed.tookOver) retried += 1;
    }
  }
  const counts = {
    checked: report.checked,
    missing_contact: report.gaps.filter((gap) => gap.kind === "missing_contact").length,
    missing_opportunity: report.gaps.filter((gap) => gap.kind === "missing_opportunity").length,
    missing_welcome: report.gaps.filter((gap) => gap.kind === "missing_welcome").length,
    retried,
  };
  await sql`
    insert into ghl_lead_reconcile (id, ran_at, window_hours, checked, missing_contact, missing_opportunity, missing_welcome, retried, detail)
    values (
      ${`glr-${Date.now()}`}, now(), ${48}, ${counts.checked}, ${counts.missing_contact},
      ${counts.missing_opportunity}, ${counts.missing_welcome}, ${counts.retried}, ${JSON.stringify(report.gaps)}::jsonb
    )
  `;
  logLine("ghl_lead_reconcile", counts);
  return { ok: true as const, skipped: false as const, ...counts, readFailed: report.readFailed };
}

export const ghlLeadDesk = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await resolveAdminAccess(context.userId);
    if (!access.ok) return { ok: false as const, error: "not_allowed" as const };
    const sql = await getSql();
    const rows = await sql<{
      ran_at: string | Date;
      checked: number;
      missing_contact: number;
      missing_opportunity: number;
      missing_welcome: number;
      retried: number;
    }>`
      select ran_at, checked, missing_contact, missing_opportunity, missing_welcome, retried
      from ghl_lead_reconcile
      order by ran_at desc
      limit 1
    `.catch(() => []);
    const latest = rows[0];
    return {
      ok: true as const,
      enabled: ghlLeadPushEnabled(process.env),
      lineTypeEnabled: ghlLineTypeEnabled(process.env),
      lineTypeUsd: TWILIO_LINE_TYPE_USD_PER_LOOKUP,
      latest: latest
        ? {
            ranAt: latest.ran_at instanceof Date ? latest.ran_at.toISOString() : String(latest.ran_at),
            checked: latest.checked,
            missingContact: latest.missing_contact,
            missingOpportunity: latest.missing_opportunity,
            missingWelcome: latest.missing_welcome,
            retried: latest.retried,
          }
        : null,
    };
  });

export const retryGhlLeadPushes = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const access = await resolveAdminAccess(context.userId);
    if (!access.ok) return { ok: false as const, error: "not_allowed" as const };
    return runGhlLeadReconcile({ retry: true });
  });
