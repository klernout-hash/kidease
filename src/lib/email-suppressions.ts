/**
 * Bounce / complaint suppression list for outreach blasts.
 * Hard bounces (Permanent) and complaints upsert. Soft / temporary bounces are logged only.
 * No @/ imports — scripts/email-suppressions.test.mjs loads this file.
 */

export const SUPPRESSION_REASONS = ["bounce", "complaint", "manual", "unsubscribe"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const RESEND_HANDLED_EVENTS = [
  "email.bounced",
  "email.complained",
  "email.delivered",
  "email.delivery_delayed",
  "email.suppressed",
  "suppression.added",
  "suppression.removed",
] as const;

export type ResendHandledEvent = (typeof RESEND_HANDLED_EVENTS)[number];

/** Gmail / Yahoo outreach warning lines Kyle asked for. */
export const BOUNCE_RATE_WARN_PCT = 2;
export const COMPLAINT_RATE_WARN_PCT = 0.08;

export const SEARCH_ALERTS_CAMPAIGN_TAG = "search-alerts";

export const LIST_SUPPRESSIONS_SQL = "select email from email_suppressions order by email";

export type SqlLike = <T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<T[]>;

export type PlannedEmailAction = {
  email: string;
  eventType: ResendHandledEvent;
  reason: SuppressionReason | null;
  bounceType: string | null;
  bounceSubtype: string | null;
  resendEmailId: string | null;
  campaignTag: string | null;
  suppress: boolean;
  remove: boolean;
};

export function normalizeSuppressionEmail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 320 || !email.includes("@") || /\s/.test(email)) return "";
  return email;
}

export function isHardBounceType(bounceType: string | null | undefined): boolean {
  return (bounceType || "").trim().toLowerCase() === "permanent";
}

export function campaignTagFromPayload(data: Record<string, unknown>): string | null {
  const tags = data.tags;
  if (tags && typeof tags === "object" && !Array.isArray(tags)) {
    const row = tags as Record<string, unknown>;
    for (const key of ["campaign", "category"]) {
      const value = row[key];
      if (typeof value === "string" && value.trim()) return value.trim().slice(0, 120);
    }
  }
  return null;
}

function stringField(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 200) : null;
}

function bounceFields(data: Record<string, unknown>): { type: string | null; subType: string | null } {
  const bounce = data.bounce;
  if (!bounce || typeof bounce !== "object") return { type: null, subType: null };
  const row = bounce as Record<string, unknown>;
  const type = typeof row.type === "string" ? row.type.trim().slice(0, 80) : "";
  const subRaw = row.subType ?? row.subtype;
  const subType = typeof subRaw === "string" ? subRaw.trim().slice(0, 80) : "";
  return { type: type || null, subType: subType || null };
}

function recipientsOf(eventType: string, data: Record<string, unknown>): string[] {
  if (eventType.startsWith("suppression.")) {
    const email = normalizeSuppressionEmail(data.email);
    return email ? [email] : [];
  }
  const to = data.to;
  const raw = Array.isArray(to) ? to : typeof to === "string" ? [to] : [];
  const out: string[] = [];
  for (const item of raw) {
    const email = normalizeSuppressionEmail(item);
    if (email && !out.includes(email)) out.push(email);
  }
  return out;
}

function reasonFromOrigin(origin: string | null): SuppressionReason {
  const value = (origin || "").trim().toLowerCase();
  if (value === "bounce" || value === "complaint" || value === "manual" || value === "unsubscribe") return value;
  return "manual";
}

function reasonForAccountSuppression(data: Record<string, unknown>): SuppressionReason {
  const text = JSON.stringify(data.suppressed ?? "").toLowerCase();
  if (text.includes("complaint") || text.includes("spam")) return "complaint";
  if (text.includes("bounce")) return "bounce";
  return "manual";
}

function decisionFor(eventType: ResendHandledEvent, data: Record<string, unknown>): {
  reason: SuppressionReason | null;
  bounceType: string | null;
  bounceSubtype: string | null;
  suppress: boolean;
  remove: boolean;
} {
  if (eventType === "email.bounced") {
    const bounce = bounceFields(data);
    const hard = isHardBounceType(bounce.type);
    return {
      reason: hard ? "bounce" : null,
      bounceType: bounce.type,
      bounceSubtype: bounce.subType,
      suppress: hard,
      remove: false,
    };
  }
  if (eventType === "email.complained") {
    return { reason: "complaint", bounceType: null, bounceSubtype: null, suppress: true, remove: false };
  }
  if (eventType === "email.suppressed") {
    return {
      reason: reasonForAccountSuppression(data),
      bounceType: null,
      bounceSubtype: null,
      suppress: true,
      remove: false,
    };
  }
  if (eventType === "suppression.added") {
    return {
      reason: reasonFromOrigin(stringField(data, "origin")),
      bounceType: null,
      bounceSubtype: null,
      suppress: true,
      remove: false,
    };
  }
  if (eventType === "suppression.removed") {
    return {
      reason: reasonFromOrigin(stringField(data, "origin")),
      bounceType: null,
      bounceSubtype: null,
      suppress: false,
      remove: true,
    };
  }
  return { reason: null, bounceType: null, bounceSubtype: null, suppress: false, remove: false };
}

export function planResendActions(event: unknown): PlannedEmailAction[] {
  if (!event || typeof event !== "object") return [];
  const typeRaw = (event as { type?: unknown }).type;
  const type = typeof typeRaw === "string" ? typeRaw : "";
  if (!(RESEND_HANDLED_EVENTS as readonly string[]).includes(type)) return [];
  const eventType = type as ResendHandledEvent;
  const dataRaw = (event as { data?: unknown }).data;
  const data = dataRaw && typeof dataRaw === "object" ? (dataRaw as Record<string, unknown>) : {};
  const decision = decisionFor(eventType, data);
  const campaignTag = campaignTagFromPayload(data);
  const resendEmailId = stringField(data, "email_id") || stringField(data, "source_id");
  return recipientsOf(eventType, data).map((email) => ({
    email,
    eventType,
    reason: decision.reason,
    bounceType: decision.bounceType,
    bounceSubtype: decision.bounceSubtype,
    resendEmailId,
    campaignTag,
    suppress: decision.suppress,
    remove: decision.remove,
  }));
}

export function eventRowId(svixId: string, email: string, eventType: string): string {
  const base = (svixId || "").trim() || eventType;
  return `${base}:${email}`.slice(0, 200);
}

export type EmailHealthCounts = {
  delivered: number;
  bounced: number;
  complained: number;
};

export type EmailHealthRates = EmailHealthCounts & {
  bounceRate: number;
  complaintRate: number;
  warn: boolean;
};

export function emailHealthRates(counts: EmailHealthCounts): EmailHealthRates {
  const delivered = Math.max(0, counts.delivered);
  const bounced = Math.max(0, counts.bounced);
  const complained = Math.max(0, counts.complained);
  const attempts = delivered + bounced;
  const bounceRate = attempts > 0 ? (bounced / attempts) * 100 : 0;
  const complaintRate = delivered > 0 ? (complained / delivered) * 100 : complained > 0 ? 100 : 0;
  return {
    delivered,
    bounced,
    complained,
    bounceRate,
    complaintRate,
    warn: bounceRate >= BOUNCE_RATE_WARN_PCT || complaintRate >= COMPLAINT_RATE_WARN_PCT,
  };
}

export function clampHealthDays(raw: unknown): 7 | 30 {
  return Number(raw) === 30 ? 30 : 7;
}

export async function isSuppressedEmail(email: unknown, sql: SqlLike): Promise<boolean> {
  const normalized = normalizeSuppressionEmail(email);
  if (!normalized) return false;
  const rows = await sql<{ email: string }>`
    select email from email_suppressions where email = ${normalized} limit 1
  `;
  return rows.length > 0;
}

export async function listSuppressedEmails(sql: SqlLike): Promise<string[]> {
  const rows = await sql<{ email: string }>`
    select email from email_suppressions order by email
  `;
  return rows.map((row) => normalizeSuppressionEmail(row.email)).filter(Boolean);
}

export type EmailHealthCampaign = EmailHealthRates & { campaign: string };

export async function emailHealthStats(
  sql: SqlLike,
  daysInput: unknown,
): Promise<{ days: 7 | 30; suppressed: number; campaigns: EmailHealthCampaign[] }> {
  const days = clampHealthDays(daysInput);
  const counts = await sql<{ n: number }>`
    select count(*)::int as n from email_suppressions
  `;
  const rows = await sql<{
    campaign: string;
    delivered: number;
    bounced: number;
    complained: number;
  }>`
    select
      coalesce(nullif(campaign_tag, ''), '(untagged)') as campaign,
      count(*) filter (where event_type = 'email.delivered')::int as delivered,
      count(*) filter (
        where event_type = 'email.bounced' and lower(coalesce(bounce_type, '')) = 'permanent'
      )::int as bounced,
      count(*) filter (where event_type = 'email.complained')::int as complained
    from email_events
    where created_at >= now() - (${days} * interval '1 day')
    group by 1
    order by 1
  `;
  return {
    days,
    suppressed: Number(counts[0]?.n ?? 0) || 0,
    campaigns: rows.map((row) => ({
      campaign: row.campaign || "(untagged)",
      ...emailHealthRates({
        delivered: Number(row.delivered) || 0,
        bounced: Number(row.bounced) || 0,
        complained: Number(row.complained) || 0,
      }),
    })),
  };
}

export async function applyResendEmailEvent(input: {
  event: unknown;
  svixId?: string | null;
  sql: SqlLike;
  pushGhl?: (item: { email: string; reason: SuppressionReason }) => Promise<void>;
}): Promise<{ suppressed: string[]; removed: string[] }> {
  const actions = planResendActions(input.event);
  const suppressed: string[] = [];
  const removed: string[] = [];
  const svixId = (input.svixId || "").trim();

  for (const action of actions) {
    const id = eventRowId(svixId, action.email, action.eventType);
    await input.sql`
      insert into email_events (
        id, email, event_type, reason, bounce_type, bounce_subtype, resend_email_id, campaign_tag
      ) values (
        ${id},
        ${action.email},
        ${action.eventType},
        ${action.reason},
        ${action.bounceType},
        ${action.bounceSubtype},
        ${action.resendEmailId},
        ${action.campaignTag}
      )
      on conflict (id) do nothing
    `;

    if (action.remove) {
      await input.sql`delete from email_suppressions where email = ${action.email}`;
      removed.push(action.email);
      continue;
    }

    if (!action.suppress || !action.reason) continue;

    await input.sql`
      insert into email_suppressions (
        email, reason, bounce_type, bounce_subtype, resend_email_id, campaign_tag
      ) values (
        ${action.email},
        ${action.reason},
        ${action.bounceType},
        ${action.bounceSubtype},
        ${action.resendEmailId},
        ${action.campaignTag}
      )
      on conflict (email) do update set
        reason = case
          when email_suppressions.reason = 'complaint' and excluded.reason <> 'complaint'
            then email_suppressions.reason
          else excluded.reason
        end,
        bounce_type = coalesce(excluded.bounce_type, email_suppressions.bounce_type),
        bounce_subtype = coalesce(excluded.bounce_subtype, email_suppressions.bounce_subtype),
        resend_email_id = coalesce(excluded.resend_email_id, email_suppressions.resend_email_id),
        campaign_tag = coalesce(excluded.campaign_tag, email_suppressions.campaign_tag),
        updated_at = now()
    `;
    suppressed.push(action.email);
    if (!input.pushGhl) continue;
    try {
      await input.pushGhl({ email: action.email, reason: action.reason });
    } catch (err) {
      console.error("[kidease-ghl] suppression push failed", err instanceof Error ? err.message : err);
    }
  }

  return { suppressed, removed };
}
